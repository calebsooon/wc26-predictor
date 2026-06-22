import { compareLeaderboard, type AggRow, type ProfileLite, type ScoredPred } from '@/lib/leaderboard'
import { weightedMatchPoints, type MatchBreakdown, type ScoringWeights } from '@/lib/scoring'

export interface RecapMatch {
  id: string
  gw_number: number | null
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  first_goal_player_id?: number | null
}

export interface RecapPrediction extends MatchBreakdown {
  user_id: string
  match_id: string
  pred_home: number | null
  pred_away: number | null
  pred_first_scorer_id?: number | null
  pred_no_scorer?: boolean | null
  points_awarded: number | null
}

export interface RecapMatchStat {
  match_id: string
  team_code: string
  stats: Record<string, unknown>
}

export interface RecapPlayerStat {
  player_id: number
  team_code: string
  match_id: string
  stats: Record<string, unknown>
}

export interface CategoryStat {
  hits: number
  total: number
  rate: number // 0–1
}

export interface MatchSummary {
  match: RecapMatch
  avgPts: number
  outcomeAccuracy: number | null // 0–100
  exactCount: number
  totalPicks: number
  homeXg: number | null
  awayXg: number | null
  homePossession: number | null // 0–100
  homeShots: number | null
  awayShots: number | null
}

export interface PersonalBreakdown {
  totalPts: number
  rank: number
  categories: Array<{
    key: string
    label: string
    yourPts: number
    leagueAvgPts: number
    yourHits: number
    leagueHitRate: number // 0–1
  }>
}

export interface FirstScorerInsight {
  totalPickers: number       // predictions with a specific player picked
  noPickers: number          // predictions with "no scorer"
  hits: number               // correct first scorer calls
  hitRate: number            // hits / totalPickers (0–1)
  mostPickedId: number | null
  mostPickedCount: number
  correctScorerId: number | null
}

export interface TopGoalScorer {
  playerId: number
  name: string | null
  teamCode: string
  goals: number
  assists: number
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
  faller: { row: AggRow; movement: number } | null
  personal: { row: AggRow | null; movement: number | null }
  personalBreakdown: PersonalBreakdown | null
  stories: Array<{ kind: 'highest_points' | 'consensus_miss' | 'exact_calls' | 'xg_miss'; match: RecapMatch; value: number }>
  categoryBreakdown: Record<string, CategoryStat>
  matchSummaries: MatchSummary[]
  firstScorerInsight: FirstScorerInsight | null
  topGoalScorer: TopGoalScorer | null
  hardestMatch: MatchSummary | null
  headline: string
  moment: { title: string; body: string; kind: 'highest_points' | 'consensus_miss' | 'exact_calls' | 'climber' | 'xg_miss' } | null
  shareText: string
  leagueSize: number
}

