import { describe, it, expect } from 'vitest'
import { aggregateLeaderboard, compareLeaderboard, type ScoredPred, type ProfileLite, type AggRow } from './leaderboard'

const prof = (id: string, username: string): ProfileLite => ({ id, username, avatar_url: null })

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
    expect(board[0].pts).toBe(9) // 3 + (3+3)
    expect(board[0].you).toBe(true)
    expect(board[0].exact).toBe(1)
  })

  it('tiebreaks: points → correct outcomes → alphabetical', () => {
    const preds: ScoredPred[] = [
      { user_id: 'b', points_awarded: 3, pts_outcome: 3 }, // Bob: 3 pts, 1 outcome
      { user_id: 'c', points_awarded: 3, pts_outcome: 3 }, // Cara: 3 pts, 1 outcome
      { user_id: 'a', points_awarded: 3, pts_outcome: 3 }, // Ann: 3 pts, 1 outcome
    ]
    const board = aggregateLeaderboard({
      scoredPreds: preds,
      profiles: [prof('c', 'Cara'), prof('a', 'Ann'), prof('b', 'Bob')],
      userId: null,
    })
    expect(board.map((r) => r.name)).toEqual(['Ann', 'Bob', 'Cara']) // alphabetical on full tie
  })

  it('more correct outcomes beats alphabetical', () => {
    const a: AggRow = { id: 'a', name: 'Ann', avatar: null, pts: 5, exact: 0, acc: 0, scored: 0, correct: 0, outcomeWins: 1, you: false }
    const z: AggRow = { id: 'z', name: 'Zed', avatar: null, pts: 5, exact: 0, acc: 0, scored: 0, correct: 0, outcomeWins: 2, you: false }
    expect([a, z].sort(compareLeaderboard)[0].name).toBe('Zed') // Zed has more outcomes despite Z > A
  })

  it('filters by gameweek', () => {
    const preds: ScoredPred[] = [
      { user_id: 'a', points_awarded: 3, pts_outcome: 3, matches: { gw_number: 1 } },
      { user_id: 'a', points_awarded: 6, pts_outcome: 3, pts_exact: 3, matches: { gw_number: 2 } },
    ]
    const board = aggregateLeaderboard({ scoredPreds: preds, profiles: [prof('a', 'Ann')], userId: 'a', gwNumber: 1 })
    expect(board[0].pts).toBe(3) // only GW1, weighted from pts_outcome
  })
})
