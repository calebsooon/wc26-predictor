import { describe, it, expect } from 'vitest'
import { scorePrediction, weightedMatchPoints, resolveWeights, DEFAULT_WEIGHTS, POINTS } from './scoring'

const M = (rh: number, ra: number, extra = {}) =>
  ({ home_team: 'A', away_team: 'B', real_home_score: rh, real_away_score: ra, ...extra })

describe('scorePrediction', () => {
  it('awards outcome + exact for a perfect call', () => {
    const z = scorePrediction({ pred_home: 2, pred_away: 1 }, M(2, 1))
    expect(z.outcome).toBe(POINTS.outcome)
    expect(z.exact).toBe(POINTS.exact)
    expect(z.goalDiff).toBe(POINTS.goalDiff)
    expect(z.totalGoals).toBe(POINTS.totalGoals)
    expect(z.teamGoals).toBe(POINTS.teamGoals)
  })

  it('team-goals is flat when either team exact (3-1 actual, 2-1 pred)', () => {
    const z = scorePrediction({ pred_home: 2, pred_away: 1 }, M(3, 1))
    expect(z.teamGoals).toBe(POINTS.teamGoals)
    expect(z.outcome).toBe(POINTS.outcome)
    expect(z.exact).toBe(0)
  })

  it('team-goals is 0 when neither team exact', () => {
    expect(scorePrediction({ pred_home: 0, pred_away: 0 }, M(3, 1)).teamGoals).toBe(0)
  })

  it('BTTS override lets you hedge', () => {
    expect(scorePrediction({ pred_home: 1, pred_away: 0, pred_btts: true }, M(1, 1)).btts).toBe(POINTS.btts)
    expect(scorePrediction({ pred_home: 1, pred_away: 0 }, M(1, 1)).btts).toBe(0)
  })

  it('no-scorer scores only when there was no first goal', () => {
    expect(scorePrediction({ pred_home: 0, pred_away: 0, pred_no_scorer: true }, M(0, 0, { first_goal_team: 'NONE' })).firstScorer).toBe(POINTS.firstScorer)
    expect(scorePrediction({ pred_home: 0, pred_away: 0, pred_no_scorer: true }, M(2, 1, { first_goal_team: 'A', first_goal_player_id: 9 })).firstScorer).toBe(0)
  })

  it('goal-diff and total-goals overrides hedge independently of scoreline', () => {
    // wrong scoreline (2-1 vs 3-2) but right GD (1) and right TG (5)
    const z = scorePrediction({ pred_home: 2, pred_away: 1, pred_goal_diff: 1, pred_total_goals: 5 }, M(3, 2))
    expect(z.goalDiff).toBe(POINTS.goalDiff)
    expect(z.totalGoals).toBe(POINTS.totalGoals)
    expect(z.exact).toBe(0)
  })

  it('returns zeros when the match is unscored', () => {
    const z = scorePrediction({ pred_home: 1, pred_away: 1 }, { home_team: 'A', away_team: 'B', real_home_score: null as unknown as number, real_away_score: null as unknown as number })
    expect(z.total).toBe(0)
  })
})

describe('weightedMatchPoints / resolveWeights', () => {
  it('re-weights a stored breakdown', () => {
    const b = { pts_outcome: 3, pts_exact: 0, pts_team_goals: 1 }
    expect(weightedMatchPoints(b, DEFAULT_WEIGHTS)).toBe(POINTS.outcome + POINTS.teamGoals)
    expect(weightedMatchPoints(b, resolveWeights({ outcome: 5 }))).toBe(5 + DEFAULT_WEIGHTS.teamGoals)
  })

  it('resolveWeights merges partial overrides over defaults', () => {
    const w = resolveWeights({ firstScorer: 0 })
    expect(w.firstScorer).toBe(0)
    expect(w.outcome).toBe(DEFAULT_WEIGHTS.outcome)
  })

  it('resolveWeights ignores junk', () => {
    expect(resolveWeights(null)).toEqual(DEFAULT_WEIGHTS)
    expect(resolveWeights('nope')).toEqual(DEFAULT_WEIGHTS)
  })
})
