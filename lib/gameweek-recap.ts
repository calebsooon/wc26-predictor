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

export interface RecapMatchStat {
  match_id: string
  team_code: string
  stats: Record<string, unknown>
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
  stories: Array<{ kind: 'highest_points' | 'consensus_miss' | 'exact_calls' | 'xg_miss'; match: RecapMatch; value: number }>
  headline: string
  moment: { title: string; body: string; kind: 'highest_points' | 'consensus_miss' | 'exact_calls' | 'climber' | 'xg_miss' } | null
  shareText: string
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
  gameweek, matches, predictions, profiles, userId, weights, matchStats,
}: {
  gameweek: number
  matches: RecapMatch[]
  predictions: RecapPrediction[]
  profiles: ProfileLite[]
  userId: string | null
  weights: ScoringWeights
  matchStats?: RecapMatchStat[]
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

  if (matchStats) {
    const xgUpset = gwMatches
      .filter((match) => scoredIds.has(match.id) && match.real_home_score != null && match.real_away_score != null && match.real_home_score !== match.real_away_score)
      .map((match) => {
        const homeXg = Number(matchStats.find((s) => s.match_id === match.id && s.team_code === match.home_team)?.stats?.xg) || 0
        const awayXg = Number(matchStats.find((s) => s.match_id === match.id && s.team_code === match.away_team)?.stats?.xg) || 0
        if (!homeXg && !awayXg) return null
        const homeWon = match.real_home_score! > match.real_away_score!
        const loserXg = homeWon ? awayXg : homeXg
        const winnerXg = homeWon ? homeXg : awayXg
        const upset = loserXg - winnerXg
        if (upset <= 0) return null
        return { match, upset, loserXg }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.upset - a.upset)[0]
    if (xgUpset) stories.push({ kind: 'xg_miss', match: xgUpset.match, value: Math.round(xgUpset.loserXg * 10) / 10 })
  }

  const scoredMatches = scoredIds.size
  const leader = standings[0] ?? null
  const consensusStory = stories.find((story) => story.kind === 'consensus_miss')
  const pointsStory = stories.find((story) => story.kind === 'highest_points')
  const exactStory = stories.find((story) => story.kind === 'exact_calls')
  const xgMissStory = stories.find((story) => story.kind === 'xg_miss')
  const headline = consensusStory
    ? `${consensusStory.match.home_team}–${consensusStory.match.away_team} stunned the league`
    : xgMissStory
      ? `${xgMissStory.match.home_team}–${xgMissStory.match.away_team} defied the xG`
      : climber
        ? `${climber.row.name} climbs ${climber.movement} place${climber.movement === 1 ? '' : 's'}`
        : leader
          ? `${leader.name} leads GW${gameweek} with ${leader.pts} points`
          : `The story of gameweek ${gameweek}`
  const moment = consensusStory
    ? { kind: 'consensus_miss' as const, title: 'Moment of the week', body: `${consensusStory.value}% of the league missed ${consensusStory.match.home_team} ${consensusStory.match.real_home_score}–${consensusStory.match.real_away_score} ${consensusStory.match.away_team}.` }
    : xgMissStory
      ? { kind: 'xg_miss' as const, title: 'xG upset of the week', body: `${xgMissStory.match.home_team} ${xgMissStory.match.real_home_score}–${xgMissStory.match.real_away_score} ${xgMissStory.match.away_team} — the losing side generated ${xgMissStory.value} xG but couldn't convert.` }
      : pointsStory
        ? { kind: 'highest_points' as const, title: 'Moment of the week', body: `${pointsStory.match.home_team} ${pointsStory.match.real_home_score}–${pointsStory.match.real_away_score} ${pointsStory.match.away_team} produced the week's best ${pointsStory.value}-point prediction.` }
        : exactStory
          ? { kind: 'exact_calls' as const, title: 'Moment of the week', body: `${exactStory.value} player${exactStory.value === 1 ? '' : 's'} called ${exactStory.match.home_team} ${exactStory.match.real_home_score}–${exactStory.match.real_away_score} ${exactStory.match.away_team} exactly.` }
          : climber
            ? { kind: 'climber' as const, title: 'Moment of the week', body: `${climber.row.name} gained ${climber.movement} place${climber.movement === 1 ? '' : 's'} on the overall table.` }
            : null
  const podium = standings.slice(0, 3).map((row, index) => `${index + 1}. ${row.name} — ${row.pts} pts`).join('\n')
  const shareText = [
    `🏆 MATCHDAY · GAMEWEEK ${gameweek} RECAP`,
    '',
    headline,
    moment?.body ?? '',
    '',
    '📊 GAMEWEEK TABLE',
    podium || 'No scores settled yet',
    climber ? `📈 Biggest climber: ${climber.row.name} (+${climber.movement})` : '',
    sniper ? `🎯 Scoreline sniper: ${sniper.name} (${sniper.exact} exact)` : '',
    '',
    '#MatchDay',
  ].filter(Boolean).join('\n')
  return {
    gameweek,
    state: gwMatches.length === 0 ? 'upcoming' : scoredMatches === gwMatches.length ? 'final' : 'live',
    totalMatches: gwMatches.length,
    scoredMatches,
    standings,
    leader,
    sniper: sniper && (sniper.exact ?? 0) > 0 ? sniper : null,
    climber,
    personal: { row: standings.find((row) => row.id === userId) ?? null, movement: userId ? movement(userId) : null },
    stories,
    headline,
    moment,
    shareText,
  }
}

/** Narrow adapter for pages that already fetch ScoredPred-like rows. */
export function asScoredPredictions(rows: Array<RecapPrediction & { matches?: { gw_number: number | null } | null }>): ScoredPred[] {
  return rows.map((row) => ({ ...row, points_awarded: row.points_awarded ?? 0, matches: row.matches ?? null }))
}
