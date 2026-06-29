/* ============================================================
   MatchDay — scoring engine (7-category model)
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
  r32: 1,
  quarter: 2,  // per R16 advancer reaching QF (8 picks)
  semi: 3,     // per QF advancer reaching SF (4 picks)
  runner_up: 5,
  champion: 10,
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
  teamGoals: 1,
  btts: 1,
  firstTeam: 2,
  firstScorer: 4,
} as const

export const SCORING_RULES: { key: string; label: string; pts: number }[] = [
  { key: 'outcome', label: 'Correct outcome', pts: POINTS.outcome },
  { key: 'exact', label: 'Exact scoreline', pts: POINTS.exact },
  { key: 'goalDiff', label: 'Goal difference', pts: POINTS.goalDiff },
  { key: 'totalGoals', label: 'Total goals', pts: POINTS.totalGoals },
  { key: 'teamGoals', label: "A team's exact goals", pts: POINTS.teamGoals },
  { key: 'btts', label: 'Both teams scored', pts: POINTS.btts },
  { key: 'firstTeam', label: 'First-goal team', pts: POINTS.firstTeam },
  { key: 'firstScorer', label: 'First scorer', pts: POINTS.firstScorer },
]

/* ============================================================
   Per-league scoring weights
   Predictions are scored once at default weights (the pts_* columns
   record which categories were hit). Each league can re-weight those
   hits — totals are recomputed per league from the stored breakdown,
   so the same prediction can be worth different amounts in different
   leagues without re-storing points.
   ============================================================ */

export interface ScoringWeights {
  // match categories
  outcome: number
  exact: number
  goalDiff: number
  totalGoals: number
  teamGoals: number
  btts: number
  firstTeam: number
  firstScorer: number
  // group
  groupPosition: number
  // tournament
  champion: number
  runnerUp: number
  semi: number
  quarter: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  outcome: POINTS.outcome,
  exact: POINTS.exact,
  goalDiff: POINTS.goalDiff,
  totalGoals: POINTS.totalGoals,
  teamGoals: 0, // off by default; leagues opt in via admin weight editor
  btts: POINTS.btts,
  firstTeam: POINTS.firstTeam,
  firstScorer: POINTS.firstScorer,
  groupPosition: GROUP_POINTS.position,
  champion: TOURNAMENT_POINTS.champion,
  runnerUp: TOURNAMENT_POINTS.runner_up,
  semi: TOURNAMENT_POINTS.semi,
  quarter: TOURNAMENT_POINTS.quarter,
}

export const WEIGHT_FIELDS: { key: keyof ScoringWeights; label: string; group: 'Match' | 'Group' | 'Tournament' }[] = [
  { key: 'outcome', label: 'Correct outcome', group: 'Match' },
  { key: 'exact', label: 'Exact scoreline', group: 'Match' },
  { key: 'goalDiff', label: 'Goal difference', group: 'Match' },
  { key: 'totalGoals', label: 'Total goals', group: 'Match' },
  { key: 'teamGoals', label: "A team's exact goals", group: 'Match' },
  { key: 'btts', label: 'Both teams scored', group: 'Match' },
  { key: 'firstTeam', label: 'First-goal team', group: 'Match' },
  { key: 'firstScorer', label: 'First scorer', group: 'Match' },
  { key: 'groupPosition', label: 'Group position (each)', group: 'Group' },
  { key: 'champion', label: 'Champion', group: 'Tournament' },
  { key: 'runnerUp', label: 'Runner-up', group: 'Tournament' },
  { key: 'semi', label: 'Semi-finalist (each)', group: 'Tournament' },
  { key: 'quarter', label: 'Quarter-finalist (each)', group: 'Tournament' },
]

/** Merge a league's stored (possibly null/partial) weights over the defaults. */
export function resolveWeights(raw: unknown): ScoringWeights {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEIGHTS }
  const r = raw as Partial<Record<keyof ScoringWeights, unknown>>
  const out = { ...DEFAULT_WEIGHTS }
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof ScoringWeights)[]) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

/** Whether users can manually override their goal-difference prediction for this league. */
export function allowGdManualOverride(scoring: unknown): boolean {
  if (!scoring || typeof scoring !== 'object') return true
  return !(scoring as Record<string, unknown>).disable_gd
}

/** Per-category hit flags (any prediction row carrying the pts_* breakdown). */
export interface MatchBreakdown {
  pts_outcome?: number | null
  pts_exact?: number | null
  pts_goal_diff?: number | null
  pts_total_goals?: number | null
  pts_team_goals?: number | null
  pts_btts?: number | null
  pts_first_team?: number | null
  pts_first_scorer?: number | null
}

