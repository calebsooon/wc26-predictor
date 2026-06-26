import { describe, it, expect } from 'vitest'
import { scorePrediction, weightedMatchPoints, weightedGroupPoints, resolveWeights, DEFAULT_WEIGHTS, POINTS } from './scoring'

const M = (rh: number, ra: number, extra = {}) =>
  ({ home_team: 'A', away_team: 'B', real_home_score: rh, real_away_score: ra, ...extra })

describe('scorePrediction', () => {
  it('awards outcome + exact for a perfect call — teamGoals does not stack with exact', () => {
    const z = scorePrediction({ pred_home: 2, pred_away: 1 }, M(2, 1))
    expect(z.outcome).toBe(POINTS.outcome)
    expect(z.exact).toBe(POINTS.exact)
    expect(z.goalDiff).toBe(POINTS.goalDiff)
    expect(z.totalGoals).toBe(POINTS.totalGoals)
    expect(z.teamGoals).toBe(0) // consolation only — not awarded when exact is hit
    expect(z.total).toBe(POINTS.outcome + POINTS.exact + POINTS.goalDiff + POINTS.totalGoals + POINTS.btts)
  })

  it('teamGoals is consolation when one team exact but overall score wrong', () => {
    const z = scorePrediction({ pred_home: 2, pred_away: 1 }, M(3, 1))
    expect(z.teamGoals).toBe(POINTS.teamGoals) // away (1) matches → consolation awarded
    expect(z.outcome).toBe(POINTS.outcome)
    expect(z.exact).toBe(0)
  })

  it('teamGoals is 0 when neither team exact', () => {
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

  it('scores first scorer against equivalent duplicate player ids', () => {
    const z = scorePrediction(
      { pred_home: 2, pred_away: 1, pred_first_scorer_id: 4385510 },
      M(2, 1, { first_goal_team: 'A', first_goal_player_id: 189529648, equivalent_first_scorer_ids: [4385510, 189529648] }),
    )
    expect(z.firstScorer).toBe(POINTS.firstScorer)
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
    expect(weightedMatchPoints(b, DEFAULT_WEIGHTS)).toBe(POINTS.outcome + DEFAULT_WEIGHTS.teamGoals) // teamGoals weight=0 by default
    expect(weightedMatchPoints(b, resolveWeights({ outcome: 5, teamGoals: 1 }))).toBe(5 + 1)
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

  it('weighted group scoring can be disabled per league', () => {
    expect(weightedGroupPoints(4, resolveWeights({ groupPosition: 0 }))).toBe(0)
  })
})
