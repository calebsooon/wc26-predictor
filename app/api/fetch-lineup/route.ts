import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import {
  fifaToken, fetchFifaSchedule, fifaGet, lineupRows, substitutionRows,
  eventTeams, idTail, number, tagValue, fullName,
  type FifaEvent, type FifaPlayer,
} from '@/lib/fifa-client'
import { getTeam } from '@/lib/teams'
import { finishSyncRun, startSyncRun, type SyncTrigger } from '@/lib/sync-runs'
import type { SupabaseClient } from '@supabase/supabase-js'

type DBMatch = { id: string; home_team: string; away_team: string; match_date: string; fifa_event_id: number | null }
type FifaTeam = { code: string; fifa_team_id: string }

async function loadPlayers(service: SupabaseClient): Promise<Map<number, FifaPlayer>> {
  const out: FifaPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from('players')
      .select('id,fifa_player_id,team_code')
      .not('fifa_player_id', 'is', null)
      .range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []) as FifaPlayer[])
    if (!data || data.length < 1000) break
  }
  return new Map(out.map((p) => [p.fifa_player_id, p]))
}

async function ensureEventPlayers(
  event: FifaEvent,
  players: Map<number, FifaPlayer>,
  teams: Map<string, string>,
  service: SupabaseClient
): Promise<number> {
  const missing = (event.participants ?? []).flatMap((p) => {
    if (p.role !== 'Player' && p.role !== 'Reserve Player') return []
    const fifaId = number(p._externalSportsPersonId)
    const teamCode = teams.get(idTail(p._externalTeamId) ?? '')
    const name = String(tagValue(p.tags, ':fdcp:player:name:eng') ?? '').trim() || fullName(p)
    if (!fifaId || players.has(fifaId) || !teamCode || !name) return []
    return [{
      fifa_player_id: fifaId,
      name,
      position: String(tagValue(p.tags, ':position:description') ?? 'Unknown'),
      nationality: teamCode,
      team_name: getTeam(teamCode).playerKey,
      team_code: teamCode,
      jersey_number: number(tagValue(p.tags, ':shirt_number') ?? p.number),
      last_updated: new Date().toISOString(),
    }]
  })
  const unique = Array.from(new Map(missing.map((p) => [p.fifa_player_id, p])).values())
  if (!unique.length) return 0
  const { data, error } = await service
    .from('players')
    .upsert(unique, { onConflict: 'fifa_player_id' })
    .select('id,fifa_player_id,team_code')
  if (error) throw error
  for (const p of data ?? []) {
    if (p.fifa_player_id != null)
      players.set(Number(p.fifa_player_id), { id: p.id, fifa_player_id: Number(p.fifa_player_id), team_code: p.team_code })
  }
  return data?.length ?? 0
}

async function syncLineup(service: SupabaseClient, matchId: string) {
  const { data: matchRow, error: matchErr } = await service
    .from('matches')
    .select('id,home_team,away_team,match_date,fifa_event_id')
    .eq('id', matchId)
    .single()
  if (matchErr || !matchRow) return { error: 'Match not found', status: 404 }
  const match = matchRow as DBMatch

  const [token, teamsResult] = await Promise.all([
    fifaToken(),
    service.from('fifa_teams').select('code,fifa_team_id'),
  ])
  if (teamsResult.error) throw teamsResult.error
  const codeByTeamId = new Map(
    (teamsResult.data as FifaTeam[] ?? []).map((t) => [idTail(t.fifa_team_id)!, t.code])
  )

  // Find the FIFA event — use stored fifa_event_id if available, otherwise scan schedule
  let eventId = match.fifa_event_id ? String(match.fifa_event_id) : null
  if (!eventId) {
    const schedule = await fetchFifaSchedule(token)
    const found = schedule.find((ev) => {
      const { homeCode: hc, awayCode: ac } = eventTeams(ev, codeByTeamId)
      return hc === match.home_team && ac === match.away_team
    })
    if (!found) return { error: `No FIFA event found for ${match.home_team} v ${match.away_team}`, status: 404 }
    eventId = found._externalId
  }

  const detail = await fifaGet<FifaEvent>(token, `/events/fifa/${eventId}?aggregated=true`)
  const players = await loadPlayers(service)
  await ensureEventPlayers(detail, players, codeByTeamId, service)

  // Preserve any manual lineup overrides
  const { data: manualRows } = await service
    .from('lineups')
    .select('team_code')
    .eq('match_id', match.id)
    .eq('source', 'manual')
  const manualTeams = new Set((manualRows ?? []).map((r: { team_code: string }) => r.team_code))

  const { rows, formations } = lineupRows(detail, players, codeByTeamId)
  let written = 0
  const skipped: string[] = []

  for (const teamCode of [match.home_team, match.away_team]) {
    if (manualTeams.has(teamCode)) { skipped.push(`${teamCode} (manual override)`); continue }
    const teamRows = rows.filter((r) => r.team_code === teamCode)
    const starters = teamRows.filter((r) => r.is_starting).length
    if (starters < 11) {
      skipped.push(`${teamCode} (only ${starters} starters matched)`); continue
    }

    const { error: delErr } = await service.from('lineups').delete().eq('match_id', match.id).eq('team_code', teamCode)
    if (delErr) throw delErr
    const { error: insErr } = await service.from('lineups').insert(teamRows.map((r) => ({ ...r, match_id: match.id, source: 'fifa' })))
    if (insErr) throw insErr

    const formCol = teamCode === match.home_team ? 'home_formation' : 'away_formation'
    await service.from('matches').update({ [formCol]: formations[teamCode] ?? null, fifa_event_id: number(eventId) }).eq('id', match.id)
    written += teamRows.length
  }

  // Substitutions
  const subs = substitutionRows(detail, match.id, players, codeByTeamId)
  for (const teamCode of [match.home_team, match.away_team]) {
    if (manualTeams.has(teamCode)) continue
    const teamSubs = subs.filter((r) => r.team_code === teamCode)
    await service.from('lineup_substitutions').delete().eq('match_id', match.id).eq('team_code', teamCode).eq('source', 'fifa')
    if (teamSubs.length) {
      const { error } = await service.from('lineup_substitutions').upsert(teamSubs, { onConflict: 'match_id,player_out_id,player_in_id,minute' })
      if (error) throw error
    }
  }

  return {
    ok: true,
    formations: { home: formations[match.home_team] ?? null, away: formations[match.away_team] ?? null },
    written,
    subs: subs.length,
    ...(skipped.length ? { skipped } : {}),
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

  let match_id: string | undefined
  try { match_id = (await request.json()).match_id } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 })

  const r = await runSync(createServiceSupabaseClient(), match_id, 'admin')
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number ?? 500) : 200 })
}

// Cron: fetch lineups for matches kicking off in the next 90 min
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabaseClient()
  const now = Date.now()
  const { data: matches } = await service
    .from('matches')
    .select('id')
    .gte('match_date', new Date(now - 15 * 60_000).toISOString())
    .lte('match_date', new Date(now + 90 * 60_000).toISOString())

  const results: unknown[] = []
  for (const m of (matches ?? []) as { id: string }[]) {
    try { results.push({ id: m.id, ...(await runSync(service, m.id, 'cron')) }) }
    catch (e) { results.push({ id: m.id, error: (e as Error).message }) }
  }
  return NextResponse.json({ ok: true, checked: results.length, results })
}
