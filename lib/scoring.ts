/* ============================================================
   BRACKET XI — scoring engine (8-category model)
   ============================================================
   Outcome (W/D/L) ............. +3
   Exact scoreline ............. +5
   Goal difference ............. +2
   Total goals ................. +1
   Both teams to score ......... +1
   First-goal team ............. +2
   First scorer ................ +6
   Knockout advance pick ....... +4   (knockout matches only)
   ============================================================ */

export const POINTS = {
  outcome: 3,
  exact: 5,
  goalDiff: 2,
  totalGoals: 1,
  btts: 1,
  firstTeam: 2,
  firstScorer: 6,
  knockout: 4,
} as const

export const SCORING_RULES: { key: string; label: string; pts: number }[] = [
  { key: 'outcome', label: 'Correct outcome', pts: POINTS.outcome },
  { key: 'exact', label: 'Exact scoreline', pts: POINTS.exact },
  { key: 'goalDiff', label: 'Goal difference', pts: POINTS.goalDiff },
  { key: 'totalGoals', label: 'Total goals', pts: POINTS.totalGoals },
  { key: 'btts', label: 'Both teams scored', pts: POINTS.btts },
  { key: 'firstTeam', label: 'First-goal team', pts: POINTS.firstTeam },
  { key: 'firstScorer', label: 'First scorer', pts: POINTS.firstScorer },
  { key: 'knockout', label: 'Knockout advance', pts: POINTS.knockout },
]

export interface ScoreBreakdown {
  outcome: number
  exact: number
  goalDiff: number
  totalGoals: number
  btts: number
  firstTeam: number
  firstScorer: number
  knockout: number
  total: number
}

export interface PredictionInput {
  pred_home: number
  pred_away: number
  pred_first_goal_team?: string | null
  pred_first_scorer_id?: number | null
  pred_winner_team?: string | null
}

export interface MatchResult {
  home_team: string
  away_team: string
  real_home_score: number
  real_away_score: number
  first_goal_team?: string | null
  first_goal_player_id?: number | null
  is_knockout?: boolean
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

export function scorePrediction(pred: PredictionInput, m: MatchResult): ScoreBreakdown {
  const z: ScoreBreakdown = {
    outcome: 0, exact: 0, goalDiff: 0, totalGoals: 0,
    btts: 0, firstTeam: 0, firstScorer: 0, knockout: 0, total: 0,
  }
  const { real_home_score: rh, real_away_score: ra } = m
  if (rh == null || ra == null) return z

  const ph = pred.pred_home, pa = pred.pred_away

  // Outcome
  if (sign(ph - pa) === sign(rh - ra)) z.outcome = POINTS.outcome
  // Exact
  if (ph === rh && pa === ra) z.exact = POINTS.exact
  // Goal difference
  if (ph - pa === rh - ra) z.goalDiff = POINTS.goalDiff
  // Total goals
  if (ph + pa === rh + ra) z.totalGoals = POINTS.totalGoals
  // Both teams to score
  if ((ph > 0 && pa > 0) === (rh > 0 && ra > 0)) z.btts = POINTS.btts

  // First-goal team
  if (pred.pred_first_goal_team && m.first_goal_team && pred.pred_first_goal_team === m.first_goal_team) {
    z.firstTeam = POINTS.firstTeam
  }
  // First scorer
  if (pred.pred_first_scorer_id != null && m.first_goal_player_id != null && pred.pred_first_scorer_id === m.first_goal_player_id) {
    z.firstScorer = POINTS.firstScorer
  }
  // Knockout advance pick — actual winner derived from score
  if (m.is_knockout && pred.pred_winner_team) {
    const actualWinner = rh > ra ? m.home_team : ra > rh ? m.away_team : null
    if (actualWinner && pred.pred_winner_team === actualWinner) z.knockout = POINTS.knockout
  }

  z.total = z.outcome + z.exact + z.goalDiff + z.totalGoals + z.btts + z.firstTeam + z.firstScorer + z.knockout
  return z
}