function statNum(stats: Record<string, unknown>, key: string): number {
  return Number(stats[key]) || 0
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
  gameweek, matches, predictions, profiles, userId, weights, matchStats, playerStats, playerNames,
}: {
  gameweek: number
  matches: RecapMatch[]
  predictions: RecapPrediction[]
  profiles: ProfileLite[]
  userId: string | null
  weights: ScoringWeights
  matchStats?: RecapMatchStat[]
  playerStats?: RecapPlayerStat[]
  playerNames?: Map<number, string>
}): GameweekRecap {
  const gwMatches = matches.filter((m) => m.gw_number === gameweek)
  const scoredIds = new Set(gwMatches.filter((m) => m.real_home_score != null && m.real_away_score != null).map((m) => m.id))
  const gwPredictions = predictions.filter((p) => scoredIds.has(p.match_id) && p.points_awarded != null)
  const priorIds = new Set(matches.filter((m) => (m.gw_number ?? 99) < gameweek && m.real_home_score != null).map((m) => m.id))

  const before = board(predictions.filter((p) => priorIds.has(p.match_id) && p.points_awarded != null), profiles, userId, weights)
  const after = board(predictions.filter((p) => (priorIds.has(p.match_id) || scoredIds.has(p.match_id)) && p.points_awarded != null), profiles, userId, weights)
  const standings = board(gwPredictions, profiles, userId, weights)

  const previousRank = new Map(before.map((r, i) => [r.id, i + 1]))
  const currentRank = new Map(after.map((r, i) => [r.id, i + 1]))
  const movement = (id: string) => (previousRank.get(id) ?? profiles.length) - (currentRank.get(id) ?? profiles.length)

  const climber = after.map((r) => ({ row: r, movement: movement(r.id) }))
    .filter((e) => e.movement > 0).sort((a, b) => b.movement - a.movement || b.row.pts - a.row.pts)[0] ?? null
  const faller = after.map((r) => ({ row: r, movement: movement(r.id) }))
    .filter((e) => e.movement < 0).sort((a, b) => a.movement - b.movement)[0] ?? null
  const sniper = [...standings].sort((a, b) => (b.exact ?? 0) - (a.exact ?? 0) || b.pts - a.pts)[0] ?? null

  // ── Category breakdown ───────────────────────────────
  const catHits = { outcome: 0, exact: 0, goalDiff: 0, totalGoals: 0, btts: 0, firstTeam: 0, firstScorer: 0 }
  const catTotal = { outcome: 0, exact: 0, goalDiff: 0, totalGoals: 0, btts: 0, firstTeam: 0, firstScorer: 0 }
  const catPtsSum = { outcome: 0, exact: 0, goalDiff: 0, totalGoals: 0, btts: 0, firstTeam: 0, firstScorer: 0 }

  for (const p of gwPredictions) {
    catTotal.outcome++; if ((p.pts_outcome ?? 0) > 0) catHits.outcome++
    catPtsSum.outcome += p.pts_outcome ?? 0
    catTotal.exact++; if ((p.pts_exact ?? 0) > 0) catHits.exact++
    catPtsSum.exact += p.pts_exact ?? 0
    catTotal.goalDiff++; if ((p.pts_goal_diff ?? 0) > 0) catHits.goalDiff++
    catPtsSum.goalDiff += p.pts_goal_diff ?? 0
    catTotal.totalGoals++; if ((p.pts_total_goals ?? 0) > 0) catHits.totalGoals++
    catPtsSum.totalGoals += p.pts_total_goals ?? 0
    catTotal.btts++; if ((p.pts_btts ?? 0) > 0) catHits.btts++
    catPtsSum.btts += p.pts_btts ?? 0
    catTotal.firstTeam++; if ((p.pts_first_team ?? 0) > 0) catHits.firstTeam++
    catPtsSum.firstTeam += p.pts_first_team ?? 0
    catTotal.firstScorer++; if ((p.pts_first_scorer ?? 0) > 0) catHits.firstScorer++
    catPtsSum.firstScorer += p.pts_first_scorer ?? 0
  }

  const mkCat = (k: keyof typeof catHits): CategoryStat => ({
    hits: catHits[k], total: catTotal[k],
    rate: catTotal[k] > 0 ? catHits[k] / catTotal[k] : 0,
  })
  const categoryBreakdown: Record<string, CategoryStat> = {
    outcome: mkCat('outcome'), exact: mkCat('exact'), goalDiff: mkCat('goalDiff'),
    totalGoals: mkCat('totalGoals'), btts: mkCat('btts'),
    firstTeam: mkCat('firstTeam'), firstScorer: mkCat('firstScorer'),
  }

  // ── Match summaries ──────────────────────────────────
  const matchSummaries: MatchSummary[] = gwMatches
    .filter((m) => scoredIds.has(m.id))
    .map((m) => {
      const preds = gwPredictions.filter((p) => p.match_id === m.id)
      const totalPicks = preds.length
      const outcomeHits = preds.filter((p) => (p.pts_outcome ?? 0) > 0).length
      const exactCount = preds.filter((p) => (p.pts_exact ?? 0) > 0).length
      const avgPts = totalPicks > 0
        ? preds.reduce((s, p) => s + weightedMatchPoints(p, weights), 0) / totalPicks : 0
      const hs = matchStats?.find((s) => s.match_id === m.id && s.team_code === m.home_team)
      const as_ = matchStats?.find((s) => s.match_id === m.id && s.team_code === m.away_team)
      const rawPoss = hs ? statNum(hs.stats, 'possession') : null
      const homePossession = rawPoss != null
        ? (rawPoss <= 1 ? Math.round(rawPoss * 100) : Math.round(rawPoss))
        : null
      return {
        match: m,
        avgPts: Math.round(avgPts * 10) / 10,
        outcomeAccuracy: totalPicks > 0 ? Math.round((outcomeHits / totalPicks) * 100) : null,
        exactCount,
        totalPicks,
        homeXg: hs ? (statNum(hs.stats, 'xg') || null) : null,
        awayXg: as_ ? (statNum(as_.stats, 'xg') || null) : null,
        homePossession,
        homeShots: hs ? (statNum(hs.stats, 'attempt_at_goal') || null) : null,
        awayShots: as_ ? (statNum(as_.stats, 'attempt_at_goal') || null) : null,
      }
    })
    .sort((a, b) => b.avgPts - a.avgPts)

  const hardestMatch = matchSummaries.length
    ? [...matchSummaries].sort((a, b) => (a.outcomeAccuracy ?? 100) - (b.outcomeAccuracy ?? 100))[0]
    : null

  // ── Personal breakdown ───────────────────────────────
  const leagueSize = profiles.length
  const userPreds = gwPredictions.filter((p) => p.user_id === userId)
  const userRow = standings.find((r) => r.id === userId) ?? null
  const userRank = userRow ? standings.findIndex((r) => r.id === userId) + 1 : null

  const personalBreakdown: PersonalBreakdown | null = userId && userPreds.length > 0 ? {
    totalPts: userRow?.pts ?? 0,
    rank: userRank ?? leagueSize,
    categories: [
      { key: 'outcome', label: 'Outcomes', yourPts: userPreds.reduce((s, p) => s + (p.pts_outcome ?? 0), 0), leagueAvgPts: catTotal.outcome > 0 ? catPtsSum.outcome / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_outcome ?? 0) > 0).length, leagueHitRate: categoryBreakdown.outcome.rate },
      { key: 'exact', label: 'Exact scores', yourPts: userPreds.reduce((s, p) => s + (p.pts_exact ?? 0), 0), leagueAvgPts: catTotal.exact > 0 ? catPtsSum.exact / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_exact ?? 0) > 0).length, leagueHitRate: categoryBreakdown.exact.rate },
      { key: 'goalDiff', label: 'Goal diff', yourPts: userPreds.reduce((s, p) => s + (p.pts_goal_diff ?? 0), 0), leagueAvgPts: catTotal.goalDiff > 0 ? catPtsSum.goalDiff / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_goal_diff ?? 0) > 0).length, leagueHitRate: categoryBreakdown.goalDiff.rate },
      { key: 'totalGoals', label: 'Total goals', yourPts: userPreds.reduce((s, p) => s + (p.pts_total_goals ?? 0), 0), leagueAvgPts: catTotal.totalGoals > 0 ? catPtsSum.totalGoals / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_total_goals ?? 0) > 0).length, leagueHitRate: categoryBreakdown.totalGoals.rate },
      { key: 'btts', label: 'BTTS', yourPts: userPreds.reduce((s, p) => s + (p.pts_btts ?? 0), 0), leagueAvgPts: catTotal.btts > 0 ? catPtsSum.btts / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_btts ?? 0) > 0).length, leagueHitRate: categoryBreakdown.btts.rate },
      { key: 'firstTeam', label: 'First team', yourPts: userPreds.reduce((s, p) => s + (p.pts_first_team ?? 0), 0), leagueAvgPts: catTotal.firstTeam > 0 ? catPtsSum.firstTeam / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_first_team ?? 0) > 0).length, leagueHitRate: categoryBreakdown.firstTeam.rate },
      { key: 'firstScorer', label: 'First scorer', yourPts: userPreds.reduce((s, p) => s + (p.pts_first_scorer ?? 0), 0), leagueAvgPts: catTotal.firstScorer > 0 ? catPtsSum.firstScorer / leagueSize : 0, yourHits: userPreds.filter((p) => (p.pts_first_scorer ?? 0) > 0).length, leagueHitRate: categoryBreakdown.firstScorer.rate },
    ],
  } : null

  // ── First scorer insight (aggregate across all GW matches) ──
  const scorerPicks = gwPredictions.filter((p) => p.pred_first_scorer_id != null && p.pred_first_scorer_id !== -1 && !p.pred_no_scorer)
  const noPickers = gwPredictions.filter((p) => p.pred_no_scorer).length
  const pickerCount = new Map<number, number>()
  for (const p of scorerPicks) {
    const id = p.pred_first_scorer_id!
    pickerCount.set(id, (pickerCount.get(id) ?? 0) + 1)
  }
  const scoredMatchesWithScorer = gwMatches.filter((m) => scoredIds.has(m.id) && m.first_goal_player_id != null)
  const scorerHits = gwPredictions.filter((p) =>
    scoredMatchesWithScorer.some((m) => m.id === p.match_id && m.first_goal_player_id === p.pred_first_scorer_id)
  ).length
  const mostPickedEntry = [...pickerCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const correctScorerIds = new Set(scoredMatchesWithScorer.map((m) => m.first_goal_player_id!))

  const firstScorerInsight: FirstScorerInsight | null = gwPredictions.length > 0 ? {
    totalPickers: scorerPicks.length,
    noPickers,
    hits: scorerHits,
    hitRate: scorerPicks.length > 0 ? scorerHits / scorerPicks.length : 0,
    mostPickedId: mostPickedEntry?.[0] ?? null,
    mostPickedCount: mostPickedEntry?.[1] ?? 0,
    correctScorerId: correctScorerIds.size === 1 ? [...correctScorerIds][0] : null,
  } : null

  // ── Top goal scorer this GW ─────────────────────────
  const goalsByPlayer = new Map<number, { goals: number; assists: number; teamCode: string }>()
  for (const ps of playerStats ?? []) {
    if (!scoredIds.has(ps.match_id)) continue
    const goals = statNum(ps.stats, 'goals')
    const assists = statNum(ps.stats, 'assists')
    if (goals === 0 && assists === 0) continue
    const existing = goalsByPlayer.get(ps.player_id) ?? { goals: 0, assists: 0, teamCode: ps.team_code }
    existing.goals += goals
    existing.assists += assists
    goalsByPlayer.set(ps.player_id, existing)
  }
  const topEntry = [...goalsByPlayer.entries()].sort((a, b) => b[1].goals - a[1].goals || b[1].assists - a[1].assists)[0]
  const topGoalScorer: TopGoalScorer | null = topEntry && topEntry[1].goals > 0 ? {
    playerId: topEntry[0],
    name: playerNames?.get(topEntry[0]) ?? null,
    teamCode: topEntry[1].teamCode,
    goals: topEntry[1].goals,
    assists: topEntry[1].assists,
  } : null

  // ── Stories & headline ───────────────────────────────
  const matchById = new Map(gwMatches.map((m) => [m.id, m]))
  const pointTotals = new Map<string, number>()
  const exactTotals = new Map<string, number>()
  const outcomeTotals = new Map<string, { correct: number; total: number }>()
  for (const p of gwPredictions) {
    pointTotals.set(p.match_id, Math.max(pointTotals.get(p.match_id) ?? 0, weightedMatchPoints(p, weights)))
    exactTotals.set(p.match_id, (exactTotals.get(p.match_id) ?? 0) + ((p.pts_exact ?? 0) > 0 ? 1 : 0))
    const ot = outcomeTotals.get(p.match_id) ?? { correct: 0, total: 0 }
    ot.total++; if ((p.pts_outcome ?? 0) > 0) ot.correct++
    outcomeTotals.set(p.match_id, ot)
  }
  const bestPts = [...pointTotals.entries()].sort((a, b) => b[1] - a[1])[0]
  const bestExact = [...exactTotals.entries()].sort((a, b) => b[1] - a[1])[0]
  const biggestMiss = [...outcomeTotals.entries()].filter(([, v]) => v.total > 0).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))[0]

  const stories: GameweekRecap['stories'] = []
  if (bestPts && matchById.get(bestPts[0])) stories.push({ kind: 'highest_points', match: matchById.get(bestPts[0])!, value: bestPts[1] })
  if (biggestMiss && matchById.get(biggestMiss[0])) stories.push({ kind: 'consensus_miss', match: matchById.get(biggestMiss[0])!, value: Math.round((1 - biggestMiss[1].correct / biggestMiss[1].total) * 100) })
  if (bestExact && matchById.get(bestExact[0])) stories.push({ kind: 'exact_calls', match: matchById.get(bestExact[0])!, value: bestExact[1] })

  if (matchStats) {
    const xgUpset = gwMatches
      .filter((m) => scoredIds.has(m.id) && m.real_home_score != null && m.real_away_score != null && m.real_home_score !== m.real_away_score)
      .map((m) => {
        const hXg = statNum(matchStats.find((s) => s.match_id === m.id && s.team_code === m.home_team)?.stats ?? {}, 'xg')
        const aXg = statNum(matchStats.find((s) => s.match_id === m.id && s.team_code === m.away_team)?.stats ?? {}, 'xg')
        if (!hXg && !aXg) return null
        const homeWon = m.real_home_score! > m.real_away_score!
        const loserXg = homeWon ? aXg : hXg
        const winnerXg = homeWon ? hXg : aXg
        if (loserXg - winnerXg <= 0) return null
        return { match: m, upset: loserXg - winnerXg, loserXg }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.upset - a.upset)[0]
    if (xgUpset) stories.push({ kind: 'xg_miss', match: xgUpset.match, value: Math.round(xgUpset.loserXg * 10) / 10 })
  }

  const scoredMatches = scoredIds.size
  const leader = standings[0] ?? null
  const consensusStory = stories.find((s) => s.kind === 'consensus_miss')
  const pointsStory = stories.find((s) => s.kind === 'highest_points')
  const exactStory = stories.find((s) => s.kind === 'exact_calls')
  const xgMissStory = stories.find((s) => s.kind === 'xg_miss')

  const headline = consensusStory
    ? `Nobody saw ${consensusStory.match.home_team}–${consensusStory.match.away_team} coming`
    : xgMissStory
      ? `${xgMissStory.match.home_team}–${xgMissStory.match.away_team} defied the numbers`
      : topGoalScorer?.name
        ? `${topGoalScorer.name} was the story of GW${gameweek}`
        : climber
          ? `${climber.row.name} storms up ${climber.movement} place${climber.movement === 1 ? '' : 's'}`
          : leader
            ? `${leader.name} owns GW${gameweek} with ${leader.pts} points`
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

  const podium = standings.slice(0, 3).map((r, i) => `${i + 1}. ${r.name} — ${r.pts} pts${(r.exact ?? 0) ? ` · ${r.exact} exact` : ''}`).join('\n')
  const personal = standings.find((r) => r.id === userId) ?? null
  const personalRank = personal ? standings.findIndex((r) => r.id === personal.id) + 1 : null
  const shareText = [
    `MATCHDAY · GW${gameweek} RECAP`,
    '',
    `"${headline}"`,
    moment?.body ?? '',
    '',
    'PODIUM',
    podium || 'No scores settled yet',
    climber ? `Biggest climber: ${climber.row.name} (+${climber.movement})` : '',
    sniper ? `Scoreline sniper: ${sniper.name} (${sniper.exact} exact)` : '',
    topGoalScorer?.name ? `Top scorer: ${topGoalScorer.name} (${topGoalScorer.goals}G)` : '',
    personal && personalRank ? `My week: #${personalRank} · ${personal.pts} pts${personal.exact ? ` · ${personal.exact} exact` : ''}` : '',
    '',
    'Private league recap · #MatchDay',
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
    faller,
    personal: { row: standings.find((r) => r.id === userId) ?? null, movement: userId ? movement(userId) : null },
    personalBreakdown,
    stories,
    categoryBreakdown,
    matchSummaries,
    firstScorerInsight,
    topGoalScorer,
    hardestMatch,
    headline,
    moment,
    shareText,
    leagueSize,
  }
}

/** Narrow adapter for pages that already fetch ScoredPred-like rows. */
export function asScoredPredictions(rows: Array<RecapPrediction & { matches?: { gw_number: number | null } | null }>): ScoredPred[] {
  return rows.map((r) => ({ ...r, points_awarded: r.points_awarded ?? 0, matches: r.matches ?? null }))
}
