/**
 * Pulls Golden Boot data (top scorers + assists + teams) from Kickoffapi and
 * writes it into the live_cache table. Run from a residential connection —
 * Kickoffapi's Cloudflare blocks datacenter IPs (Vercel/GitHub), so this can't
 * run server-side. The /api/golden-boot route reads the cached row.
 *
 * Usage (re-run after match days to refresh):
 *   npx tsx --env-file=.env.local scripts/sync-golden-boot.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const KEY = process.env.KICKOFF_API_KEY ?? ''
const LEAGUE = Number(process.env.KICKOFF_LEAGUE ?? 1)
const SEASON = Number(process.env.KICKOFF_SEASON ?? 2026)
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!KEY) { console.error('Missing KICKOFF_API_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const BASE = 'https://api.kickoffapi.com/api/v1'

async function kapi(path: string): Promise<unknown[]> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': KEY } })
  if (!res.ok) throw new Error(`kickoffapi ${res.status} on ${path}: ${(await res.text()).slice(0, 120)}`)
  const json = await res.json() as { response?: unknown[] }
  return json.response ?? []
}

async function main() {
  console.log('Fetching Golden Boot data from Kickoffapi…')
  const [scorers, assists, teams] = await Promise.all([
    kapi(`/topscorers?league=${LEAGUE}&season=${SEASON}`),
    kapi(`/topassists?league=${LEAGUE}&season=${SEASON}`),
    kapi(`/teams?league=${LEAGUE}&season=${SEASON}`),
  ])
  console.log(`  scorers: ${scorers.length}, assists: ${assists.length}, teams: ${teams.length}`)

  const { error } = await supabase.from('live_cache').upsert({
    key: 'golden_boot',
    data: { scorers, assists, teams },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) { console.error('Write failed:', error.message); process.exit(1) }

  console.log('Done — live_cache[golden_boot] updated. The Golden Boot page now reflects this.')
}

main().catch((e) => { console.error(e); process.exit(1) })
