/**
 * One command to refresh FIFA's team centre cache. It is deliberately the
 * only place the app contacts FIFA; page views read Supabase only.
 *
 * Use DRY_RUN=1 to inspect roster changes without writing.
 * Use SKIP_IMAGES=1 for a faster metadata/stats-only refresh.
 */
import { createClient } from '@supabase/supabase-js'
import { getTeam } from '@/lib/teams'
import { nameKey } from '@/lib/normalize'
import { teamNameToCode } from '@/lib/team-match'
import { finishSyncRun, startSyncRun } from '@/lib/sync-runs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !serviceKey) throw new Error('Missing Supabase environment variables')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const FIFA_API = 'https://cxm-api.fifa.com/fifaplusweb/api'
const FIFA_GAMEDAY_API = 'https://gameday-prod.fifa.mangodev.co.uk/1-0'
const FIFA_SEASON_ID = '285023'
const FIFA_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
const DRY_RUN = process.env.DRY_RUN === '1'
const SKIP_IMAGES = process.env.SKIP_IMAGES === '1'
const HOSTS = new Set(['CAN', 'MEX', 'USA'])

type Tag = { name: string; value: unknown }
type Image = { url: string; classification?: string }
type FifaTeam = {
  _externalId: string; shortName: { eng?: string }; name: { eng?: string }
  images: Image[]; tags: Tag[]; updatedAt?: string
}
type FifaStaff = {
  _externalSportsPersonId: string; firstName?: { eng?: string }; lastName?: { eng?: string }
  jersey?: string | null; height?: number | null; weight?: number | null; images: Image[]
  tags: Tag[]; updatedAt?: string
}
type ExistingPlayer = { id: number; name: string; team_name: string | null; team_code: string | null; fifa_player_id: number | null; photo_url: string | null; fifa_updated_at: string | null }
type ExistingTeam = { code: string; flag_url: string | null; crest_url: string | null; source_updated_at: string | null }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const tagMap = (tags: Tag[]) => Object.fromEntries(tags.map((tag) => [tag.name, tag.value])) as Record<string, unknown>
const statMap = (tags: Tag[]) => Object.fromEntries(tags
  .filter((tag) => tag.name.startsWith('urn:gd:tag:football:stats:'))
  .map((tag) => [tag.name.replace('urn:gd:tag:football:stats:', ''), tag.value]))
const value = (tags: Record<string, unknown>, suffix: string) => tags[`urn:gd:tag:${suffix}`]
const asString = (input: unknown) => typeof input === 'string' ? input : null
const asNumber = (input: unknown) => typeof input === 'number' ? input : Number.isFinite(Number(input)) ? Number(input) : null
const fetchWithTimeout = (input: string, init: RequestInit, timeout = 20_000) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(timeout) })

async function fifaToken() {
  const response = await fetchWithTimeout(`${FIFA_API}/external/gameDay/token`, { headers: { 'user-agent': FIFA_USER_AGENT } })
  if (!response.ok) throw new Error(`FIFA token request failed (${response.status})`)
  const payload = await response.json() as { token?: string }
  if (!payload.token) throw new Error('FIFA token response did not contain a token')
  return payload.token
}

