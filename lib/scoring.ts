/* ============================================================
   BRACKET XI — scoring engine (7-category model)
   ============================================================
   Outcome (W/D/L) ............. +3
   Exact scoreline ............. +3 (bonus on top of outcome)
   Goal difference ............. +2
   Total goals ................. +1
   Both teams to score ......... +1
   First-goal team ............. +2
   First scorer ................ +4
   ============================================================ */

export const GROUP_POINTS = { position: 2 } as const

export const TOURNAMENT_POINTS = {
  champion: 15,
  runner_up: 8,
  semi: 4,
  quarter: 2,
} as const

export function scoreGroupPrediction(predicted: string[], actual: string[]): number {
  let pts = 0
  for (let i = 0; i < Math.min(4, predicted.length, actual.length); i++) {
    if (predicted[i] === actual[i]) pts += GROUP_POINTS.position
  }
  return pts
}

export const POINTS = {
  outcome: 3,
  exact: 3,
  goalDiff: 2,
  totalGoals: 1,
  btts: 1,
  firstTeam: 2,
  firstScorer: 4,
} as const

export const SCORING_RULES: { key: string; label: string; pts: number }[] = [
  { key: 'outcome', label: 'Correct outcome', pts: POINTS.outcome },
  { key: 'exact', label: 'Exact scoreline', pts: POINTS.exact },
  { key: 'goalDiff', label: 'Goal difference', pts: POINTS.goalDiff },
  { key: 'totalGoals', label: 'Total goals', pts: POINTS.totalGoals },
  { key: 'btts', label: 'Both teams scored', pts: POINTS.btts },
  { key: 'firstTeam', label: 'First-goal team', pts: POINTS.firstTeam },
  { key: 'firstScorer', label: 'First scorer', pts: POINTS.firstScorer },
]

export interface ScoreBreakdown {
  outcome: number
  exact: number
  goalDiff: number
  totalGoals: number
  btts: number
  firstTeam: number
  firstScorer: number
  total: number
}

export interface PredictionInput {
  pred_home: number
  pred_away: number
  pred_first_goal_team?: string | null
  pred_first_scorer_id?: number | null
}

export interface MatchResult {
  home_team: string
  away_team: string
  real_home_score: number
  real_away_score: number
  first_goal_team?: string | null
  first_goal_player_id?: number | null
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

export function scorePrediction(pred: PredictionInput, m: MatchResult): ScoreBreakdown {
  const z: ScoreBreakdown = {
    outcome: 0, exact: 0, goalDiff: 0, totalGoals: 0,
    btts: 0, firstTeam: 0, firstScorer: 0, total: 0,
  }
  const { real_home_score: rh, real_away_score: ra } = m
  if (rh == null || ra == null) return z

  const ph = pred.pred_home, pa = pred.pred_away

  if (sign(ph - pa) === sign(rh - ra)) z.outcome = POINTS.outcome
  if (ph === rh && pa === ra) z.exact = POINTS.exact
  if (ph - pa === rh - ra) z.goalDiff = POINTS.goalDiff
  if (ph + pa === rh + ra) z.totalGoals = POINTS.totalGoals
  if ((ph > 0 && pa > 0) === (rh > 0 && ra > 0)) z.btts = POINTS.btts

  // m.first_goal_team=null means admin hasn't set it yet; 'NONE' means confirmed no goal
  if (pred.pred_first_goal_team && m.first_goal_team != null && pred.pred_first_goal_team === m.first_goal_team) {
    z.firstTeam = POINTS.firstTeam
  }
  if (pred.pred_first_scorer_id != null && m.first_goal_player_id != null && pred.pred_first_scorer_id === m.first_goal_player_id) {
    z.firstScorer = POINTS.firstScorer
  }

  z.total = z.outcome + z.exact + z.goalDiff + z.totalGoals + z.btts + z.firstTeam + z.firstScorer
  return z
}
