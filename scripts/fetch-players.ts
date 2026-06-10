/**
 * Fetches WC2026 squad data from football-data.org v4 API and upserts players into Supabase.
 *
 * Usage:
 *   FOOTBALL_API_TOKEN=<token> SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<key> npx tsx scripts/fetch-players.ts
 *
 * Get a free API token at: https://www.football-data.org/client/register
 * SUPABASE_SERVICE_KEY is your project's "service_role" key (NOT the anon key).
 *
 * The free tier allows 10 req/min — this script respects that with a 7 s delay between team requests.
 *
 * Player photos: the football-data.org free tier does not provide individual player photos.
 * The photo_url column is populated as null for now. A future script can back-fill from
 * a premium source (Sofascore, Transfermarkt, etc.).
 */

import { createClient } from '@supabase/supabase-js'

const FOOTBALL_API_TOKEN = process.env.FOOTBALL_API_TOKEN ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const COMPETITION = 'WC'
const SEASON = 2026

if (!FOOTBALL_API_TOKEN) { console.error('Missing FOOTBALL_API_TOKEN'); process.exit(1) }
if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1) }
if (!SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface FDTeam {
  id: number
  name: string
  shortName: string
  tla: string
  crest: string
  squad: FDPlayer[]
}

interface FDPlayer {
  id: number
  name: string
  position: string | null
  dateOfBirth: string | null
  nationality: string | null
  shirtNumber: number | null
  section: string | null
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_API_TOKEN } })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log(`Fetching WC${SEASON} teams from football-data.org…`)

  const { teams } = await fetchJSON<{ teams: FDTeam[] }>(
    `https://api.football-data.org/v4/competitions/${COMPETITION}/teams?season=${SEASON}`
  )

  console.log(`Found ${teams.length} teams. Upserting players with 7s delay between teams (free tier rate limit)…`)

  let total = 0
  for (const team of teams) {
    if (!team.squad || team.squad.length === 0) {
      // Squad not populated on the teams endpoint — fetch team detail
      try {
        const detail = await fetchJSON<FDTeam>(`https://api.football-data.org/v4/teams/${team.id}`)
        team.squad = detail.squad ?? []
        await sleep(7000)
      } catch (e) {
        console.warn(`  Could not fetch squad for ${team.name}:`, e)
        team.squad = []
      }
    }

    const rows = team.squad.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position ?? null,
      nationality: p.nationality ?? null,
      team_id: team.id,
      team_name: team.name,
      jersey_number: p.shirtNumber ?? null,
      photo_url: null as string | null,
      last_updated: new Date().toISOString(),
    }))

    if (rows.length === 0) {
      console.log(`  ${team.name}: 0 players (squad empty — may need manual data)`)
      continue
    }

    const { error } = await supabase.from('players').upsert(rows, { onConflict: 'id' })
    if (error) {
      console.error(`  ${team.name}: ERROR —`, error.message)
    } else {
      console.log(`  ${team.name}: ${rows.length} players upserted`)
      total += rows.length
    }

    await sleep(7000)
  }

  console.log(`\nDone. ${total} player rows upserted.`)
  console.log('Note: photo_url is null for all players. Back-fill from a premium source to enable face photos in the PlayerCardPicker.')
}

main().catch((e) => { console.error(e); process.exit(1) })
