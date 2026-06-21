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
import { getTeam } from '@/lib/teams'

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

async function allFifaPlayers() {
  const output: Player[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('players').select('id, fifa_player_id, team_code').not('fifa_player_id', 'is', null).range(from, from + 999)
    if (error) throw error
    output.push(...(data ?? []) as Player[])
    if (!data || data.length < 1000) return output
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

/**
 * FIFA's published team-centre roster can lag behind a matchday sheet. Keep
 * the official event usable by adding only the missing participants required
 * to render that verified match; the normal team-cache sync remains the
 * authority for the broader squad browser.
 */
async function ensureEventPlayers(event: FifaEvent, players: Map<number, Player>, teams: Map<string, string>) {
  const missing = (event.participants ?? []).flatMap((participant) => {
    if (participant.role !== 'Player' && participant.role !== 'Reserve Player') return []
    const fifaPlayerId = number(participant._externalSportsPersonId)
    const teamCode = teams.get(idTail(participant._externalTeamId) ?? '')
    const name = String(tagValue(participant.tags, ':fdcp:player:name:eng') ?? '').trim()
    if (!fifaPlayerId || players.has(fifaPlayerId) || !teamCode || !name) return []
    const position = String(tagValue(participant.tags, ':position:description') ?? 'Unknown')
    return [{
      fifa_player_id: fifaPlayerId,
      name,
      position,
      nationality: teamCode,
      team_name: getTeam(teamCode).playerKey,
      team_code: teamCode,
      jersey_number: number(tagValue(participant.tags, ':shirt_number') ?? participant.number),
      last_updated: new Date().toISOString(),
    }]
  })
  const unique = Array.from(new Map(missing.map((player) => [player.fifa_player_id, player])).values())
  if (!unique.length || DRY_RUN) return 0
  const { data, error } = await service.from('players').upsert(unique, { onConflict: 'fifa_player_id' }).select('id, fifa_player_id, team_code')
  if (error) throw error
  for (const player of data ?? []) {
    if (player.fifa_player_id != null) players.set(Number(player.fifa_player_id), { id: player.id, fifa_player_id: Number(player.fifa_player_id), team_code: player.team_code })
  }
  return data?.length ?? 0
}

async function main() {
  if (!['fixtures', 'lineups', 'stats', 'all'].includes(MODE)) throw new Error('FIFA_SYNC_MODE must be fixtures, lineups, stats, or all')
  const [token, matchesResult, teamsResult, players] = await Promise.all([
    fifaToken(),
    service.from('matches').select('id, home_team, away_team, match_date, real_home_score, real_away_score, fifa_event_id, fifa_updated_at').order('match_date'),
    service.from('fifa_teams').select('code, fifa_team_id'),
    allFifaPlayers(),
  ])
  if (matchesResult.error) throw matchesResult.error
  if (teamsResult.error) throw teamsResult.error
  const matches = (matchesResult.data ?? []) as DBMatch[]
  const teams = (teamsResult.data ?? []) as Team[]
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
  let lineupsWritten = 0; let statsWritten = 0; let substitutionsWritten = 0; let matchdayPlayersWritten = 0
  // Backfills are deliberately sequential: the same player may appear in
  // several historic match sheets, and serial writes keep event-player
  // additions deterministic on Supabase.
  await mapLimit(selected, ALL ? 1 : 3, async ({ event, match }) => {
    if (!ALL && !MATCH_ID && event.updatedAt && match.fifa_updated_at === event.updatedAt) return
    const detail = await fifaGet<FifaEvent>(token, `/events/fifa/${event._externalId}?aggregated=true`)
    if (MODE === 'lineups' || MODE === 'all') {
      matchdayPlayersWritten += await ensureEventPlayers(detail, playerByFifaId, codeByTeamId)
      const { data: manualRows, error: manualError } = await service.from('lineups').select('team_code').eq('match_id', match.id).eq('source', 'manual')
      if (manualError) throw manualError
      const manualTeams = new Set((manualRows ?? []).map((row) => row.team_code))
      const { rows, formations } = lineupRows(detail, playerByFifaId, codeByTeamId)
      for (const teamCode of [match.home_team, match.away_team]) {
        if (manualTeams.has(teamCode)) continue
        const teamRows = rows.filter((row) => row.team_code === teamCode)
        const starters = teamRows.filter((row) => row.is_starting).length
        if (starters < 11) {
          if (teamRows.length) console.warn(`${match.home_team} v ${match.away_team}: ${teamCode} only has ${starters} matched FIFA starters — preserving existing rows`)
          continue
        }
        if (!DRY_RUN) {
          // We have confirmed that this team has no manual correction. Replace
          // any previous provider rows only for this team, leaving the opponent
          // (and its hand-positioned pitch) untouched.
          const { error: deleteError } = await service.from('lineups').delete().eq('match_id', match.id).eq('team_code', teamCode)
          if (deleteError) throw deleteError
          const { error: insertError } = await service.from('lineups').insert(teamRows.map((row) => ({ ...row, match_id: match.id, source: 'fifa' })))
          if (insertError) throw insertError
          const formationColumn = teamCode === match.home_team ? 'home_formation' : 'away_formation'
          const { error: formationError } = await service.from('matches').update({ [formationColumn]: formations[teamCode] ?? null }).eq('id', match.id)
          if (formationError) throw formationError
        }
        lineupsWritten++
      }
      const verified = substitutions(detail, match.id, playerByFifaId, codeByTeamId)
      if (!DRY_RUN) {
        for (const teamCode of [match.home_team, match.away_team]) {
          if (manualTeams.has(teamCode)) continue
          const teamSubs = verified.filter((row) => row.team_code === teamCode)
          const { error: deleteError } = await service.from('lineup_substitutions').delete().eq('match_id', match.id).eq('team_code', teamCode).eq('source', 'fifa')
          if (deleteError) throw deleteError
          if (teamSubs.length) {
            const { error } = await service.from('lineup_substitutions').upsert(teamSubs, { onConflict: 'match_id,player_out_id,player_in_id,minute' })
            if (error) throw error
            substitutionsWritten += teamSubs.length
          }
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
  console.log(`FIFA sync: ${mapped}/104 fixtures mapped · ${resultsUpdated} results · ${lineupsWritten} team sheets · ${substitutionsWritten} substitutions · ${statsWritten} stat packs · ${matchdayPlayersWritten} matchday players added.`)
}

main().catch((error) => { console.error(error); process.exit(1) })
