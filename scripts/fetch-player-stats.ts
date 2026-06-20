/**
 * Back-fills richer player stats (photo, club, date of birth, goals, assists)
 * from API-FOOTBALL (api-sports.io) into the existing `players` rows.
 *
 * Usage:
 *   API_FOOTBALL_KEY=<key> SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<key> \
 *     npx tsx scripts/fetch-player-stats.ts
 *
 * Get a free key: https://dashboard.api-football.com/register  (direct api-sports.io
 * plan — NOT RapidAPI). Free tier = 100 requests/day; this run uses ~65 (one per page).
 *
 * Our players.id comes from football-data.org, which differs from API-FOOTBALL's ids,
 * so rows are matched by normalised name (+ nationality as a tiebreaker). Unmatched
 * players are reported at the end so you can spot-fix aliases if needed.
 */

import { createClient } from '@supabase/supabase-js'

const API_KEY = process.env.API_FOOTBALL_KEY ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const LEAGUE = Number(process.env.API_FOOTBALL_LEAGUE ?? 1)   // 1 = World Cup
const SEASON = Number(process.env.API_FOOTBALL_SEASON ?? 2026)

if (!API_KEY) { console.error('Missing API_FOOTBALL_KEY'); process.exit(1) }
if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1) }
if (!SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface ApiPlayer {
  player: {
    id: number; name: string; firstname: string | null; lastname: string | null
    age: number | null; birth: { date: string | null } | null
    nationality: string | null; photo: string | null
  }
  statistics: { team: { name: string | null } | null; games: { appearences: number | null } | null; goals: { total: number | null; assists: number | null } | null }[]
}
interface ApiResp { response: ApiPlayer[]; paging: { current: number; total: number } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Strip diacritics + non-alphanumerics for fuzzy name matching.
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function fetchPage(page: number): Promise<ApiResp> {
  const url = `https://v3.football.api-sports.io/players?league=${LEAGUE}&season=${SEASON}&page=${page}`
  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json() as Promise<ApiResp>
}

async function main() {
  // Load our existing roster to match against.
  const { data: ours, error: loadErr } = await supabase
    .from('players').select('id, name, nationality').range(0, 9999)
  if (loadErr) throw loadErr
  const byName = new Map<string, { id: number; nationality: string | null }[]>()
  for (const p of (ours ?? []) as { id: number; name: string; nationality: string | null }[]) {
    const k = norm(p.name)
    const arr = byName.get(k) ?? []
    arr.push({ id: p.id, nationality: p.nationality })
    byName.set(k, arr)
  }

  console.log(`Loaded ${ours?.length ?? 0} existing players. Fetching API-FOOTBALL league ${LEAGUE} season ${SEASON}…`)

  const apiPlayers: ApiPlayer[] = []
  let page = 1, totalPages = 1
  do {
    const data = await fetchPage(page)
    apiPlayers.push(...data.response)
    totalPages = data.paging.total
    console.log(`  page ${page}/${totalPages} — ${data.response.length} players`)
    page++
    await sleep(1500)
  } while (page <= totalPages)

  let matched = 0
  const unmatched: string[] = []
  for (const ap of apiPlayers) {
    const fullName = ap.player.name || [ap.player.firstname, ap.player.lastname].filter(Boolean).join(' ')
    const candidates = byName.get(norm(fullName)) ?? byName.get(norm(ap.player.lastname ?? '')) ?? []
    // Disambiguate by nationality when multiple share a normalised name.
    const hit = candidates.length === 1
      ? candidates[0]
      : candidates.find((c) => c.nationality && ap.player.nationality && norm(c.nationality) === norm(ap.player.nationality)) ?? candidates[0]
    if (!hit) { unmatched.push(fullName); continue }

    // Pick the statistics line with the most appearances (their main club).
    const stat = [...ap.statistics].sort((a, b) => (b.games?.appearences ?? 0) - (a.games?.appearences ?? 0))[0]
    const { error } = await supabase.from('players').update({
      photo_url: ap.player.photo ?? null,
      dob: ap.player.birth?.date ?? null,
      club: stat?.team?.name ?? null,
      goals: stat?.goals?.total ?? null,
      assists: stat?.goals?.assists ?? null,
    }).eq('id', hit.id)
    if (error) console.warn(`  update failed for ${fullName}:`, error.message)
    else matched++
  }

  console.log(`\nDone. Updated ${matched} players. ${unmatched.length} API players had no local match.`)
  if (unmatched.length) console.log('Unmatched (first 30):', unmatched.slice(0, 30).join(', '))
}

main().catch((e) => { console.error(e); process.exit(1) })
