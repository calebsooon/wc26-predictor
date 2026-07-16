import { describe, it, expect } from 'vitest'
import { gwPrize, overallPrize, formatPrize, prizeTone, GW_PRIZES, OVERALL_PRIZES, computePrizeSnapshot } from './prizes'
import type { ScoredPred, ProfileLite } from './leaderboard'

// Helper: build a scored match-prediction row for a given user + gameweek.
function pred(user_id: string, gw: number, points: number, outcome = false): ScoredPred {
  return {
    user_id, points_awarded: points,
    pts_outcome: outcome ? 1 : 0, pts_exact: 0, pts_goal_diff: 0, pts_total_goals: 0,
    pts_btts: 0, pts_first_team: 0, pts_first_scorer: 0,
    matches: { gw_number: gw },
  } as ScoredPred
}

describe('prize helpers', () => {
  it('maps rank to the GW prize tier and clamps', () => {
    expect(gwPrize(1)).toBe(GW_PRIZES[0])
    expect(gwPrize(7)).toBe(GW_PRIZES[6])
    expect(gwPrize(99)).toBe(GW_PRIZES[6]) // clamp to last
    expect(gwPrize(0)).toBe(GW_PRIZES[0])  // clamp to first
  })

  it('maps rank to the overall prize tier', () => {
    expect(overallPrize(1)).toBe(OVERALL_PRIZES[0])
    expect(overallPrize(7)).toBe(OVERALL_PRIZES[6])
  })

  it('formats prize amounts with sign', () => {
    expect(formatPrize(15)).toBe('+$15')
    expect(formatPrize(-10)).toBe('-$10')
    expect(formatPrize(0)).toBe('$0')
  })

  it('tones by sign', () => {
    expect(prizeTone(5)).toBe('green')
    expect(prizeTone(-5)).toBe('red')
    expect(prizeTone(0)).toBe('default')
  })
})

describe('computePrizeSnapshot — GW ranking', () => {
  const profiles: ProfileLite[] = ['a', 'b', 'c'].map((id) => ({ id, username: id, avatar_url: null }))
  // One completed GW where a > b > c on points.
  const gwStatus = new Map([[1, { total: 1, scored: 1 }]])

  it('settles the winner at the top GW tier', () => {
    const scoredPreds = [pred('a', 1, 30), pred('b', 1, 20), pred('c', 1, 10)]
    const snap = computePrizeSnapshot({ userId: 'a', scoredPreds, profiles, gwMatchStatus: gwStatus, overallRank: 1 })
    expect(snap.settledNet).toBe(GW_PRIZES[0]) // rank 1
  })

  it('ranks a member who missed the GW LAST, not dropping them (bug #2)', () => {
    // c submitted nothing for GW1 — must still be ranked last (rank 3), so a=1, b=2.
    const scoredPreds = [pred('a', 1, 30), pred('b', 1, 20)]
    const snapB = computePrizeSnapshot({ userId: 'b', scoredPreds, profiles, gwMatchStatus: gwStatus, overallRank: 2 })
    const snapC = computePrizeSnapshot({ userId: 'c', scoredPreds, profiles, gwMatchStatus: gwStatus, overallRank: 3 })
    expect(snapB.settledNet).toBe(GW_PRIZES[1]) // b is 2nd, not 1st
    expect(snapC.settledNet).toBe(GW_PRIZES[2]) // c is ranked last despite no picks
  })

  it('keeps the GW pot zero-sum across a full 7-player league', () => {
    const seven = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
    const sevenProfiles: ProfileLite[] = seven.map((id) => ({ id, username: id, avatar_url: null }))
    // Distinct descending points so ranks are 1..7.
    const scoredPreds = seven.map((id, i) => pred(id, 1, 70 - i * 10))
    const total = seven
      .map((id, i) => computePrizeSnapshot({ userId: id, scoredPreds, profiles: sevenProfiles, gwMatchStatus: gwStatus, overallRank: i + 1 }).settledNet)
      .reduce((s, n) => s + n, 0)
    expect(total).toBe(0) // 15+10+5+0-5-10-15
  })
})
