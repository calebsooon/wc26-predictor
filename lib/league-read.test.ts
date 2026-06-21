import { describe, expect, it } from 'vitest'
import { buildLeagueRead } from './league-read'

describe('buildLeagueRead', () => {
  const picks = [
    { user_id: 'a', pred_home: 2, pred_away: 1, pred_btts: true, pred_total_goals: 3, pred_first_scorer_id: 10 },
    { user_id: 'b', pred_home: 2, pred_away: 1, pred_btts: true, pred_total_goals: 3, pred_first_scorer_id: 10 },
    { user_id: 'c', pred_home: 1, pred_away: 1, pred_btts: false, pred_total_goals: 2, pred_first_scorer_id: 11 },
  ]

  it('ranks aggregate outcomes and scorelines', () => {
    const read = buildLeagueRead(picks, 'a')
    expect(read.outcomes).toEqual({ home: 2, draw: 1, away: 0 })
    expect(read.scorelines[0]).toEqual({ label: '2–1', count: 2 })
    expect(read.btts).toEqual({ yes: 2, no: 1, total: 3 })
    expect(read.crowd).toBe('majority')
  })

  it('marks a one-off scoreline as unique and handles no pick', () => {
    expect(buildLeagueRead(picks, 'c').crowd).toBe('unique')
    expect(buildLeagueRead(picks, 'nobody').crowd).toBe('none')
  })
})
