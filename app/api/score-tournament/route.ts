import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { TOURNAMENT_POINTS } from '@/lib/scoring'
import { checkRateLimit } from '@/lib/rate-limit'
import { snapshotLeagueRanks } from '@/lib/snapshot'

const ROUND_IDS = {
  R32: '00000000-0000-0000-0000-000000000002',
  R16: '00000000-0000-0000-0000-000000000003',
  QF: '00000000-0000-0000-0000-000000000004',
  SF: '00000000-0000-0000-0000-000000000005',
  FIN: '00000000-0000-0000-0000-000000000007',
}

const PLACEHOLDER = 'TBC'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { data: { user } } = await supabase.auth.getUser()
  const { allowed, retryAfterMs } = checkRateLimit(`score-tournament:${user?.id ?? 'anon'}`)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 60000) / 1000)) } })

  const serviceSupabase = createServiceSupabaseClient()

  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('home_team, away_team, real_home_score, real_away_score, match_winner, round_id')
    .in('round_id', Object.values(ROUND_IDS))
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  let champion: string | null = null
  let runner_up: string | null = null
  const actualR32 = new Set<string>()   // 16 teams advancing from R32 to R16
  const actualQuarters = new Set<string>() // 8 teams in QF (advancing from R16)
  const actualSemis = new Set<string>()    // 4 teams in SF (advancing from QF)

  for (const m of (matches ?? []) as {
    home_team: string; away_team: string
    real_home_score: number | null; real_away_score: number | null
    match_winner: string | null; round_id: string
  }[]) {
    const home = m.home_team, away = m.away_team
    const hasRealTeams = home !== PLACEHOLDER && away !== PLACEHOLDER && !!home && !!away
    const hasScore = m.real_home_score != null && m.real_away_score != null

    // Teams appearing in R16 fixtures = teams that advanced from R32
    if (m.round_id === ROUND_IDS.R16 && hasRealTeams) {
      actualR32.add(home)
      actualR32.add(away)
    }

    // Teams appearing in QF fixtures = teams that advanced from R16
    if (m.round_id === ROUND_IDS.QF && hasRealTeams) {
      actualQuarters.add(home)
      actualQuarters.add(away)
    }

    // Teams appearing in SF fixtures = teams that advanced from QF
    if (m.round_id === ROUND_IDS.SF && hasRealTeams) {
      actualSemis.add(home)
      actualSemis.add(away)
    }

    if (m.round_id === ROUND_IDS.FIN && hasRealTeams && hasScore) {
      const rh = m.real_home_score!, ra = m.real_away_score!
      const winner = m.match_winner ?? (rh > ra ? home : ra > rh ? away : null)
      if (winner) {
        champion = winner
        runner_up = winner === home ? away : home
      }
    }
  }

  const { data: preds, error: pErr } = await serviceSupabase.from('tournament_predictions').select('*')
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!preds || preds.length === 0) return NextResponse.json({ updated: 0 })

  const updates = (preds as Record<string, unknown>[]).map((pred) => {
    const u: Record<string, unknown> = { user_id: pred.user_id, phase: pred.phase ?? 'r32' }
    if (actualR32.size > 0) {
      const hits = ((pred.r32 as string[]) ?? []).filter((t) => actualR32.has(t)).length
      u.pts_r32 = hits * TOURNAMENT_POINTS.r32
    }
    if (actualQuarters.size > 0) {
      const hits = ((pred.quarter as string[]) ?? []).filter((t) => actualQuarters.has(t)).length
      u.pts_quarter = hits * TOURNAMENT_POINTS.quarter
    }
    if (actualSemis.size > 0) {
      const hits = ((pred.semi as string[]) ?? []).filter((t) => actualSemis.has(t)).length
      u.pts_semi = hits * TOURNAMENT_POINTS.semi
    }
    if (runner_up !== null) u.pts_runner_up = pred.runner_up === runner_up ? TOURNAMENT_POINTS.runner_up : 0
    if (champion !== null) u.pts_champion = pred.champion === champion ? TOURNAMENT_POINTS.champion : 0
    return u
  })

  const { error: uErr } = await serviceSupabase.from('tournament_predictions').upsert(updates, { onConflict: 'user_id,phase' })
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  serviceSupabase.from('scoring_events').insert({
    triggered_by: user!.id,
    event_type: 'tournament',
    subject_id: null,
    pts_distributed: null,
    scored_count: updates.length,
  }).then(() => {})

  try { await snapshotLeagueRanks(serviceSupabase) } catch {}

  return NextResponse.json({
    updated: updates.length, champion, runner_up,
    r32_count: actualR32.size, quarter_count: actualQuarters.size,
    semi_count: actualSemis.size,
  })
}
