/**
 * Derive Golden Boot totals from completed fixture goal events, then persist
 * MatchDay-owned standings. This avoids the provider's stale aggregate tables.
 */
import { createClient } from '@supabase/supabase-js'
import { deriveGoldenBootStats, type GoldenBootEvent } from '@/lib/golden-boot'
import { groupPlayersByCode, teamNameToCode, type RosterPlayer } from '@/lib/team-match'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const key = process.env.KICKOFF_API_KEY ?? ''
const league = Number(process.env.KICKOFF_LEAGUE ?? 1)
const season = Number(process.env.KICKOFF_SEASON ?? 2026)
if (!url || !serviceKey) throw new Error('Missing Supabase environment variables')
if (!key) throw new Error('Missing KICKOFF_API_KEY')

const supabase = createClient(url, serviceKey)
const base = 'https://api.kickoffapi.com/api/v1'
const finished = new Set(['FT', 'AET', 'PEN'])

interface Fixture { id: number; statusShort: string; homeTeam: { id: number; name: string }; awayTeam: { id: number; name: string } }

async function kapi<T>(path: string): Promise<T[]> {
  const response = await fetch(`${base}${path}`, { headers: { 'x-api-key': key } })
  if (!response.ok) throw new Error(`kickoffapi ${response.status} on ${path}: ${(await response.text()).slice(0, 120)}`)
  return ((await response.json()) as { response?: T[] }).response ?? []
}

async function main() {
  console.log('Deriving Golden Boot standings from completed fixture events…')
  const [fixtures, players] = await Promise.all([
    kapi<Fixture>(`/fixtures?league=${league}&season=${season}`),
    supabase.from('players').select('id, name, team_name'),
  ])
  if (players.error) throw players.error
  const rosterByCode = groupPlayersByCode((players.data ?? []) as RosterPlayer[])
  const completed = fixtures.filter((fixture) => finished.has(fixture.statusShort))
  const eventFixtures: Array<{ teamCodes: Map<number, string>; events: GoldenBootEvent[] }> = []

  for (const fixture of completed) {
    const events = await kapi<GoldenBootEvent>(`/fixtures/${fixture.id}/events`)
    eventFixtures.push({
      teamCodes: new Map([
        [fixture.homeTeam.id, teamNameToCode(fixture.homeTeam.name) ?? ''],
        [fixture.awayTeam.id, teamNameToCode(fixture.awayTeam.name) ?? ''],
      ]),
      events,
    })
  }

  const stats = deriveGoldenBootStats({ fixtures: eventFixtures, rosterByCode })
  const { error } = await supabase.rpc('replace_golden_boot_stats', { p_rows: stats })
  if (error) throw error
  console.log(`Done — ${stats.length} player rows derived from ${completed.length} finished fixtures.`)
}

main().catch((error) => { console.error(error); process.exit(1) })
