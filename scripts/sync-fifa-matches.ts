/**
 * FIFA GameDay match-centre importer.
 *
 * The app never calls FIFA during a page view. This command maps the full
 * official schedule, then stores published team sheets, substitutions, venue
 * details and match stats in Supabase for the match page to read.
 *
 * FIFA_SYNC_MODE=fixtures npm run data:fifa:fixtures
 * FIFA_SYNC_MODE=lineups  npm run data:fifa:lineups
 * FIFA_SYNC_MODE=stats    npm run data:fifa:stats
 * ALL=1 FIFA_SYNC_MODE=all npm run data:fifa:backfill
 * MATCH_ID=<uuid> FIFA_SYNC_MODE=all npm run data:fifa:matches
 */
import { createClient } from '@supabase/supabase-js'
import { scoreMatchPredictions } from '@/lib/score-sync'
import { snapshotLeagueRanks } from '@/lib/snapshot'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !SERVICE_KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const FIFA_TOKEN_API = 'https://cxm-api.fifa.com/fifaplusweb/api/external/gameDay/token'
const FIFA_GAMEDAY_API = 'https://gameday-prod.fifa.mangodev.co.uk/1-0'
const FIFA_SEASON_ID = '285023'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
const MODE = process.env.FIFA_SYNC_MODE ?? 'all'
const ALL = process.env.ALL === '1'
const MATCH_ID = process.env.MATCH_ID ?? null
const DRY_RUN = process.env.DRY_RUN === '1'

type Tag = { name: string; value: unknown }
type Participant = {
  _externalSportsPersonId?: string
  _externalTeamId?: string
  keyType?: string
  number?: number | string | null
  role?: string
  score?: number | string | null
  firstName?: { eng?: string }
  lastName?: { eng?: string }
  tags?: Tag[]
}
type FifaEvent = {
  _externalId: string
  dateTime: string
  eventCompletionState?: string
  updatedAt?: string
  roundName?: { eng?: string }
  stageName?: { eng?: string }
  participants?: Participant[]
  tags?: Tag[]
}
type DBMatch = {
  id: string; home_team: string; away_team: string; match_date: string
  real_home_score: number | null; real_away_score: number | null
  fifa_event_id: number | null; fifa_updated_at: string | null
}
type Team = { code: string; fifa_team_id: string }
type Player = { id: number; fifa_player_id: number; team_code: string | null }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const fetchTimeout = (url: string, init: RequestInit, timeout = 20_000) => fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null
const minute = (value: unknown) => {
  const match = String(value ?? '').match(/\d+/)
  const valueAsNumber = match ? Number(match[0]) : null
  return valueAsNumber && valueAsNumber > 0 && valueAsNumber <= 130 ? valueAsNumber : null
}

function tagValue(tags: Tag[] | undefined, suffix: string) {
  return tags?.find((tag) => tag.name.endsWith(suffix))?.value ?? null
}
function stats(tags: Tag[] | undefined) {
  return Object.fromEntries((tags ?? [])
    .filter((tag) => tag.name.includes(':stats:') && tag.value !== null && tag.value !== '')
    .map((tag) => [tag.name.slice(tag.name.lastIndexOf(':stats:') + 7), tag.value]))
}
function idTail(value: string | undefined) { return value?.split('_').at(-1) ?? null }
function fullName(person: Participant) { return [person.firstName?.eng, person.lastName?.eng].filter(Boolean).join(' ') }
function key(home: string, away: string) { return `${home}|${away}` }
function finished(event: FifaEvent) { return /complete|finished|closed/i.test(event.eventCompletionState ?? '') }

async function fifaToken() {
  const response = await fetchTimeout(FIFA_TOKEN_API, { headers: { 'user-agent': USER_AGENT } })
  if (!response.ok) throw new Error(`FIFA token request failed (${response.status})`)
  const payload = await response.json() as { token?: string }
  if (!payload.token) throw new Error('FIFA token response did not contain a token')
  return payload.token
}

