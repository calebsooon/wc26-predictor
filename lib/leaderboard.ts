/* ============================================================
   MatchDay — shared leaderboard aggregation
   Single source of truth so the dashboard mini-table and the
   full leaderboard always agree on points, tiebreakers and order.
   ============================================================ */

import type { LBRow } from '@/components/football'
import {
  weightedMatchPoints, weightedGroupPoints, weightedTournamentPoints,
  DEFAULT_WEIGHTS, type ScoringWeights, type MatchBreakdown,
} from '@/lib/scoring'

/** A scored prediction row as fetched from Supabase (joined to profile + match). */
export interface ScoredPred extends MatchBreakdown {
  user_id: string
  points_awarded: number
  profiles?: { username: string | null; avatar_url: string | null } | null
  matches?: { gw_number: number | null; match_date?: string | null } | null
}

/** A scored group-order prediction row (one per group per user). */
export interface ScoredGroupPred {
  user_id: string
  points_awarded: number | null
}

/** A scored tournament-bracket prediction row (one per phase per user). */
export interface ScoredTournamentPred {
  user_id: string
  pts_champion?: number | null
  pts_runner_up?: number | null
  pts_semi?: number | null
  pts_quarter?: number | null
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
  exactWins: number
  goalDiffWins: number
  totalGoalsWins: number
  bttsWins: number
  firstTeamWins: number
  firstScorerWins: number
  streak: number
}

/**
 * Canonical leaderboard sort (matches the Rules page):
 *   1. total points  2. predictions submitted  3. correct outcomes
 *   4. exact scorelines  5. goal differences  6. total goals
 *   7. BTTS  8. first-goal team  9. first scorer  10. shared rank
 */
export function compareLeaderboard(a: AggRow, b: AggRow): number {
  return (
    b.pts            - a.pts            ||
    b.scored         - a.scored         ||
    b.outcomeWins    - a.outcomeWins    ||
    b.exactWins      - a.exactWins      ||
    b.goalDiffWins   - a.goalDiffWins   ||
    b.totalGoalsWins - a.totalGoalsWins ||
    b.bttsWins       - a.bttsWins       ||
    b.firstTeamWins  - a.firstTeamWins  ||
    b.firstScorerWins - a.firstScorerWins
  )
}

/**
 * Build a sorted leaderboard from scored predictions + the full profile list.
 * Every registered profile is seeded at 0 so players show up before scoring starts.
 *
 * Group-order and tournament-bracket points are league-weighted and folded into
 * the OVERALL total only (gwNumber == null) — they aren't tied to a single GW.
 * Each is naturally gated by the league's weights: a league that sets the group
 * or tournament weights to 0 contributes 0. Bracket has two scored phases
 * (pre / r32); we count each user's best-scoring phase so re-picking never
 * double-counts.
 *
 * @param gwNumber  optional gameweek filter (null/undefined = overall)
 */
export function aggregateLeaderboard({
  scoredPreds,
  profiles,
  userId,
  gwNumber = null,
  weights = DEFAULT_WEIGHTS,
  groupPreds = [],
  tournamentPreds = [],
}: {
  scoredPreds: ScoredPred[]
  profiles: ProfileLite[]
  userId: string | null
  gwNumber?: number | null
  weights?: ScoringWeights
  groupPreds?: ScoredGroupPred[]
  tournamentPreds?: ScoredTournamentPred[]
}): AggRow[] {
  const filtered = gwNumber == null
    ? scoredPreds
    : scoredPreds.filter((r) => r.matches?.gw_number === gwNumber)

  const agg = new Map<string, AggRow>()

  const seed = (id: string, name: string | null, avatar: string | null | undefined): AggRow => ({
    id, name: name ?? '?', avatar: avatar ?? null,
    pts: 0, exact: 0, acc: 0, scored: 0, correct: 0,
    outcomeWins: 0, exactWins: 0, goalDiffWins: 0, totalGoalsWins: 0,
    bttsWins: 0, firstTeamWins: 0, firstScorerWins: 0,
    streak: 0, you: id === userId,
  })

  for (const p of profiles) agg.set(p.id, seed(p.id, p.username, p.avatar_url))

  for (const r of filtered) {
    const cur = agg.get(r.user_id) ?? seed(r.user_id, r.profiles?.username ?? null, r.profiles?.avatar_url)
    cur.pts += weightedMatchPoints(r, weights)   // league-weighted total
    cur.scored += 1
    if ((r.pts_outcome ?? 0) > 0) { cur.correct += 1; cur.outcomeWins += 1 }
    if ((r.pts_exact ?? 0) > 0) { cur.exact = (cur.exact ?? 0) + 1; cur.exactWins += 1 }
    if ((r.pts_goal_diff ?? 0) > 0) cur.goalDiffWins += 1
    if ((r.pts_total_goals ?? 0) > 0) cur.totalGoalsWins += 1
    if ((r.pts_btts ?? 0) > 0) cur.bttsWins += 1
    if ((r.pts_first_team ?? 0) > 0) cur.firstTeamWins += 1
    if ((r.pts_first_scorer ?? 0) > 0) cur.firstScorerWins += 1
    agg.set(r.user_id, cur)
  }

  // Fold in season-long group-order + tournament points (overall total only).
  if (gwNumber == null) {
    for (const g of groupPreds) {
      const row = agg.get(g.user_id)
      if (!row) continue
      row.pts += weightedGroupPoints(g.points_awarded, weights)
    }
    // Bracket: keep only each user's best-scoring phase (pre vs r32).
    const bestTournament = new Map<string, number>()
    for (const t of tournamentPreds) {
      const pts = weightedTournamentPoints(t, weights)
      const prev = bestTournament.get(t.user_id) ?? 0
      if (pts > prev) bestTournament.set(t.user_id, pts)
    }
    for (const [uid, pts] of Array.from(bestTournament.entries())) {
      const row = agg.get(uid)
      if (row) row.pts += pts
    }
  }

  // Compute streak: consecutive correct outcomes from most recent match backward
  const userPreds = new Map<string, Array<{ date: string; correct: boolean }>>()
  for (const r of filtered) {
    const date = r.matches?.match_date ?? ''
    if (!userPreds.has(r.user_id)) userPreds.set(r.user_id, [])
    userPreds.get(r.user_id)!.push({ date, correct: (r.pts_outcome ?? 0) > 0 })
  }
  for (const [uid, results] of Array.from(userPreds.entries())) {
    const row = agg.get(uid)
    if (!row) continue
    const sorted = results.sort((a: { date: string; correct: boolean }, b: { date: string; correct: boolean }) => b.date.localeCompare(a.date))
    let streak = 0
    for (const { correct } of sorted) {
      if (!correct) break
      streak++
    }
    row.streak = streak
    agg.set(uid, row)
  }

  return Array.from(agg.values())
    .map((r) => ({ ...r, acc: r.scored ? Math.round((r.correct / r.scored) * 100) : 0 }))
    .sort(compareLeaderboard)
}
