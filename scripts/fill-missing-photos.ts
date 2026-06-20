/**
 * Gap-fill ONLY: give players who currently have no photo a headshot from
 * Kickoffapi's CDN. Never overwrites existing photos, never touches club/dob.
 * Matches on exact normalised full name (unique match required) to avoid putting
 * the wrong face on the wrong player.
 *
 * Usage:
 *   DRY_RUN=1 npm run data:fill-photos   # preview
 *   npm run data:fill-photos             # write
 */

import { createClient } from '@supabase/supabase-js'
import { nameKey as norm } from '@/lib/normalize'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const KEY = process.env.KICKOFF_API_KEY ?? ''
const DRY_RUN = process.env.DRY_RUN === '1'
const LEAGUE = Number(process.env.KICKOFF_LEAGUE ?? 1)
const SEASON = Number(process.env.KICKOFF_SEASON ?? 2026)
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!KEY) { console.error('Missing KICKOFF_API_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const BASE = 'https://api.kickoffapi.com/api/v1'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface KickoffPlayer { name: string | null; photo: string | null }
interface KickoffTeam { id: number }
interface KickoffResponse<T> { response: T[]; paging?: { current: number; total: number } }

async function kapi<T>(path: string): Promise<KickoffResponse<T>> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': KEY } })
  if (!res.ok) throw new Error(`kickoffapi ${res.status} on ${path}`)
  return res.json() as Promise<KickoffResponse<T>>
}

async function main() {
  // 1. All WC team ids.
  const { response: teams } = await kapi<KickoffTeam>(`/teams?league=${LEAGUE}&season=${SEASON}`)
  console.log(`Fetching player photos across ${teams.length} teams…`)

  // 2. Global normalised-name → photo. Names appearing for >1 player are marked
  //    ambiguous (null) and skipped, so we never guess.
  const photoByName = new Map<string, string | null>()
  for (const t of teams) {
    let page = 1, total = 1
    do {
      const data = await kapi<KickoffPlayer>(`/players?team=${t.id}&page=${page}`)
      for (const p of data.response ?? []) {
        const key = norm(p.name ?? '')
        if (!key || !p.photo) continue
        photoByName.set(key, photoByName.has(key) ? null : p.photo)  // 2nd sighting → ambiguous
      }
      total = data.paging?.total ?? 1
      page++
      await sleep(120)
    } while (page <= total)
  }
  console.log(`Indexed ${photoByName.size} unique player names with photos.`)

  // 3. Our players missing a photo.
  const missing: { id: number; name: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('players').select('id, name').is('photo_url', null).range(from, from + 999)
    if (!data || data.length === 0) break
    missing.push(...(data as { id: number; name: string }[])); if (data.length < 1000) break
  }
  console.log(`${missing.length} players missing a photo.`)

  let filled = 0, noMatch = 0
  for (const p of missing) {
    const photo = photoByName.get(norm(p.name))
    if (!photo) { noMatch++; continue }
    if (DRY_RUN) { if (filled < 20) console.log(`  ✓ ${p.name} → ${photo}`); filled++; continue }
    const { error } = await supabase.from('players').update({ photo_url: photo }).eq('id', p.id)
    if (error) { noMatch++; continue }
    filled++
  }
  console.log(`\nDone.${DRY_RUN ? ' (dry run)' : ''} Filled ${filled}, still no match ${noMatch}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
