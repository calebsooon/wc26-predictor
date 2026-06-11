import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { resolveWeights, weightedMatchPoints, type MatchBreakdown } from '@/lib/scoring'

const PRED_COLS = 'user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_btts, pts_first_team, pts_first_scorer'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { data: preds, error } = await supabase
    .from('predictions')
    .select(PRED_COLS)
    .not('points_awarded', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [{ data: leagues }, { data: members }] = await Promise.all([
    supabase.from('leagues').select('id, scoring'),
    supabase.from('league_members').select('league_id, user_id'),
  ])

  // Group member ids per league
  const leagueMembers = new Map<string, string[]>()
  for (const m of (members ?? []) as { league_id: string; user_id: string }[]) {
    const arr = leagueMembers.get(m.league_id) ?? []
    arr.push(m.user_id)
    leagueMembers.set(m.league_id, arr)
  }

  const rows = (preds ?? []) as (MatchBreakdown & { user_id: string })[]
  const now = new Date().toISOString()
  const snapshots: { user_id: string; league_id: string; rank: number; points: number; snapshot_at: string }[] = []

  for (const league of (leagues ?? []) as { id: string; scoring: unknown }[]) {
    const idList = leagueMembers.get(league.id) ?? []
    if (idList.length === 0) continue
    const ids = new Set(idList)
    const weights = resolveWeights(league.scoring)

    const agg = new Map<string, number>()
    for (const id of idList) agg.set(id, 0) // seed every member at 0
    for (const r of rows) {
      if (!ids.has(r.user_id)) continue
      agg.set(r.user_id, (agg.get(r.user_id) ?? 0) + weightedMatchPoints(r, weights))
    }

    const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
    sorted.forEach(([user_id, points], idx) => {
      snapshots.push({ user_id, league_id: league.id, rank: idx + 1, points, snapshot_at: now })
    })
  }

  if (snapshots.length === 0) return NextResponse.json({ snapshotted: 0 })

  const { error: insErr } = await supabase.from('rank_snapshots').insert(snapshots)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ snapshotted: snapshots.length, leagues: (leagues ?? []).length, snapshot_at: now })
}
