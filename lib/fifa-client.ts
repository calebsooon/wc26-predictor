/**
 * FIFA GameDay API client — shared by API routes and CLI scripts.
 * No Supabase dependency; pure fetch + data-shaping utilities.
 */

export const FIFA_TOKEN_API = 'https://cxm-api.fifa.com/fifaplusweb/api/external/gameDay/token'
export const FIFA_GAMEDAY_API = 'https://gameday-prod.fifa.mangodev.co.uk/1-0'
export const FIFA_SEASON_ID = '285023'
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

export type Tag = { name: string; value: unknown }

export type Participant = {
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

export type FifaEvent = {
  _externalId: string
  dateTime: string
  eventCompletionState?: string
  updatedAt?: string
  roundName?: { eng?: string }
  stageName?: { eng?: string }
  participants?: Participant[]
  tags?: Tag[]
}

export type FifaPlayer = { id: number; fifa_player_id: number; team_code: string | null }

/* ── Primitive helpers ──────────────────────────────────── */

export function idTail(value: string | undefined): string | null {
  return value?.split('_').at(-1) ?? null
}

export function number(value: unknown): number | null {
  return Number.isFinite(Number(value)) ? Number(value) : null
}

export function minute(value: unknown): number | null {
  const m = String(value ?? '').match(/\d+/)
  const n = m ? Number(m[0]) : null
  return n && n > 0 && n <= 130 ? n : null
}

export function tagValue(tags: Tag[] | undefined, suffix: string): unknown {
  return tags?.find((tag) => tag.name.endsWith(suffix))?.value ?? null
}

export function stats(tags: Tag[] | undefined): Record<string, unknown> {
  return Object.fromEntries(
    (tags ?? [])
      .filter((tag) => tag.name.includes(':stats:') && tag.value !== null && tag.value !== '')
      .map((tag) => [tag.name.slice(tag.name.lastIndexOf(':stats:') + 7), tag.value])
  )
}

export function finished(event: FifaEvent): boolean {
  return /complete|finished|closed/i.test(event.eventCompletionState ?? '')
}

export function fullName(person: Participant): string {
  return [person.firstName?.eng, person.lastName?.eng].filter(Boolean).join(' ')
}

export function eventTeams(event: FifaEvent, codes: Map<string, string>) {
  const home = event.participants?.find((p) => p.role === 'Home Team')
  const away = event.participants?.find((p) => p.role === 'Away Team')
  const homeCode = codes.get(idTail(home?._externalTeamId) ?? '')
  const awayCode = codes.get(idTail(away?._externalTeamId) ?? '')
  return { home, away, homeCode, awayCode }
}

/* ── HTTP ───────────────────────────────────────────────── */

const pause = (ms: number) => new Promise((res) => setTimeout(res, ms))

export async function fifaToken(): Promise<string> {
  const res = await fetch(FIFA_TOKEN_API, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`FIFA token request failed (${res.status})`)
  const payload = await res.json() as { token?: string }
  if (!payload.token) throw new Error('FIFA token response missing token')
  return payload.token
}

export async function fifaGet<T>(token: string, path: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${FIFA_GAMEDAY_API}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/plain, */*',
        origin: 'https://www.fifa.com',
        referer: 'https://www.fifa.com/',
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (res.ok) return res.json() as Promise<T>
    if (res.status !== 429 || attempt === 3)
      throw new Error(`FIFA ${path.slice(0, 100)} failed (${res.status}): ${(await res.text()).slice(0, 160)}`)
    await pause(700 * (attempt + 1))
  }
  throw new Error('FIFA retry limit exceeded')
}

export async function fetchFifaSchedule(token: string): Promise<FifaEvent[]> {
  const output: FifaEvent[] = []
  for (let skip = 0; ; skip += 25) {
    const query = encodeURIComponent(`_externalCompetitionId==\`${FIFA_SEASON_ID}\``)
    const page = await fifaGet<{ items?: FifaEvent[]; anotherPage?: boolean }>(
      token,
      `/events?query=${query}&skip=${skip}&limit=25`
    )
    output.push(...(page.items ?? []))
    if (!page.anotherPage) return output
  }
}

/* ── Lineup / substitution builders ────────────────────── */

export function lineupRows(
  event: FifaEvent,
  players: Map<number, FifaPlayer>,
  teams: Map<string, string>
): { rows: Array<Record<string, unknown>>; formations: Record<string, string | null> } {
  const rows: Array<Record<string, unknown>> = []
  const formations: Record<string, string | null> = {}

  for (const p of event.participants ?? []) {
    if (p.role !== 'Player' && p.role !== 'Reserve Player') continue
    const fifaId = number(p._externalSportsPersonId)
    const dbPlayer = fifaId ? players.get(fifaId) : null
    const teamCode = teams.get(idTail(p._externalTeamId) ?? '')
    if (!dbPlayer || !teamCode) continue
    const tags = p.tags ?? []
    const status = String(tagValue(tags, ':fdcp:player:status:label') ?? '').toLowerCase()
    const isStarting = status === 'starter' || p.role === 'Player'
    const position = String(tagValue(tags, ':position:code') ?? '') || null
    rows.push({
      team_code: teamCode,
      player_id: dbPlayer.id,
      is_starting: isStarting,
      shirt_number: number(tagValue(tags, ':shirt_number') ?? p.number),
      position_label: position,
      grid: null,
      sort_order: rows.filter((r) => r.team_code === teamCode).length,
    })
  }

  const { home, away, homeCode, awayCode } = eventTeams(event, teams)
  if (homeCode) formations[homeCode] = String(tagValue(home?.tags, ':fdcp:team:tactics') ?? '') || null
  if (awayCode) formations[awayCode] = String(tagValue(away?.tags, ':fdcp:team:tactics') ?? '') || null

  return { rows, formations }
}

export function substitutionRows(
  event: FifaEvent,
  matchId: string,
  players: Map<number, FifaPlayer>,
  teams: Map<string, string>
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []
  for (const p of event.participants ?? []) {
    if (p.role !== 'Reserve Player') continue
    const tags = p.tags ?? []
    const inFifa = number(p._externalSportsPersonId)
    const outFifa = number(tagValue(tags, ':fdcp:substitution_on:for_id'))
    const eventMinute = minute(tagValue(tags, ':fdcp:substitution_on:minute'))
    const teamCode = teams.get(idTail(p._externalTeamId) ?? '')
    const playerIn = inFifa ? players.get(inFifa) : null
    const playerOut = outFifa ? players.get(outFifa) : null
    if (!teamCode || !playerIn || !playerOut || !eventMinute) continue
    if (playerIn.team_code !== teamCode || playerOut.team_code !== teamCode) continue
    result.push({
      match_id: matchId,
      team_code: teamCode,
      player_out_id: playerOut.id,
      player_in_id: playerIn.id,
      minute: eventMinute,
      source: 'fifa',
    })
  }
  return result
}