async function fifaGet<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchTimeout(`${FIFA_GAMEDAY_API}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/plain, */*', origin: 'https://www.fifa.com', referer: 'https://www.fifa.com/', 'user-agent': USER_AGENT },
    })
    if (response.ok) return response.json() as Promise<T>
    if (response.status !== 429 || attempt === 3) throw new Error(`FIFA ${path.slice(0, 100)} failed (${response.status}): ${(await response.text()).slice(0, 160)}`)
    await pause(700 * (attempt + 1))
  }
  throw new Error('FIFA retry limit exceeded')
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const output: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      output[index] = await fn(items[index])
    }
  }))
  return output
}

async function events(token: string) {
  const output: FifaEvent[] = []
  for (let skip = 0; ; skip += 25) {
    const query = encodeURIComponent(`_externalCompetitionId==\`${FIFA_SEASON_ID}\``)
    const page = await fifaGet<{ items?: FifaEvent[]; anotherPage?: boolean }>(token, `/events?query=${query}&skip=${skip}&limit=25`)
    output.push(...(page.items ?? []))
    if (!page.anotherPage) return output
  }
}

function eventTeams(event: FifaEvent, codes: Map<string, string>) {
  const home = event.participants?.find((participant) => participant.role === 'Home Team')
  const away = event.participants?.find((participant) => participant.role === 'Away Team')
  const homeCode = codes.get(idTail(home?._externalTeamId) ?? '')
  const awayCode = codes.get(idTail(away?._externalTeamId) ?? '')
  return { home, away, homeCode, awayCode }
}

function eventMetadata(event: FifaEvent) {
  const tags = event.tags ?? []
  const officials = (event.participants ?? [])
    .filter((participant) => ['Referee', 'Assistant Referee 1', 'Assistant Referee 2', 'Fourth Official', 'Video Assistant Referee (VAR)'].includes(participant.role ?? ''))
    .map((participant) => ({ role: participant.role, name: fullName(participant) }))
  return {
    venue: tagValue(tags, ':stadium:name:eng') ?? tagValue(tags, ':stadium:name'),
    city: tagValue(tags, ':stadium:city:eng') ?? tagValue(tags, ':stadium:city'),
    country: tagValue(tags, ':stadium:country'),
    attendance: number(tagValue(tags, ':fdcp:attendance') ?? tagValue(tags, ':attendance')),
    weather: {
      temperature: number(tagValue(tags, ':fdcp:weather:temperature')),
      humidity: number(tagValue(tags, ':fdcp:weather:humidity')),
      type: tagValue(tags, ':fdcp:weather:type'),
      windSpeed: number(tagValue(tags, ':fdcp:weather:wind_speed')),
    },
    matchNumber: number(tagValue(tags, ':fdcp:match_number') ?? tagValue(tags, ':match_number')),
    fifaMatchId: number(tagValue(tags, ':fdcp:match_id')),
    penaltyHome: number(tagValue(tags, ':fdcp:home_team_penalty_score')),
    penaltyAway: number(tagValue(tags, ':fdcp:away_team_penalty_score')),
    round: event.roundName?.eng ?? null,
    stage: event.stageName?.eng ?? null,
    officials,
  }
}

function lineupRows(event: FifaEvent, players: Map<number, Player>, teams: Map<string, string>) {
  const rows: Array<Record<string, unknown>> = []
  const formations: Record<string, string | null> = {}
  for (const participant of event.participants ?? []) {
    if (participant.role !== 'Player' && participant.role !== 'Reserve Player') continue
    const fifaPlayerId = number(participant._externalSportsPersonId)
    const dbPlayer = fifaPlayerId ? players.get(fifaPlayerId) : null
    const teamCode = teams.get(idTail(participant._externalTeamId) ?? '')
    if (!dbPlayer || !teamCode) continue
    const tags = participant.tags ?? []
    const status = String(tagValue(tags, ':fdcp:player:status:label') ?? '').toLowerCase()
    const isStarting = status === 'starter' || participant.role === 'Player'
    const position = String(tagValue(tags, ':position:code') ?? '') || null
    rows.push({
      team_code: teamCode, player_id: dbPlayer.id, is_starting: isStarting,
      shirt_number: number(tagValue(tags, ':shirt_number') ?? participant.number),
      position_label: position, grid: null, sort_order: rows.filter((row) => row.team_code === teamCode).length,
    })
  }
  const { home, away, homeCode, awayCode } = eventTeams(event, teams)
  if (homeCode) formations[homeCode] = String(tagValue(home?.tags, ':fdcp:team:tactics') ?? '') || null
  if (awayCode) formations[awayCode] = String(tagValue(away?.tags, ':fdcp:team:tactics') ?? '') || null
  return { rows, formations }
}

