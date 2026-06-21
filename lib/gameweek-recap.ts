import { compareLeaderboard, type AggRow, type ProfileLite, type ScoredPred } from '@/lib/leaderboard'
import { weightedMatchPoints, type MatchBreakdown, type ScoringWeights } from '@/lib/scoring'

export interface RecapMatch {
  id: string
  gw_number: number | null
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
}

export interface RecapPrediction extends MatchBreakdown {
  user_id: string
  match_id: string
  pred_home: number | null
  pred_away: number | null
  points_awarded: number | null
}

export interface GameweekRecap {
  gameweek: number
  state: 'live' | 'final' | 'upcoming'
  totalMatches: number
  scoredMatches: number
  standings: AggRow[]
  leader: AggRow | null
  sniper: AggRow | null
  climber: { row: AggRow; movement: number } | null
  personal: { row: AggRow | null; movement: number | null }
  stories: Array<{ kind: 'highest_points' | 'consensus_miss' | 'exact_calls'; match: RecapMatch; value: number }>
}

function board(predictions: RecapPrediction[], profiles: ProfileLite[], userId: string | null, weights: ScoringWeights) {
  const rows = new Map<string, AggRow>()
  for (const profile of profiles) {
    rows.set(profile.id, {
      id: profile.id, name: profile.username ?? '?', avatar: profile.avatar_url, pts: 0, exact: 0, acc: 0,
      scored: 0, correct: 0, outcomeWins: 0, exactWins: 0, goalDiffWins: 0, totalGoalsWins: 0,
      bttsWins: 0, firstTeamWins: 0, firstScorerWins: 0, streak: 0, you: profile.id === userId,
    })
  }
  for (const prediction of predictions) {
    const row = rows.get(prediction.user_id)
    if (!row) continue
    row.pts += weightedMatchPoints(prediction, weights)
    row.scored++
    if ((prediction.pts_outcome ?? 0) > 0) { row.correct++; row.outcomeWins++ }
    if ((prediction.pts_exact ?? 0) > 0) { row.exact = (row.exact ?? 0) + 1; row.exactWins++ }
    if ((prediction.pts_goal_diff ?? 0) > 0) row.goalDiffWins++
    if ((prediction.pts_total_goals ?? 0) > 0) row.totalGoalsWins++
    if ((prediction.pts_btts ?? 0) > 0) row.bttsWins++
    if ((prediction.pts_first_team ?? 0) > 0) row.firstTeamWins++
    if ((prediction.pts_first_scorer ?? 0) > 0) row.firstScorerWins++
  }
  return Array.from(rows.values()).map((row) => ({ ...row, acc: row.scored ? Math.round((row.correct / row.scored) * 100) : 0 })).sort(compareLeaderboard)
}

export function buildGameweekRecap({
  gameweek, matches, predictions, profiles, userId, weights,
}: {
  gameweek: number
  matches: RecapMatch[]
  predictions: RecapPrediction[]
  profiles: ProfileLite[]
  userId: string | null
  weights: ScoringWeights
}): GameweekRecap {
  const gwMatches = matches.filter((match) => match.gw_number === gameweek)
  const scoredIds = new Set(gwMatches.filter((match) => match.real_home_score != null && match.real_away_score != null).map((match) => match.id))
  const gwPredictions = predictions.filter((prediction) => scoredIds.has(prediction.match_id) && prediction.points_awarded != null)
  const priorIds = new Set(matches.filter((match) => (match.gw_number ?? 99) < gameweek && match.real_home_score != null && match.real_away_score != null).map((match) => match.id))
  const before = board(predictions.filter((prediction) => priorIds.has(prediction.match_id) && prediction.points_awarded != null), profiles, userId, weights)
  const after = board(predictions.filter((prediction) => priorIds.has(prediction.match_id) || scoredIds.has(prediction.match_id)).filter((prediction) => prediction.points_awarded != null), profiles, userId, weights)
  const standings = board(gwPredictions, profiles, userId, weights)
  const previousRank = new Map(before.map((row, index) => [row.id, index + 1]))
  const currentRank = new Map(after.map((row, index) => [row.id, index + 1]))
  const movement = (id: string) => (previousRank.get(id) ?? profiles.length) - (currentRank.get(id) ?? profiles.length)
  const climber = after.map((row) => ({ row, movement: movement(row.id) })).filter((entry) => entry.movement > 0).sort((a, b) => b.movement - a.movement || b.row.pts - a.row.pts)[0] ?? null
  const sniper = [...standings].sort((a, b) => (b.exact ?? 0) - (a.exact ?? 0) || b.pts - a.pts)[0] ?? null

  const matchById = new Map(gwMatches.map((match) => [match.id, match]))
  const pointTotals = new Map<string, number>()
  const exactTotals = new Map<string, number>()
  const outcomeTotals = new Map<string, { correct: number; total: number }>()
  for (const prediction of gwPredictions) {
    pointTotals.set(prediction.match_id, Math.max(pointTotals.get(prediction.match_id) ?? 0, weightedMatchPoints(prediction, weights)))
    exactTotals.set(prediction.match_id, (exactTotals.get(prediction.match_id) ?? 0) + ((prediction.pts_exact ?? 0) > 0 ? 1 : 0))
    const current = outcomeTotals.get(prediction.match_id) ?? { correct: 0, total: 0 }
    current.total++
    if ((prediction.pts_outcome ?? 0) > 0) current.correct++
    outcomeTotals.set(prediction.match_id, current)
  }
  const best = Array.from(pointTotals.entries()).sort((a, b) => b[1] - a[1])[0]
  const exact = Array.from(exactTotals.entries()).sort((a, b) => b[1] - a[1])[0]
  const miss = Array.from(outcomeTotals.entries()).filter(([, value]) => value.total > 0).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))[0]
  const stories: GameweekRecap['stories'] = []
  if (best && matchById.get(best[0])) stories.push({ kind: 'highest_points', match: matchById.get(best[0])!, value: best[1] })
  if (miss && matchById.get(miss[0])) stories.push({ kind: 'consensus_miss', match: matchById.get(miss[0])!, value: Math.round((1 - miss[1].correct / miss[1].total) * 100) })
  if (exact && matchById.get(exact[0])) stories.push({ kind: 'exact_calls', match: matchById.get(exact[0])!, value: exact[1] })

  const scoredMatches = scoredIds.size
  return {
    gameweek,
    state: gwMatches.length === 0 ? 'upcoming' : scoredMatches === gwMatches.length ? 'final' : 'live',
    totalMatches: gwMatches.length,
    scoredMatches,
    standings,
    leader: standings[0] ?? null,
    sniper: sniper && (sniper.exact ?? 0) > 0 ? sniper : null,
    climber,
    personal: { row: standings.find((row) => row.id === userId) ?? null, movement: userId ? movement(userId) : null },
    stories,
  }
}

/** Narrow adapter for pages that already fetch ScoredPred-like rows. */
export function asScoredPredictions(rows: Array<RecapPrediction & { matches?: { gw_number: number | null } | null }>): ScoredPred[] {
  return rows.map((row) => ({ ...row, points_awarded: row.points_awarded ?? 0, matches: row.matches ?? null }))
}
