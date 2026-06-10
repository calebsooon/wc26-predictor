import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { scoreGroupPrediction } from '@/lib/scoring'

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

interface GroupMatch {
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  group_name: string
}

function buildActualOrder(matches: GroupMatch[], group: string): string[] {
  const map = new Map<string, { pts: number; gd: number; gf: number }>()
  const ensure = (t: string) => {
    if (!map.has(t)) map.set(t, { pts: 0, gd: 0, gf: 0 })
    return map.get(t)!
  }
  for (const m of matches) {
    if (m.group_name !== group) continue
    ensure(m.home_team); ensure(m.away_team)
    if (m.real_home_score == null || m.real_away_score == null) continue
    const h = ensure(m.home_team), a = ensure(m.away_team)
    const rh = m.real_home_score, ra = m.real_away_score
    h.gf += rh; h.gd += rh - ra
    a.gf += ra; a.gd += ra - rh
    if (rh > ra) h.pts += 3
    else if (ra > rh) a.pts += 3
    else { h.pts++; a.pts++ }
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    .map(([code]) => code)
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let group_name: string | undefined
  try { group_name = (await req.json()).group_name } catch {}
  const groupsToScore = group_name ? [group_name] : GROUPS

  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('home_team, away_team, real_home_score, real_away_score, group_name')
    .not('group_name', 'is', null)
  if (mErr || !matches) return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 })

  let predictionsUpdated = 0
  const results: Record<string, { skipped?: string; updated: number }> = {}

  for (const g of groupsToScore) {
    const gMatches = (matches as GroupMatch[]).filter((m) => m.group_name === g)
    if (gMatches.length === 0) { results[g] = { skipped: 'no matches', updated: 0 }; continue }

    const allScored = gMatches.every((m) => m.real_home_score !== null)
    if (!allScored) { results[g] = { skipped: 'incomplete', updated: 0 }; continue }

    const actual = buildActualOrder(matches as GroupMatch[], g)
    if (actual.length < 4) { results[g] = { skipped: 'not enough teams', updated: 0 }; continue }

    const { data: preds } = await supabase
      .from('group_predictions')
      .select('user_id, ranked_codes')
      .eq('group_name', g)

    let groupUpdated = 0
    for (const pred of preds ?? []) {
      const pts = scoreGroupPrediction(
        (pred as { ranked_codes: string[] }).ranked_codes,
        actual,
      )
      await supabase.from('group_predictions')
        .update({ points_awarded: pts })
        .eq('user_id', (pred as { user_id: string }).user_id)
        .eq('group_name', g)
      groupUpdated++
    }
    predictionsUpdated += groupUpdated
    results[g] = { updated: groupUpdated }
  }

  return NextResponse.json({ groups: results, predictions_updated: predictionsUpdated })
}