async function fifaGet<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchWithTimeout(`${FIFA_GAMEDAY_API}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/plain, */*',
        origin: 'https://www.fifa.com',
        referer: 'https://www.fifa.com/',
        'user-agent': FIFA_USER_AGENT,
      },
    })
    if (response.ok) return response.json() as Promise<T>
    if (response.status !== 429 || attempt === 3) throw new Error(`FIFA ${path.slice(0, 90)} failed (${response.status}): ${(await response.text()).slice(0, 120)}`)
    await pause(750 * (attempt + 1))
  }
  throw new Error('Unreachable FIFA retry branch')
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const result: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      result[index] = await fn(items[index])
    }
  }))
  return result
}

function position(raw: unknown) {
  switch (String(raw ?? '').toLowerCase().replace(/[ _-]/g, '')) {
    case 'goalkeeper': return 'Goalkeeper'
    case 'keeper': return 'Goalkeeper'
    case 'defender': return 'Defender'
    case 'midfielder': return 'Midfielder'
    case 'forward': return 'Forward'
    default: return 'Unknown'
  }
}

function image(images: Image[], classification: string) {
  return images.find((item) => item.classification === classification)?.url ?? null
}

function compactImage(source: string) {
  return `${source}${source.includes('?') ? '&' : '?'}quality=70&io=transform%3Afit%2Cwidth%3A480`
}

async function existingPlayers() {
  const rows: ExistingPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('players')
      .select('id, name, team_name, team_code, fifa_player_id, photo_url, fifa_updated_at')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []) as ExistingPlayer[])
    if (!data || data.length < 1000) return rows
  }
}

async function existingTeams() {
  const { data, error } = await supabase.from('fifa_teams').select('code, flag_url, crest_url, source_updated_at')
  if (error) throw error
  return (data ?? []) as ExistingTeam[]
}

async function cacheImage(fifaId: number, source: string, sourceUpdatedAt: string | null | undefined, existing: ExistingPlayer | undefined) {
  if (SKIP_IMAGES) return existing?.photo_url ?? null
  if (existing?.photo_url?.includes('/fifa-media/') && existing.fifa_updated_at === sourceUpdatedAt) return existing.photo_url
  const response = await fetchWithTimeout(compactImage(source), { headers: { 'user-agent': FIFA_USER_AGENT } }, 15_000)
  if (!response.ok) throw new Error(`FIFA image ${fifaId} failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 1048576) throw new Error(`FIFA image ${fifaId} exceeded the 1MB cache limit`)
  const path = `players/${fifaId}.png`
  const { error } = await supabase.storage.from('fifa-media').upload(path, bytes, {
    contentType: 'image/png', cacheControl: '31536000', upsert: true,
  })
  if (error) throw error
  return supabase.storage.from('fifa-media').getPublicUrl(path).data.publicUrl
}

