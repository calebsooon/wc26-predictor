export const PLAYER_COUNT = 7
export const TOTAL_GWS = 8

export const GW_PRIZES = [15, 10, 5, 0, -5, -10, -15] as const
export const OVERALL_PRIZES = [40, 20, 10, 0, -10, -20, -40] as const

export const GW_NAMES: Record<number, string> = {
  1: 'Group Stage — Day 1',
  2: 'Group Stage — Day 2',
  3: 'Group Stage — Day 3',
  4: 'Round of 32',
  5: 'Round of 16',
  6: 'Quarter-Finals',
  7: 'Semi-Finals',
  8: 'Final & 3rd Place',
}

export const GW_SHORT: Record<number, string> = {
  1: 'GW1', 2: 'GW2', 3: 'GW3',
  4: 'R32', 5: 'R16', 6: 'QF', 7: 'SF', 8: 'Final',
}

export function gwPrize(rank: number): number {
  return GW_PRIZES[Math.min(Math.max(rank - 1, 0), 6)]
}

export function overallPrize(rank: number): number {
  return OVERALL_PRIZES[Math.min(Math.max(rank - 1, 0), 6)]
}

export function formatPrize(amount: number): string {
  if (amount > 0) return `+$${amount}`
  if (amount < 0) return `-$${Math.abs(amount)}`
  return '$0'
}

export function prizeTone(amount: number): 'green' | 'red' | 'default' {
  if (amount > 0) return 'green'
  if (amount < 0) return 'red'
  return 'default'
}

import { aggregateLeaderboard, type ScoredPred, type ProfileLite } from '@/lib/leaderboard'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'

export interface PrizeSnapshot {
  settledNet: number
  completedGWs: number[]
  liveGWNumber: number | null
  liveGWRank: number | null
  liveGWPrize: number
  overallRank: number | null
  projectedOverallPrize: number
  isOverallSettled: boolean
  rangeMin: number
  rangeMax: number
  projectedTotal: number
}

export function computePrizeSnapshot(params: {
  userId: string
  scoredPreds: ScoredPred[]
  profiles: ProfileLite[]
  weights?: ScoringWeights
  gwMatchStatus: Map<number, { total: number; scored: number }>
  overallRank: number | null
}): PrizeSnapshot {
  const { userId, scoredPreds, profiles, weights = DEFAULT_WEIGHTS, gwMatchStatus, overallRank } = params

  const completedGWs = Array.from(gwMatchStatus.entries())
    .filter(([, s]) => s.total > 0 && s.scored === s.total)
    .map(([gw]) => gw)
    .sort()

  const isOverallSettled = completedGWs.length === TOTAL_GWS

  // Rank a single gameweek through the SAME engine as the standings, so money
  // ranks always match the leaderboard: every league member is seeded (players
  // who missed the GW rank last, not dropped) and the full tiebreaker chain
  // applies. Cached per GW since callers read each one multiple times.
  const rankCache = new Map<number, number | null>()
  function rankInGW(gw: number): number | null {
    if (rankCache.has(gw)) return rankCache.get(gw)!
    const board = aggregateLeaderboard({ scoredPreds, profiles, userId, gwNumber: gw, weights })
    const idx = board.findIndex((r) => r.id === userId)
    const rank = idx >= 0 ? idx + 1 : null
    rankCache.set(gw, rank)
    return rank
  }

  // Settled net
  let settledNet = 0
  for (const gw of completedGWs) {
    const rank = rankInGW(gw)
    if (rank != null) settledNet += gwPrize(rank)
  }

  // Live GW (first incomplete GW that has some scores, or first upcoming)
  const liveGWNumber = [1, 2, 3, 4, 5, 6, 7, 8].find((gw) => {
    const s = gwMatchStatus.get(gw)
    return !s || s.scored < s.total
  }) ?? null

  let liveGWRank: number | null = null
  let liveGWPrize = 0
  if (liveGWNumber) {
    const rank = rankInGW(liveGWNumber)
    liveGWRank = rank
    liveGWPrize = rank != null ? gwPrize(rank) : 0
  }

  const projectedOverallPrize = overallRank != null ? overallPrize(overallRank) : 0
  const remainingGWs = TOTAL_GWS - completedGWs.length

  const rangeMin = settledNet + remainingGWs * (-15) + (isOverallSettled ? projectedOverallPrize : -40)
  const rangeMax = settledNet + remainingGWs * 15 + (isOverallSettled ? projectedOverallPrize : 40)

  // Projected = settled + live GW at current rank + future unstarted GWs at current rank + overall at current rank
  const futureGWCount = liveGWNumber != null ? Math.max(0, remainingGWs - 1) : remainingGWs
  const futureGWPrize = overallRank != null ? gwPrize(overallRank) * futureGWCount : 0
  const projectedTotal = settledNet + liveGWPrize + futureGWPrize + projectedOverallPrize

  return {
    settledNet, completedGWs, liveGWNumber, liveGWRank, liveGWPrize,
    overallRank, projectedOverallPrize, isOverallSettled,
    rangeMin, rangeMax, projectedTotal,
  }
}
