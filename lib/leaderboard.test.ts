import { describe, it, expect } from 'vitest'
import { aggregateLeaderboard, compareLeaderboard, type ScoredPred, type ProfileLite, type AggRow } from './leaderboard'

const prof = (id: string, username: string): ProfileLite => ({ id, username, avatar_url: null })

const row = (overrides: Partial<AggRow>): AggRow => ({
  id: 'x', name: 'X', avatar: null, pts: 0, exact: 0, acc: 0, scored: 0, correct: 0,
  outcomeWins: 0, exactWins: 0, goalDiffWins: 0, totalGoalsWins: 0,
  bttsWins: 0, firstTeamWins: 0, firstScorerWins: 0,
  streak: 0, you: false,
  ...overrides,
})

describe('aggregateLeaderboard', () => {
  it('seeds every member at 0 even with no predictions', () => {
    const board = aggregateLeaderboard({ scoredPreds: [], profiles: [prof('a', 'Ann'), prof('b', 'Bob')], userId: 'a' })
    expect(board).toHaveLength(2)
    expect(board.every((r) => r.pts === 0)).toBe(true)
  })

  it('sums league-weighted points and marks "you"', () => {
    const preds: ScoredPred[] = [
      { user_id: 'a', points_awarded: 3, pts_outcome: 3 },
      { user_id: 'a', points_awarded: 6, pts_outcome: 3, pts_exact: 3 },
    ]
    const board = aggregateLeaderboard({ scoredPreds: preds, profiles: [prof('a', 'Ann')], userId: 'a' })
    expect(board[0].pts).toBe(9)
    expect(board[0].you).toBe(true)
    expect(board[0].exact).toBe(1)
  })

  it('fully tied players share rank (no further sort beyond cascade)', () => {
    const preds: ScoredPred[] = [
      { user_id: 'b', points_awarded: 3, pts_outcome: 3 },
      { user_id: 'c', points_awarded: 3, pts_outcome: 3 },
      { user_id: 'a', points_awarded: 3, pts_outcome: 3 },
    ]
    const board = aggregateLeaderboard({
      scoredPreds: preds,
      profiles: [prof('c', 'Cara'), prof('a', 'Ann'), prof('b', 'Bob')],
      userId: null,
    })
    expect(board.map((r) => r.pts)).toEqual([3, 3, 3])
  })

  it('more predictions submitted breaks points tie', () => {
    const a = row({ id: 'a', pts: 5, scored: 3 })
    const z = row({ id: 'z', pts: 5, scored: 5 })
    expect([a, z].sort(compareLeaderboard)[0].id).toBe('z')
  })

  it('more correct outcomes breaks tie after submissions', () => {
    const a = row({ id: 'a', pts: 5, scored: 3, outcomeWins: 1 })
    const z = row({ id: 'z', pts: 5, scored: 3, outcomeWins: 2 })
    expect([a, z].sort(compareLeaderboard)[0].id).toBe('z')
  })

  it('more exact scorelines breaks tie after outcomes', () => {
    const a = row({ id: 'a', pts: 6, scored: 3, outcomeWins: 1, exactWins: 1 })
    const z = row({ id: 'z', pts: 6, scored: 3, outcomeWins: 1, exactWins: 0 })
    expect([z, a].sort(compareLeaderboard)[0].id).toBe('a')
  })

  it('correct goal differences breaks tie after exact scores', () => {
    const a = row({ id: 'a', pts: 6, scored: 3, outcomeWins: 1, exactWins: 1, goalDiffWins: 2 })
    const z = row({ id: 'z', pts: 6, scored: 3, outcomeWins: 1, exactWins: 1, goalDiffWins: 1 })
    expect([z, a].sort(compareLeaderboard)[0].id).toBe('a')
  })

  it('correct BTTS calls break tie after total goals', () => {
    const a = row({ id: 'a', pts: 4, scored: 2, outcomeWins: 1, exactWins: 0, goalDiffWins: 1, totalGoalsWins: 1, bttsWins: 2 })
    const z = row({ id: 'z', pts: 4, scored: 2, outcomeWins: 1, exactWins: 0, goalDiffWins: 1, totalGoalsWins: 1, bttsWins: 1 })
    expect([z, a].sort(compareLeaderboard)[0].id).toBe('a')
  })

  it('filters by gameweek', () => {
    const preds: ScoredPred[] = [
      { user_id: 'a', points_awarded: 3, pts_outcome: 3, matches: { gw_number: 1 } },
      { user_id: 'a', points_awarded: 6, pts_outcome: 3, pts_exact: 3, matches: { gw_number: 2 } },
    ]
    const board = aggregateLeaderboard({ scoredPreds: preds, profiles: [prof('a', 'Ann')], userId: 'a', gwNumber: 1 })
    expect(board[0].pts).toBe(3)
  })
})
