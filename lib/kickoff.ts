// Server-side Kickoffapi client (https://api.kickoffapi.com). Key stays server-only.
import { teamNameToCode } from '@/lib/team-match'

const KEY = process.env.KICKOFF_API_KEY ?? ''
const BASE = 'https://api.kickoffapi.com/api/v1'
export const WC_LEAGUE = Number(process.env.KICKOFF_LEAGUE ?? 1)   // 1 = World Cup
export const WC_SEASON = Number(process.env.KICKOFF_SEASON ?? 2026)

export function kickoffConfigured(): boolean { return !!KEY }

export async function kapi<T = unknown>(path: string): Promise<{ response: T[] }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-api-key': KEY,
      // Cloudflare on the API challenges datacenter requests with a default UA;
      // a real browser UA + Accept lowers the bot score (helps with bot-fight,
      // though not a full JS "Just a moment" challenge).
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`kickoffapi ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<{ response: T[] }>
}

export interface KFixture {
  id: number
  date: string
  statusShort: string
  homeTeam: { id: number; name: string; goals: number | null }
  awayTeam: { id: number; name: string; goals: number | null }
}

/**
 * Find the Kickoffapi fixture for one of our matches by team codes + date.
 * Returns the fixture and whether our home_team is the fixture's home side
 * (defensive against home/away being recorded differently).
 */
export async function findFixture(homeCode: string, awayCode: string, dateISO: string): Promise<{ fixture: KFixture; homeIsHome: boolean } | null> {
  // Our seed kickoff dates can differ from the provider's, so match by team
  // codes across ALL fixtures and use date proximity only to disambiguate a
  // possible group + knockout rematch.
  const { response } = await kapi<KFixture>(`/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}`)
  const want = new Set([homeCode, awayCode])
  const target = new Date(dateISO).getTime()
  const hits = response
    .map((f) => ({ f, fh: teamNameToCode(f.homeTeam?.name), fa: teamNameToCode(f.awayTeam?.name) }))
    .filter(({ fh, fa }) => fh && fa && fh !== fa && want.has(fh) && want.has(fa))
  if (hits.length === 0) return null
  hits.sort((a, b) => Math.abs(new Date(a.f.date).getTime() - target) - Math.abs(new Date(b.f.date).getTime() - target))
  return { fixture: hits[0].f, homeIsHome: hits[0].fh === homeCode }
}

export interface KLineup {
  teamId: number
  team: { id: number; name: string } | null
  formation: string | null
  startXI: { player: { id: number; name: string; number: number | null; pos: string | null; grid: string | null } }[]
  substitutes: { player: { id: number; name: string; number: number | null; pos: string | null; grid: string | null } }[]
}

export interface KEvent {
  time: number
  teamId: number
  playerId: number | null
  playerName: string | null
  type: string        // 'Goal' | 'Card' | 'subst'
  detail: string      // 'Normal Goal' | 'Penalty' | 'Own Goal' | ...
}
