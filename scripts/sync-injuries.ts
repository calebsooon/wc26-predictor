/**
 * Residential injury sync — Kickoffapi blocks datacenter IPs, so run this from
 * your machine. Pulls the WC injury feed, matches players by name, and flags
 * them via the replace_injury_flags RPC. The squad page shows the OUT badges.
 *
 *   npm run data:injuries
 */

import { createClient } from '@supabase/supabase-js'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON } from '@/lib/kickoff'
import { matchPlayer, type RosterPlayer } from '@/lib/team-match'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !SK) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!kickoffConfigured()) { console.error('Missing KICKOFF_API_KEY'); process.exit(1) }
const supabase = createClient(URL, SK)

interface KInjury { type: string | null; player: { id: number; name: string } | null }

async function main() {
  const injuries: KInjury[] = []
  for (let page = 1; page <= 20; page++) {
    const { response } = await kapi<KInjury>(`/injuries?league=${WC_LEAGUE}&season=${WC_SEASON}&page=${page}`)
    if (!response || response.length === 0) break
    injuries.push(...response)
    if (response.length < 100) break
  }

  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[])); if (data.length < 1000) break
  }

  const flagged = new Map<number, string>()
  for (const inj of injuries) {
    if (!inj.player?.name) continue
    const hit = matchPlayer(inj.player.name, roster)
    if (hit && !flagged.has(hit.id)) flagged.set(hit.id, inj.type ?? 'Out')
  }
  const flags = Array.from(flagged, ([player_id, injury_type]) => ({ player_id, injury_type }))

  const { error } = await supabase.rpc('replace_injury_flags', { p_flags: flags })
  if (error) { console.error('replace_injury_flags failed:', error.message); process.exit(1) }
  console.log(`Injuries: feed ${injuries.length}, flagged ${flags.length} players.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
