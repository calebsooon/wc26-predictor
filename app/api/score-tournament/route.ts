import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { TOURNAMENT_POINTS } from '@/lib/scoring'

const ROUND_IDS = {
  QF: '00000000-0000-0000-0000-000000000004',
  SF: '00000000-0000-0000-0000-000000000005',
  FIN: '00000000-0000-0000-0000-000000000007',
}

export async function POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('home_team, away_team, real_home_score, real_away_score, round_id')
    .in('round_id', Object.values(ROUND_IDS))
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  let champion: string | null = null
  let runner_up: string | null = null
  const actualSemis = new Set<string>()
  const actualQuarters = new Set<string>()

  for (const m of (matches ?? []) as { home_team: string; away_team: string; real_home_score: number | null; real_away_score: number | null; round_id: string }[]) {
    if (m.round_id === ROUND_IDS.QF) {
      actualQuarters.add(m.home_team)
      actualQuarters.add(m.away_team)
    }
    if (m.round_id === ROUND_IDS.SF) {
      actualSemis.add(m.home_team)
      actualSemis.add(m.away_team)
    }
    if (m.round_id === ROUND_IDS.FIN && m.real_home_score != null && m.real_away_score != null) {
      champion = m.real_home_score > m.real_away_score ? m.home_team : m.away_team
      runner_up = m.real_home_score > m.real_away_score ? m.away_team : m.home_team
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
    updated: updates.length,
    champion,
    runner_up,
    semi_count: actualSemis.size,
    quarter_count: actualQuarters.size,
  })
}