async function cacheTeamImage(code: string, kind: 'flag' | 'crest', source: string | null, sourceUpdatedAt: string | null | undefined, existing: ExistingTeam | undefined) {
  if (!source) return null
  const existingUrl = kind === 'flag' ? existing?.flag_url : existing?.crest_url
  if (SKIP_IMAGES) return existingUrl ?? null
  if (existingUrl?.includes('/fifa-media/') && existing?.source_updated_at === sourceUpdatedAt) return existingUrl
  const response = await fetchWithTimeout(compactImage(source), { headers: { 'user-agent': FIFA_USER_AGENT } }, 15_000)
  if (!response.ok) throw new Error(`FIFA ${kind} for ${code} failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 1048576) throw new Error(`FIFA ${kind} for ${code} exceeded the 1MB cache limit`)
  const path = `teams/${code}-${kind}.png`
  const { error } = await supabase.storage.from('fifa-media').upload(path, bytes, {
    contentType: 'image/png', cacheControl: '31536000', upsert: true,
  })
  if (error) throw error
  return supabase.storage.from('fifa-media').getPublicUrl(path).data.publicUrl
}

async function main() {
  let runId: string | null = null
  let recordsRead = 0
  let recordsWritten = 0
  let latestSourceUpdatedAt: string | null = null
  try {
  if (!DRY_RUN) runId = await startSyncRun(supabase, 'fifa_teams', 'cli', { provider: 'fifa', scope: SKIP_IMAGES ? 'teams:metadata' : 'teams:full' })
  console.log(`Fetching FIFA team cache${DRY_RUN ? ' (dry run)' : ''}${SKIP_IMAGES ? ' (without images)' : ''}…`)
  const [token, existing, cachedTeams, matchResult] = await Promise.all([
    fifaToken(),
    existingPlayers(),
    existingTeams(),
    supabase.from('matches').select('home_team, away_team, group_name'),
  ])
  if (matchResult.error) throw matchResult.error

  const teamGroups = new Map<string, string>()
  for (const match of matchResult.data ?? []) {
    const group = match.group_name?.match(/([A-L])$/i)?.[1]?.toUpperCase() ?? null
    if (!group) continue
    teamGroups.set(match.home_team, group)
    teamGroups.set(match.away_team, group)
  }

  const teamPayload = await fifaGet<{ items?: FifaTeam[] }>(token, `/teams?query=${encodeURIComponent(`_externalCompetitionId==\`${FIFA_SEASON_ID}\``)}`)
  const teams = teamPayload.items ?? []
  recordsRead += teams.length
  if (teams.length !== 48) throw new Error(`Expected 48 FIFA teams, received ${teams.length}`)

  const byFifaId = new Map(existing.filter((player) => player.fifa_player_id).map((player) => [player.fifa_player_id!, player]))
  const byTeamCode = new Map(cachedTeams.map((team) => [team.code, team]))
  const byTeamAndName = new Map<string, ExistingPlayer>()
  for (const player of existing) {
    const code = player.team_code ?? teamNameToCode(player.team_name)
    if (code) byTeamAndName.set(`${code}:${nameKey(player.name)}`, player)
  }

  const rosterBundles = await mapLimit(teams, 4, async (team) => {
    const code = team.shortName.eng?.toUpperCase()
    if (!code || !getTeam(code).code || getTeam(code).code !== code) throw new Error(`Unknown FIFA team code: ${code}`)
    const query = encodeURIComponent(`(and _externalTeamId==\`${team._externalId}\` jersey!=null)`)
    const first = await fifaGet<{ matchCount?: number; items?: FifaStaff[] }>(token, `/staff?query=${query}&skip=0&limit=25`)
    // FIFA's later staff pages currently repeat or resurrect superseded records
    // (one team returns 38 rows for a 25-player published selection). The first
    // page is the canonical current squad shown by their team centre.
    return { team, code, roster: first.items ?? [] }
  })
  recordsRead += rosterBundles.reduce((total, bundle) => total + bundle.roster.length, 0)

  const imageJobs: Array<{ fifaId: number; source: string; sourceUpdatedAt?: string; existing?: ExistingPlayer }> = []
  const playerRows: Array<Record<string, unknown>> = []
  for (const { code, roster } of rosterBundles) {
    for (const staff of roster) {
      const fifaId = Number(staff._externalSportsPersonId)
      const tags = tagMap(staff.tags)
      const name = asString(value(tags, 'staff:display_name:eng')) ?? [staff.firstName?.eng, staff.lastName?.eng].filter(Boolean).join(' ')
      const source = image(staff.images, 'urn:gd:image:class:photo:fdcp')
      if (!Number.isSafeInteger(fifaId) || !name) continue
      const existingPlayer = byFifaId.get(fifaId) ?? byTeamAndName.get(`${code}:${nameKey(name)}`)
      if (source) imageJobs.push({ fifaId, source, sourceUpdatedAt: staff.updatedAt, existing: existingPlayer })
      playerRows.push({
        player_id: existingPlayer?.id ?? null,
        fifa_player_id: fifaId,
        name,
        position: position(value(tags, 'staff:position')),
        nationality: asString(value(tags, 'staff:nationality'))?.toUpperCase() ?? null,
        team_name: getTeam(code).playerKey,
        team_code: code,
        jersey_number: asNumber(staff.jersey) ?? asNumber(value(tags, 'staff:shirt_number')),
        photo_url: existingPlayer?.photo_url ?? null,
        dob: asString(value(tags, 'staff:date_of_birth')),
        fifa_image_source: source,
        source_updated_at: staff.updatedAt ?? null,
        height_cm: asNumber(staff.height),
        weight_kg: asNumber(staff.weight),
        stats: statMap(staff.tags),
      })
    }
  }

  // Some provider feeds repeat a player record. Keep one canonical FIFA ID so
  // the transactional upsert can never update the same database row twice.
  const playerTeams = new Map<number, Set<string>>()
  for (const row of playerRows) {
    const fifaId = Number(row.fifa_player_id)
    const teams = playerTeams.get(fifaId) ?? new Set<string>()
    teams.add(String(row.team_code))
    playerTeams.set(fifaId, teams)
  }
  const crossTeamIds = [...playerTeams.values()].filter((teams) => teams.size > 1).length
  if (crossTeamIds) throw new Error(`FIFA payload contains ${crossTeamIds} player ID(s) assigned to multiple teams`)
  const uniqueRows = Array.from(new Map(playerRows.map((row) => [Number(row.fifa_player_id), row])).values())
  const uniqueImageJobs = Array.from(new Map(imageJobs.map((job) => [job.fifaId, job])).values())
  const imageFailures: number[] = []
  const images = await mapLimit(uniqueImageJobs, 4, async (job) => {
    try {
      return [job.fifaId, await cacheImage(job.fifaId, job.source, job.sourceUpdatedAt, job.existing)] as const
    } catch (error) {
      imageFailures.push(job.fifaId)
      console.warn(`  image ${job.fifaId} skipped: ${error instanceof Error ? error.message : String(error)}`)
      return [job.fifaId, job.existing?.photo_url ?? null] as const
    }
  })
  const imageById = new Map(images)
  for (const row of uniqueRows) row.photo_url = imageById.get(Number(row.fifa_player_id)) ?? row.photo_url

  const teamRows = await mapLimit(rosterBundles, 4, async ({ team, code }) => {
    const tags = tagMap(team.tags)
    const cachedTeam = byTeamCode.get(code)
    let flagUrl: string | null = cachedTeam?.flag_url ?? null
    let crestUrl: string | null = cachedTeam?.crest_url ?? null
    try { flagUrl = await cacheTeamImage(code, 'flag', image(team.images, 'urn:gd:image:class:logo:fdcp'), team.updatedAt, cachedTeam) }
    catch (error) { console.warn(`  ${code} flag skipped: ${error instanceof Error ? error.message : String(error)}`) }
    try { crestUrl = await cacheTeamImage(code, 'crest', image(team.images, 'urn:gd:image:class:logo:fdh'), team.updatedAt, cachedTeam) }
    catch (error) { console.warn(`  ${code} crest skipped: ${error instanceof Error ? error.message : String(error)}`) }
    return {
      code,
      fifa_team_id: team._externalId,
      name: team.name.eng ?? getTeam(code).fullName,
      confederation: asString(value(tags, 'team:fdcp:confederation_id')),
      group_letter: teamGroups.get(code) ?? null,
      is_host: HOSTS.has(code),
      flag_url: flagUrl,
      crest_url: crestUrl,
      stats: statMap(team.tags),
      source_updated_at: team.updatedAt ?? null,
    }
  })
  latestSourceUpdatedAt = teamRows.map((team) => team.source_updated_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  if (teamRows.some((team) => !team.confederation) || uniqueRows.length < 1000) throw new Error(`FIFA payload validation failed (${teamRows.length} teams, ${uniqueRows.length} players)`)

  const counts = Object.fromEntries(teamRows.map((team) => [team.code, uniqueRows.filter((player) => player.team_code === team.code).length]))
  const unmatched = uniqueRows.filter((player) => !player.player_id).length
  console.table(Object.entries(counts).map(([code, roster]) => ({ code, roster })))
  console.log(`${teamRows.length} teams, ${uniqueRows.length} FIFA players, ${unmatched} new local player record(s), ${uniqueImageJobs.length} image cache candidate(s), ${imageFailures.length} image failure(s).`)
  if (DRY_RUN) return

  const { error } = await supabase.rpc('replace_fifa_team_cache', { p_teams: teamRows, p_players: uniqueRows })
  if (error) throw error
  recordsWritten = teamRows.length + uniqueRows.length
  if (runId) await finishSyncRun(supabase, runId, 'success', { teams: teamRows.length, players: uniqueRows.length, unmatchedPlayers: unmatched, imageCandidates: uniqueImageJobs.length, imageFailures: imageFailures.length, skipImages: SKIP_IMAGES }, { sourceUpdatedAt: latestSourceUpdatedAt, recordsRead, recordsWritten })
  console.log('Done — FIFA team, roster, stats, and optimized player-image cache updated in Supabase.')
  } catch (error) {
    if (runId) await finishSyncRun(supabase, runId, 'failed', { skipImages: SKIP_IMAGES }, { sourceUpdatedAt: latestSourceUpdatedAt, recordsRead, recordsWritten, errorSummary: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) }).catch(() => undefined)
    throw error
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