/** League-weighted match points from a stored breakdown (hit = category pts > 0). */
export function weightedMatchPoints(p: MatchBreakdown, w: ScoringWeights = DEFAULT_WEIGHTS): number {
  return (
    ((p.pts_outcome ?? 0) > 0 ? w.outcome : 0) +
    ((p.pts_exact ?? 0) > 0 ? w.exact : 0) +
    ((p.pts_goal_diff ?? 0) > 0 ? w.goalDiff : 0) +
    ((p.pts_total_goals ?? 0) > 0 ? w.totalGoals : 0) +
    ((p.pts_team_goals ?? 0) > 0 ? w.teamGoals : 0) +
    ((p.pts_btts ?? 0) > 0 ? w.btts : 0) +
    ((p.pts_first_team ?? 0) > 0 ? w.firstTeam : 0) +
    ((p.pts_first_scorer ?? 0) > 0 ? w.firstScorer : 0)
  )
}

/** Re-weight stored group points (count of correct positions × league weight). */
export function weightedGroupPoints(pointsAwarded: number | null, w: ScoringWeights = DEFAULT_WEIGHTS): number {
  if (!pointsAwarded) return 0
  const correct = Math.round(pointsAwarded / GROUP_POINTS.position)
  return correct * w.groupPosition
}

/** Re-weight stored tournament points from their per-bucket breakdown. */
export function weightedTournamentPoints(
  t: { pts_champion?: number | null; pts_runner_up?: number | null; pts_semi?: number | null; pts_quarter?: number | null },
  w: ScoringWeights = DEFAULT_WEIGHTS,
): number {
  const champ = (t.pts_champion ?? 0) > 0 ? w.champion : 0
  const runner = (t.pts_runner_up ?? 0) > 0 ? w.runnerUp : 0
  const semiCount = Math.round((t.pts_semi ?? 0) / TOURNAMENT_POINTS.semi)
  const quarterCount = Math.round((t.pts_quarter ?? 0) / TOURNAMENT_POINTS.quarter)
  return champ + runner + semiCount * w.semi + quarterCount * w.quarter
}

export interface ScoreBreakdown {
  outcome: number
  exact: number
  goalDiff: number
  totalGoals: number
  teamGoals: number
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
  pred_total_goals?: number | null
  pred_goal_diff?: number | null
  pred_btts?: boolean | null
  pred_no_scorer?: boolean | null
}

export interface MatchResult {
  home_team: string
  away_team: string
  real_home_score: number
  real_away_score: number
  first_goal_team?: string | null
  first_goal_player_id?: number | null
  equivalent_first_scorer_ids?: number[] | null
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

export function scorePrediction(pred: PredictionInput, m: MatchResult): ScoreBreakdown {
  const z: ScoreBreakdown = {
    outcome: 0, exact: 0, goalDiff: 0, totalGoals: 0, teamGoals: 0,
    btts: 0, firstTeam: 0, firstScorer: 0, total: 0,
  }
  const { real_home_score: rh, real_away_score: ra } = m
  if (rh == null || ra == null) return z

  const ph = pred.pred_home, pa = pred.pred_away
  // Independent overrides let users hedge — null means derive from score
  const predGD = pred.pred_goal_diff ?? (ph - pa)
  const predTG = pred.pred_total_goals ?? (ph + pa)
  const predBTTS = pred.pred_btts ?? (ph > 0 && pa > 0)

  if (sign(ph - pa) === sign(rh - ra)) z.outcome = POINTS.outcome
  if (ph === rh && pa === ra) z.exact = POINTS.exact
  if (predGD === rh - ra) z.goalDiff = POINTS.goalDiff
  if (predTG === rh + ra) z.totalGoals = POINTS.totalGoals
  // Consolation point for nailing one team's exact goals — only when exact score wasn't hit
  if (z.exact === 0 && (ph === rh || pa === ra)) z.teamGoals = POINTS.teamGoals
  if (predBTTS === (rh > 0 && ra > 0)) z.btts = POINTS.btts

  // m.first_goal_team=null means admin hasn't set it yet; 'NONE' means confirmed no goal
  if (pred.pred_first_goal_team && m.first_goal_team != null && pred.pred_first_goal_team === m.first_goal_team) {
    z.firstTeam = POINTS.firstTeam
  }
  if (pred.pred_no_scorer) {
    // "No first scorer" is correct only when the match had no first goal
    if (m.first_goal_team === 'NONE') z.firstScorer = POINTS.firstScorer
  } else if (pred.pred_first_scorer_id != null && m.first_goal_player_id != null) {
    const scorerIds = m.equivalent_first_scorer_ids ?? [m.first_goal_player_id]
    if (pred.pred_first_scorer_id === m.first_goal_player_id || scorerIds.includes(pred.pred_first_scorer_id)) {
      z.firstScorer = POINTS.firstScorer
    }
  }

  z.total = z.outcome + z.exact + z.goalDiff + z.totalGoals + z.teamGoals + z.btts + z.firstTeam + z.firstScorer
  return z
}
