/* ============================================================
   MatchDay — shared leaderboard aggregation
   Single source of truth so the dashboard mini-table and the
   full leaderboard always agree on points, tiebreakers and order.
   ============================================================ */

import type { LBRow } from '@/components/football'
import { weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights, type MatchBreakdown } from '@/lib/scoring'

/** A scored prediction row as fetched from Supabase (joined to profile + match). */
export interface ScoredPred extends MatchBreakdown {
  user_id: string
  points_awarded: number
  profiles?: { username: string | null; avatar_url: string | null } | null
  matches?: { gw_number: number | null } | null
}

export interface ProfileLite {
  id: string
  username: string | null
  avatar_url: string | null
}

/** Aggregate row with the extra fields used for sorting + accuracy display. */
export type AggRow = LBRow & {
  scored: number
  correct: number
  outcomeWins: number
}

/**
 * Canonical leaderboard sort:
 *   1. most points
 *   2. most correct outcomes (tiebreaker)
 *   3. most exact scorelines (tiebreaker)
 *   4. stable id order only for rendering deterministic tied rows
 */
export function compareLeaderboard(a: AggRow, b: AggRow): number {
  return (
    b.pts - a.pts ||
    b.outcomeWins - a.outcomeWins ||
    (b.exact ?? 0) - (a.exact ?? 0) ||
    a.id.localeCompare(b.id)
  )
}

/**
 * Build a sorted leaderboard from scored predictions + the full profile list.
 * Every registered profile is seeded at 0 so players show up before scoring starts.
 *
 * @param gwNumber  optional gameweek filter (null/undefined = overall)
 */
export function aggregateLeaderboard({
  scoredPreds,
  profiles,
  userId,
  gwNumber = null,
  weights = DEFAULT_WEIGHTS,
}: {
  scoredPreds: ScoredPred[]
  profiles: ProfileLite[]
  userId: string | null
  gwNumber?: number | null
  weights?: ScoringWeights
}): AggRow[] {
  const filtered = gwNumber == null
    ? scoredPreds
    : scoredPreds.filter((r) => r.matches?.gw_number === gwNumber)

  const agg = new Map<string, AggRow>()

  const seed = (id: string, name: string | null, avatar: string | null | undefined): AggRow => ({
    id, name: name ?? '?', avatar: avatar ?? null,
    pts: 0, exact: 0, acc: 0, scored: 0, correct: 0, outcomeWins: 0, you: id === userId,
  })

  for (const p of profiles) agg.set(p.id, seed(p.id, p.username, p.avatar_url))

  for (const r of filtered) {
    const cur = agg.get(r.user_id) ?? seed(r.user_id, r.profiles?.username ?? null, r.profiles?.avatar_url)
    cur.pts += weightedMatchPoints(r, weights)   // league-weighted total
    cur.scored += 1
    if ((r.pts_outcome ?? 0) > 0) { cur.correct += 1; cur.outcomeWins += 1 }
    if ((r.pts_exact ?? 0) > 0) cur.exact = (cur.exact ?? 0) + 1
    agg.set(r.user_id, cur)
  }

  return Array.from(agg.values())
    .map((r) => ({ ...r, acc: r.scored ? Math.round((r.correct / r.scored) * 100) : 0 }))
    .sort(compareLeaderboard)
}
