import type { UIMatch } from '@/components/football'
import type { PredStatus } from '@/components/ui'
import { weightedMatchPoints, type ScoringWeights } from '@/lib/scoring'

export interface DBMatch {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  gameweek?: number | null
  round_name?: string | null
  home_formation?: string | null
  away_formation?: string | null
  home_formation_override?: string | null
  away_formation_override?: string | null
}

export interface MyPred {
  pred_home: number
  pred_away: number
  pred_total_goals?: number | null
  pred_goal_diff?: number | null
  pred_btts?: boolean | null
  points_awarded: number | null
  pts_exact?: number | null
  pts_outcome?: number | null
  pts_goal_diff?: number | null
  pts_total_goals?: number | null
  pts_team_goals?: number | null
  pts_btts?: number | null
  pts_first_team?: number | null
  pts_first_scorer?: number | null
  pred_first_goal_team?: string | null
  pred_first_scorer_id?: number | null
}

export function isKnockout(m: DBMatch): boolean {
  return !m.group_name && (m.round_name ?? 'Group Stage') !== 'Group Stage'
}

export function matchStatus(m: DBMatch, pred?: MyPred | null): PredStatus {
  const scored = m.real_home_score !== null && m.real_away_score !== null
  if (scored) return 'scored'
  const kickedOff = m.is_locked || new Date(m.match_date) <= new Date()
  if (kickedOff) return 'locked'
  return pred ? 'submitted' : 'missing'
}

export function toUIMatch(m: DBMatch, pred?: MyPred | null, weights?: ScoringWeights): UIMatch {
  const knockout = isKnockout(m)
  const scored = m.real_home_score !== null && m.real_away_score !== null
  // League-weighted points when weights are supplied; otherwise the stored total.
  const pts = pred && scored
    ? (weights ? weightedMatchPoints(pred, weights) : (pred.points_awarded ?? null))
    : (pred?.points_awarded ?? null)
  return {
    id: m.id,
    home: m.home_team,
    away: m.away_team,
    kickoff: m.match_date,
    stage: knockout ? (m.round_name ?? 'Knockout') : 'Group',
    group: m.group_name,
    knockout,
    status: matchStatus(m, pred),
    result: scored ? { h: m.real_home_score as number, a: m.real_away_score as number } : null,
    pred: pred ? { h: pred.pred_home, a: pred.pred_away } : null,
    pts,
  }
}
