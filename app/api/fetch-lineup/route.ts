import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { kapi, findFixture, kickoffConfigured, type KLineup } from '@/lib/kickoff'
import { teamNameToCode, groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'
import { finishSyncRun, startSyncRun, type SyncTrigger } from '@/lib/sync-runs'
import type { SupabaseClient } from '@supabase/supabase-js'

// Pull the confirmed lineup + formation for a match from Kickoffapi into the
// `lineups` table (so SquadPanel + the formation pitch render it).
// POST = admin (single match). GET = cron (all matches kicking off soon).
async function syncLineup(service: SupabaseClient, matchId: string) {
  const { data: match } = await service.from('matches').select('id, home_team, away_team, match_date').eq('id', matchId).single()
  if (!match) return { error: 'Match not found', status: 404 }
  const m = match as { id: string; home_team: string; away_team: string; match_date: string }

  const found = await findFixture(m.home_team, m.away_team, m.match_date)
  if (!found) return { error: 'No matching fixture on Kickoffapi', status: 404 }

  const { response: lineups } = await kapi<KLineup>(`/fixtures/${found.fixture.id}/lineups`)
  if (!lineups || lineups.length === 0) return { error: 'Lineups not published yet', status: 404 }

  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[])); if (data.length < 1000) break
  }
  const byCode = groupPlayersByCode(roster)

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
      rows.push({
        match_id: m.id, team_code: code, player_id: hit.id, is_starting: starting,
        shirt_number: e.player.number, position_label: e.player.pos, grid: e.player.grid, sort_order: i, source: 'kickoff',
      })
    })
    take(lu.startXI ?? [], true)
    take(lu.substitutes ?? [], false)
  }

  // Never replace a known lineup with a payload we could not map back to our
  // roster. The unmatched names remain visible in the sync-run log for repair.
  if (unmatched.length > 0 || rows.length === 0) {
    return {
      error: unmatched.length > 0 ? 'One or more lineup players could not be matched' : 'No lineup players could be matched',
      status: 422,
      written: 0,
      unmatched,
    }
  }

  const { error: replaceError } = await service.rpc('replace_match_lineup', {
    p_match_id: m.id,
    p_rows: rows,
    p_home_formation: formations[m.home_team] ?? null,
    p_away_formation: formations[m.away_team] ?? null,
    p_provider_fixture_id: found.fixture.id,
  })
  if (replaceError) return { error: replaceError.message, status: 500 }

  return {
    ok: true, fixtureId: found.fixture.id,
    formations: { home: formations[m.home_team] ?? null, away: formations[m.away_team] ?? null },
    written: rows.length, unmatched,
  }
}

async function runSync(service: SupabaseClient, matchId: string, trigger: SyncTrigger) {
  const runId = await startSyncRun(service, 'lineups', trigger)
  try {
    const result = await syncLineup(service, matchId)
    const status = 'error' in result ? 'failed' : 'success'
    await finishSyncRun(service, runId, status, { matchId, ...result })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lineup sync failure'
    await finishSyncRun(service, runId, 'failed', { matchId, error: message })
    return { error: message, status: 500 }
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  if (!kickoffConfigured()) return NextResponse.json({ error: 'KICKOFF_API_KEY not set' }, { status: 500 })

  let match_id: string | undefined
  try { match_id = (await request.json()).match_id } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 })

  const r = await runSync(createServiceSupabaseClient(), match_id, 'admin')
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}

// Cron (GitHub Actions): fetch lineups for matches kicking off in the next 90 min.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!kickoffConfigured()) return NextResponse.json({ error: 'KICKOFF_API_KEY not set' }, { status: 500 })

  const service = createServiceSupabaseClient()
  const now = Date.now()
  const hi = new Date(now + 90 * 60 * 1000).toISOString()
  const lo = new Date(now - 15 * 60 * 1000).toISOString()
  const { data: matches } = await service.from('matches').select('id').gte('match_date', lo).lte('match_date', hi)

  const results: Record<string, unknown>[] = []
  for (const mm of (matches ?? []) as { id: string }[]) {
    try { results.push({ id: mm.id, ...(await runSync(service, mm.id, 'cron')) }) }
    catch (e) { results.push({ id: mm.id, error: (e as Error).message }) }
  }
  return NextResponse.json({ ok: true, checked: results.length, results })
}
