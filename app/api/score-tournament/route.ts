import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { TOURNAMENT_POINTS } from '@/lib/scoring'

const ROUND_IDS = {
  QF: '00000000-0000-0000-0000-000000000004',
  SF: '00000000-0000-0000-0000-000000000005',
  FIN: '00000000-0000-0000-0000-000000000007',
}

const PLACEHOLDER = 'TBC'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('home_team, away_team, real_home_score, real_away_score, match_winner, round_id')
    .in('round_id', Object.values(ROUND_IDS))
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  let champion: string | null = null
  let runner_up: string | null = null
  const actualSemis = new Set<string>()
  const actualQuarters = new Set<string>()

  for (const m of (matches ?? []) as {
    home_team: string; away_team: string
    real_home_score: number | null; real_away_score: number | null
    match_winner: string | null; round_id: string
  }[]) {
    const home = m.home_team, away = m.away_team

    // Skip fixtures that still have placeholder teams (not yet confirmed)
    const hasRealTeams = home !== PLACEHOLDER && away !== PLACEHOLDER && !!home && !!away

    if (m.round_id === ROUND_IDS.QF && hasRealTeams) {
      actualQuarters.add(home)
      actualQuarters.add(away)
    }

    if (m.round_id === ROUND_IDS.SF && hasRealTeams) {
      actualSemis.add(home)
      actualSemis.add(away)
    }

    if (m.round_id === ROUND_IDS.FIN && hasRealTeams && m.real_home_score != null && m.real_away_score != null) {
      const rh = m.real_home_score, ra = m.real_away_score
      // Use match_winner if admin set it (penalty shootout winner), otherwise derive from score
      const winner = m.match_winner ?? (rh > ra ? home : ra > rh ? away : null)
      if (winner) {
        champion = winner
        runner_up = winner === home ? away : home
      }
    }
  }

  const { data: preds, error: pErr } = await supabase.from('tournament_predictions').select('*')
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!preds || preds.length === 0) return NextResponse.json({ updated: 0 })

  const updates = (preds as Record<string, unknown>[]).map((pred) => {
    const u: Record<string, unknown> = { user_id: pred.user_id }
    if (champion !== null) u.pts_champion = pred.champion === champion ? TOURNAMENT_POINTS.champion : 0
    if (runner_up !== null) u.pts_runner_up = pred.runner_up === runner_up ? TOURNAMENT_POINTS.runner_up : 0
    if (actualSemis.size > 0) {
      const hits = ((pred.semi as string[]) ?? []).filter((t) => actualSemis.has(t)).length
      u.pts_semi = hits * TOURNAMENT_POINTS.semi
    }
    if (actualQuarters.size > 0) {
      const hits = ((pred.quarter as string[]) ?? []).filter((t) => actualQuarters.has(t)).length
      u.pts_quarter = hits * TOURNAMENT_POINTS.quarter
    }
    return u
  })

  const { error: uErr } = await supabase.from('tournament_predictions').upsert(updates, { onConflict: 'user_id' })
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  return NextResponse.json({
    updated: updates.length, champion, runner_up,
    semi_count: actualSemis.size, quarter_count: actualQuarters.size,
  })
}
