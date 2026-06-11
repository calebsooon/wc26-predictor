/* ============================================================
   MatchDay — per-league rank snapshots (shared by the
   snapshot-ranks and fetch-results admin routes).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveWeights, weightedMatchPoints, type MatchBreakdown } from '@/lib/scoring'

const PRED_COLS = 'user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'

/** Snapshot every league's current ranking (league-weighted). Returns rows written. */
export async function snapshotLeagueRanks(supabase: SupabaseClient): Promise<number> {
  const [{ data: preds }, { data: leagues }, { data: members }] = await Promise.all([
    supabase.from('predictions').select(PRED_COLS).not('points_awarded', 'is', null),
    supabase.from('leagues').select('id, scoring'),
    supabase.from('league_members').select('league_id, user_id'),
  ])

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
    for (const id of idList) agg.set(id, 0)
    for (const r of rows) {
      if (!ids.has(r.user_id)) continue
      agg.set(r.user_id, (agg.get(r.user_id) ?? 0) + weightedMatchPoints(r, weights))
    }

    Array.from(agg.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([user_id, points], idx) => {
        snapshots.push({ user_id, league_id: league.id, rank: idx + 1, points, snapshot_at: now })
      })
  }

  if (snapshots.length === 0) return 0
  await supabase.from('rank_snapshots').insert(snapshots)
  return snapshots.length
}
