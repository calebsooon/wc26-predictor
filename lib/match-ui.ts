import type { UIMatch } from '@/components/football'
import type { PredStatus } from '@/components/ui'

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
}

export interface MyPred {
  pred_home: number
  pred_away: number
  points_awarded: number | null
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

export function toUIMatch(m: DBMatch, pred?: MyPred | null): UIMatch {
  const knockout = isKnockout(m)
  return {
    id: m.id,
    home: m.home_team,
    away: m.away_team,
    kickoff: m.match_date,
    stage: knockout ? (m.round_name ?? 'Knockout') : 'Group',
    group: m.group_name,
    knockout,
    status: matchStatus(m, pred),
    result: m.real_home_score !== null && m.real_away_score !== null
      ? { h: m.real_home_score, a: m.real_away_score } : null,
    pred: pred ? { h: pred.pred_home, a: pred.pred_away } : null,
    pts: pred?.points_awarded ?? null,
  }
}
