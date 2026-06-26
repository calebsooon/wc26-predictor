// Shared scoring helper: re-score every prediction for one match against its
// final result + first scorer. Shared by the FIFA result sync flows.
import type { SupabaseClient } from '@supabase/supabase-js'
import { scorePrediction, type PredictionInput } from '@/lib/scoring'
import { equivalentPlayerIdsForScoring } from '@/lib/player-equivalence'

interface MatchResult {
  id: string; home_team: string; away_team: string
  real_home_score: number | null; real_away_score: number | null
  first_goal_team: string | null; first_goal_player_id: number | null
}

export async function scoreMatchPredictions(service: SupabaseClient, matchId: string): Promise<number> {
  const { data: match } = await service
    .from('matches')
    .select('id, home_team, away_team, real_home_score, real_away_score, first_goal_team, first_goal_player_id')
    .eq('id', matchId).single()
  if (!match) return 0
  const m = match as unknown as MatchResult
  if (m.real_home_score == null || m.real_away_score == null) return 0

  const { data: preds } = await service
    .from('predictions')
    .select('user_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer')
    .eq('match_id', matchId)
  if (!preds?.length) return 0

  const scorerIds = (preds as { pred_first_scorer_id?: number | null }[])
    .map((p) => p.pred_first_scorer_id)
  const equivalents = await equivalentPlayerIdsForScoring(service, [m.first_goal_player_id, ...scorerIds])
  const result = {
    home_team: m.home_team, away_team: m.away_team,
    real_home_score: m.real_home_score as number, real_away_score: m.real_away_score as number,
    first_goal_team: m.first_goal_team, first_goal_player_id: m.first_goal_player_id,
    equivalent_first_scorer_ids: m.first_goal_player_id ? equivalents.get(m.first_goal_player_id) : null,
  }
  type Row = PredictionInput & { user_id: string }
  const updates = (preds as unknown as Row[]).map((p) => {
    const b = scorePrediction(p, result)
    return {
      user_id: p.user_id, match_id: matchId, pred_home: p.pred_home, pred_away: p.pred_away,
      points_awarded: b.total, pts_outcome: b.outcome, pts_exact: b.exact, pts_goal_diff: b.goalDiff,
      pts_total_goals: b.totalGoals, pts_team_goals: b.teamGoals, pts_btts: b.btts,
      pts_first_team: b.firstTeam, pts_first_scorer: b.firstScorer,
    }
  })
  const { error } = await service.from('predictions').upsert(updates, { onConflict: 'user_id,match_id' })
  if (error) throw new Error(error.message)
  return updates.length
}
