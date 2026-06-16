import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { scorePrediction, type PredictionInput } from '@/lib/scoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { snapshotLeagueRanks } from '@/lib/snapshot'

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { data: { user } } = await supabase.auth.getUser()
  const { allowed, retryAfterMs } = checkRateLimit(`score-match:${user?.id ?? 'anon'}`)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 60000) / 1000)) } })

  const serviceSupabase = createServiceSupabaseClient()

  let match_id: string | undefined
  try { match_id = (await request.json()).match_id } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!match_id || typeof match_id !== 'string') return NextResponse.json({ error: 'match_id is required' }, { status: 400 })

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, real_home_score, real_away_score, first_goal_team, first_goal_player_id, gw_number')
    .eq('id', match_id)
    .single()
  if (matchErr || !match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const m = match as unknown as {
    home_team: string; away_team: string
    real_home_score: number | null; real_away_score: number | null
    first_goal_team: string | null; first_goal_player_id: number | null
    gw_number: number | null
  }
  if (m.real_home_score === null || m.real_away_score === null) {
    return NextResponse.json({ error: 'Match has no real scores yet' }, { status: 422 })
  }

  const result = {
    home_team: m.home_team, away_team: m.away_team,
    real_home_score: m.real_home_score, real_away_score: m.real_away_score,
    first_goal_team: m.first_goal_team, first_goal_player_id: m.first_goal_player_id,
  }

  const { data: predictions, error: predsErr } = await serviceSupabase
    .from('predictions')
    .select('user_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer')
    .eq('match_id', match_id)
  if (predsErr) return NextResponse.json({ error: predsErr.message }, { status: 500 })
  if (!predictions || predictions.length === 0) return NextResponse.json({ match_id, scored: 0 })

  type PredRow = PredictionInput & { user_id: string }
  const updates = (predictions as unknown as PredRow[]).map((p) => {
    const b = scorePrediction(p, result)
    return {
      user_id: p.user_id,
      match_id,
      pred_home: p.pred_home,
      pred_away: p.pred_away,
      points_awarded: b.total,
      pts_outcome: b.outcome, pts_exact: b.exact, pts_goal_diff: b.goalDiff,
      pts_total_goals: b.totalGoals, pts_team_goals: b.teamGoals, pts_btts: b.btts,
      pts_first_team: b.firstTeam, pts_first_scorer: b.firstScorer,
    }
  })

  const { error: upsertErr } = await serviceSupabase.from('predictions').upsert(updates, { onConflict: 'user_id,match_id' })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Audit log — fire and forget
  serviceSupabase.from('scoring_events').insert({
    triggered_by: user!.id,
    event_type: 'match',
    subject_id: match_id,
    pts_distributed: updates.reduce((s, u) => s + (u.points_awarded ?? 0), 0),
    scored_count: updates.length,
  }).then(() => {})

  // Push notification — fire and forget
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const home = m.home_team, away = m.away_team
    const score = `${m.real_home_score}–${m.real_away_score}`
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY! },
      body: JSON.stringify({ title: `${home} ${score} ${away}`, body: 'Result in — your points have been updated.', url: '/predictions' }),
    }).catch(() => {})
  }

  // Auto-snapshot when all matches in this GW are now scored
  if (m.gw_number != null) {
    const { count } = await serviceSupabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('gw_number', m.gw_number)
      .is('real_home_score', null)
    if (count === 0) {
      try {
        const snap = await snapshotLeagueRanks(serviceSupabase, m.gw_number)
        if (snap.overtakes.length > 0 && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
          for (const o of snap.overtakes) {
            fetch(`${siteUrl}/api/push/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY! },
              body: JSON.stringify({
                title: "You've been overtaken",
                body: `You're now ${ordinal(o.newRank)} on the leaderboard — time to close the gap.`,
                url: '/leaderboard',
                userIds: [o.userId],
              }),
            }).catch(() => {})
          }
        }
      } catch {}
    }
  }

  return NextResponse.json({ match_id, scored: updates.length })
}