function substitutions(event: FifaEvent, matchId: string, players: Map<number, Player>, teams: Map<string, string>) {
  const result: Array<Record<string, unknown>> = []
  for (const participant of event.participants ?? []) {
    if (participant.role !== 'Reserve Player') continue
    const tags = participant.tags ?? []
    const inFifa = number(participant._externalSportsPersonId)
    const outFifa = number(tagValue(tags, ':fdcp:substitution_on:for_id'))
    const eventMinute = minute(tagValue(tags, ':fdcp:substitution_on:minute'))
    const teamCode = teams.get(idTail(participant._externalTeamId) ?? '')
    const playerIn = inFifa ? players.get(inFifa) : null
    const playerOut = outFifa ? players.get(outFifa) : null
    // Half-time substitutions with no minute are intentionally ignored: the
    // lineup resolver only applies fully verified, displayable substitutions.
    if (!teamCode || !playerIn || !playerOut || !eventMinute || playerIn.team_code !== teamCode || playerOut.team_code !== teamCode) continue
    result.push({ match_id: matchId, team_code: teamCode, player_out_id: playerOut.id, player_in_id: playerIn.id, minute: eventMinute, source: 'fifa' })
  }
  return result
}

async function main() {
  if (!['fixtures', 'lineups', 'stats', 'all'].includes(MODE)) throw new Error('FIFA_SYNC_MODE must be fixtures, lineups, stats, or all')
  const [token, matchesResult, teamsResult, playersResult] = await Promise.all([
    fifaToken(),
    service.from('matches').select('id, home_team, away_team, match_date, real_home_score, real_away_score, fifa_event_id, fifa_updated_at').order('match_date'),
    service.from('fifa_teams').select('code, fifa_team_id'),
    service.from('players').select('id, fifa_player_id, team_code').not('fifa_player_id', 'is', null),
  ])
  if (matchesResult.error) throw matchesResult.error
  if (teamsResult.error) throw teamsResult.error
  if (playersResult.error) throw playersResult.error
  const matches = (matchesResult.data ?? []) as DBMatch[]
  const teams = (teamsResult.data ?? []) as Team[]
  const players = (playersResult.data ?? []) as Player[]
  const codeByTeamId = new Map(teams.map((team) => [idTail(team.fifa_team_id)!, team.code]))
  const playerByFifaId = new Map(players.map((player) => [player.fifa_player_id, player]))
  const byPair = new Map(matches.map((match) => [key(match.home_team, match.away_team), match]))

  console.log(`Fetching FIFA schedule (${MODE}${ALL ? ', full backfill' : ''}${MATCH_ID ? `, ${MATCH_ID}` : ''}${DRY_RUN ? ', dry run' : ''})…`)
  const schedule = await events(token)
  if (schedule.length !== 104) throw new Error(`Expected 104 FIFA events, got ${schedule.length}`)
  let mapped = 0; let resultsUpdated = 0; let rescored = 0
  const mappedEvents: Array<{ event: FifaEvent; match: DBMatch }> = []
  for (const event of schedule) {
    const { home, away, homeCode, awayCode } = eventTeams(event, codeByTeamId)
    if (!homeCode || !awayCode || !home || !away) continue
    const match = byPair.get(key(homeCode, awayCode))
    if (!match) continue
    mapped++
    mappedEvents.push({ event, match })
    const meta = eventMetadata(event)
    const homeScore = number(home.score)
    const awayScore = number(away.score)
    const final = finished(event)
    const update: Record<string, unknown> = {
      fifa_event_id: number(event._externalId), fifa_match_id: meta.fifaMatchId,
      fifa_status: event.eventCompletionState ?? null,
      fifa_metadata: { ...meta, score: { home: homeScore, away: awayScore }, final },
      fifa_updated_at: event.updatedAt ?? null, match_date: event.dateTime,
    }
    if (final && homeScore != null && awayScore != null) {
      update.real_home_score = homeScore; update.real_away_score = awayScore; update.is_locked = true
    }
    if (!DRY_RUN) {
      const { error } = await service.from('matches').update(update).eq('id', match.id)
      if (error) throw error
    }
    if (final && homeScore != null && awayScore != null && (match.real_home_score !== homeScore || match.real_away_score !== awayScore)) {
      resultsUpdated++
      if (!DRY_RUN) rescored += await scoreMatchPredictions(service, match.id)
    }
  }
  if (!mapped) throw new Error('No MatchDay fixtures mapped to FIFA. Run npm run data:fifa-teams first and check team codes.')
  if (MODE === 'fixtures') {
    if (!DRY_RUN && resultsUpdated) await snapshotLeagueRanks(service)
    console.log(`FIFA fixtures: ${mapped}/104 mapped, ${resultsUpdated} final result(s) updated, ${rescored} prediction(s) rescored.`)
    return
  }

  const now = Date.now()
  const selected = mappedEvents.filter(({ event, match }) => {
    if (MATCH_ID) return match.id === MATCH_ID
    if (ALL) return true
    // Daily sync only reads the details for recent/next fixtures. Schedule
    // mapping above remains cheap and keeps IDs/statuses current for all 104.
    const kickoff = new Date(event.dateTime).getTime()
    return kickoff >= now - 36 * 3600_000 && kickoff <= now + 36 * 3600_000
  })
  console.log(`Fetching detailed FIFA match data for ${selected.length} fixture(s)…`)
  let lineupsWritten = 0; let statsWritten = 0; let substitutionsWritten = 0
  await mapLimit(selected, 3, async ({ event, match }) => {
    if (!ALL && !MATCH_ID && event.updatedAt && match.fifa_updated_at === event.updatedAt) return
    const detail = await fifaGet<FifaEvent>(token, `/events/fifa/${event._externalId}?aggregated=true`)
    if (MODE === 'lineups' || MODE === 'all') {
      const { data: manualRows } = await service.from('lineups').select('id').eq('match_id', match.id).eq('source', 'manual').limit(1)
      const { rows, formations } = lineupRows(detail, playerByFifaId, codeByTeamId)
      const starters = rows.filter((row) => row.is_starting).length
      if (!manualRows?.length && starters >= 20 && !DRY_RUN) {
        const { error } = await service.rpc('replace_fifa_match_lineup', { p_match_id: match.id, p_rows: rows, p_home_formation: formations[match.home_team] ?? null, p_away_formation: formations[match.away_team] ?? null })
        if (error) throw error
        lineupsWritten++
      }
      const verified = substitutions(detail, match.id, playerByFifaId, codeByTeamId)
      if (!DRY_RUN && !manualRows?.length) {
        await service.from('lineup_substitutions').delete().eq('match_id', match.id).eq('source', 'fifa')
        if (verified.length) {
          const { error } = await service.from('lineup_substitutions').upsert(verified, { onConflict: 'match_id,player_out_id,player_in_id,minute' })
          if (error) throw error
          substitutionsWritten += verified.length
        }
      }
    }
    if (MODE === 'stats' || MODE === 'all') {
      const { home, away, homeCode, awayCode } = eventTeams(detail, codeByTeamId)
      const teamsToWrite = [[home, homeCode], [away, awayCode]] as const
      const teamRows = teamsToWrite.flatMap(([participant, teamCode]) => participant && teamCode ? [{ match_id: match.id, team_code: teamCode, stats: stats(participant.tags), source_updated_at: detail.updatedAt ?? null }] : [])
      const playerRows = (detail.participants ?? []).flatMap((participant) => {
        if (participant.role !== 'Player' && participant.role !== 'Reserve Player') return []
        const fifaPlayerId = number(participant._externalSportsPersonId)
        const player = fifaPlayerId ? playerByFifaId.get(fifaPlayerId) : null
        const teamCode = codeByTeamId.get(idTail(participant._externalTeamId) ?? '')
        return player && teamCode ? [{ match_id: match.id, player_id: player.id, team_code: teamCode, stats: stats(participant.tags), source_updated_at: detail.updatedAt ?? null }] : []
      })
      if (!DRY_RUN) {
        if (teamRows.length) { const { error } = await service.from('match_team_stats').upsert(teamRows); if (error) throw error }
        if (playerRows.length) { const { error } = await service.from('match_player_stats').upsert(playerRows); if (error) throw error }
      }
      if (teamRows.length) statsWritten++
    }
  })
  if (!DRY_RUN && resultsUpdated) await snapshotLeagueRanks(service)
  console.log(`FIFA sync: ${mapped}/104 fixtures mapped · ${resultsUpdated} results · ${lineupsWritten} team sheets · ${substitutionsWritten} substitutions · ${statsWritten} stat packs.`)
}

main().catch((error) => { console.error(error); process.exit(1) })
