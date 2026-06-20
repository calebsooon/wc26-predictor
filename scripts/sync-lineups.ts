/**
 * Residential lineup sync — pulls confirmed XI + formation from Kickoffapi and
 * writes them via the replace_match_lineup RPC (same logic as the in-app admin
 * "Fetch lineup" button). Run from your machine.
 *
 *   npm run data:lineups                 # matches kicking off soon / recently
 *   MATCH_ID=<uuid> npm run data:lineups # one specific match
 *   ALL=1 npm run data:lineups           # every match (back-fill)
 *
 * Lineups are only published ~75 min before kickoff, so distant matches are
 * skipped with "not published yet".
 */

import { createClient } from '@supabase/supabase-js'
import { kapi, findFixture, kickoffConfigured, type KLineup } from '@/lib/kickoff'
import { teamNameToCode, groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !SK) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!kickoffConfigured()) { console.error('Missing KICKOFF_API_KEY'); process.exit(1) }
const service = createClient(URL, SK)

type Match = { id: string; home_team: string; away_team: string; match_date: string }

async function loadRoster(): Promise<Map<string, RosterPlayer[]>> {
  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[])); if (data.length < 1000) break
  }
  return groupPlayersByCode(roster)
}

async function syncOne(m: Match, byCode: Map<string, RosterPlayer[]>): Promise<string> {
  const found = await findFixture(m.home_team, m.away_team, m.match_date)
  if (!found) return 'no fixture match'
  const { response: lineups } = await kapi<KLineup>(`/fixtures/${found.fixture.id}/lineups`)
  if (!lineups || lineups.length === 0) return 'not published yet'

  const rows: Record<string, unknown>[] = []
  const formations: Record<string, string | null> = {}
  const unmatched: string[] = []
  for (const lu of lineups) {
    const code = teamNameToCode(lu.team?.name) ?? teamNameToCode(found.fixture.homeTeam.id === lu.teamId ? found.fixture.homeTeam.name : found.fixture.awayTeam.name)
    if (!code) continue
    formations[code] = lu.formation
    const squad = byCode.get(code) ?? []
    const take = (arr: KLineup['startXI'], starting: boolean) => arr.forEach((e, i) => {
      const hit = matchPlayer(e.player.name, squad)
      if (!hit) { unmatched.push(`${code}:${e.player.name}`); return }
      rows.push({ match_id: m.id, team_code: code, player_id: hit.id, is_starting: starting, shirt_number: e.player.number, position_label: e.player.pos, grid: e.player.grid, sort_order: i, source: 'kickoff' })
    })
    take(lu.startXI ?? [], true)
    take(lu.substitutes ?? [], false)
  }
  // Insert everyone we could match; skip the odd unmatched player (usually a
  // late sub not in our seeded squad). Only bail if nothing matched at all.
  const starters = rows.filter((r) => r.is_starting).length
  if (rows.length === 0 || starters < 16) return `too few matched (${starters} starters) — skipped`

  const { error } = await service.rpc('replace_match_lineup', {
    p_match_id: m.id, p_rows: rows,
    p_home_formation: formations[m.home_team] ?? null,
    p_away_formation: formations[m.away_team] ?? null,
    p_provider_fixture_id: found.fixture.id,
  })
  if (error) return `RPC error: ${error.message}`
  return `OK (${formations[m.home_team] ?? '?'} vs ${formations[m.away_team] ?? '?'}, ${rows.length} players${unmatched.length ? `, ${unmatched.length} unmatched skipped` : ''})`
}

async function main() {
  let query = service.from('matches').select('id, home_team, away_team, match_date').order('match_date')
  if (process.env.MATCH_ID) {
    query = service.from('matches').select('id, home_team, away_team, match_date').eq('id', process.env.MATCH_ID)
  } else if (!process.env.ALL) {
    const now = Date.now()
    query = query.gte('match_date', new Date(now - 3 * 3600_000).toISOString()).lte('match_date', new Date(now + 6 * 3600_000).toISOString())
  }
  const { data: matches } = await query
  const list = (matches ?? []) as Match[]
  console.log(`Syncing lineups for ${list.length} match(es)…`)
  const byCode = await loadRoster()
  for (const m of list) {
    const r = await syncOne(m, byCode)
    console.log(`  ${m.home_team} v ${m.away_team}: ${r}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
