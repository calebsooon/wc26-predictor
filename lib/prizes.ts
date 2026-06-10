export const PLAYER_COUNT = 7
export const TOTAL_GWS = 8

export const GW_PRIZES = [15, 10, 5, 0, -5, -10, -15] as const
export const OVERALL_PRIZES = [40, 20, 10, 0, -10, -20, -40] as const

export const GW_NAMES: Record<number, string> = {
  1: 'GW1 — Group Stage Day 1',
  2: 'GW2 — Group Stage Day 2',
  3: 'GW3 — Group Stage Day 3',
  4: 'GW4 — Round of 32',
  5: 'GW5 — Round of 16',
  6: 'GW6 — Quarter-Finals',
  7: 'GW7 — Semi-Finals',
  8: 'GW8 — Final & 3rd Place',
}

export const GW_SHORT: Record<number, string> = {
  1: 'GW1', 2: 'GW2', 3: 'GW3', 4: 'GW4',
  5: 'GW5', 6: 'GW6', 7: 'GW7', 8: 'GW8',
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
  allScoredPreds: { user_id: string; points_awarded: number; pts_outcome: number | null; gw_number: number | null }[]
  gwMatchStatus: Map<number, { total: number; scored: number }>
  overallRank: number | null
}): PrizeSnapshot {
  const { userId, allScoredPreds, gwMatchStatus, overallRank } = params

  const completedGWs = Array.from(gwMatchStatus.entries())
    .filter(([, s]) => s.total > 0 && s.scored === s.total)
    .map(([gw]) => gw)
    .sort()

  const isOverallSettled = completedGWs.length === TOTAL_GWS

  // Per-GW aggregated points
  const gwAgg = new Map<number, Map<string, { pts: number; outcomes: number }>>()
  for (const r of allScoredPreds) {
    if (!r.gw_number) continue
    const gwMap = gwAgg.get(r.gw_number) ?? new Map()
    const cur = gwMap.get(r.user_id) ?? { pts: 0, outcomes: 0 }
    cur.pts += r.points_awarded
    if ((r.pts_outcome ?? 0) > 0) cur.outcomes++
    gwMap.set(r.user_id, cur)
    gwAgg.set(r.gw_number, gwMap)
  }

  function rankInGW(gw: number): number | null {
    const gwMap = gwAgg.get(gw)
    if (!gwMap) return null
    const sorted = Array.from(gwMap.entries()).sort(([, a], [, b]) => b.pts - a.pts || b.outcomes - a.outcomes)
    const idx = sorted.findIndex(([uid]) => uid === userId)
    return idx >= 0 ? idx + 1 : null
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
