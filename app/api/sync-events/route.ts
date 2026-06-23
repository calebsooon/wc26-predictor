import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import {
  fifaToken, fetchFifaSchedule, fifaGet, eventTeams, finished, idTail,
  type FifaEvent, type FifaPlayer,
} from '@/lib/fifa-client'
import { matchEventRows, writeMatchEvents } from '@/lib/events-sync'
import { finishSyncRun, startSyncRun, type SyncTrigger } from '@/lib/sync-runs'
import { number } from '@/lib/fifa-client'
import type { SupabaseClient } from '@supabase/supabase-js'

type DBMatch = { id: string; home_team: string; away_team: string; match_date: string; fifa_event_id: number | null }
type FifaTeam = { code: string; fifa_team_id: string }

async function loadPlayers(service: SupabaseClient): Promise<Map<number, FifaPlayer>> {
  const out: FifaPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('players').select('id,fifa_player_id,team_code').not('fifa_player_id', 'is', null).range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []) as FifaPlayer[])
    if (!data || data.length < 1000) break
  }
  return new Map(out.map((p) => [p.fifa_player_id, p]))
}

async function syncEvents(service: SupabaseClient, matchId: string) {
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

  let eventId = match.fifa_event_id ? String(match.fifa_event_id) : null
  if (!eventId) {
    const schedule = await fetchFifaSchedule(token)
    const found = schedule.find((ev) => {
      const { homeCode, awayCode } = eventTeams(ev, codeByTeamId)
      return homeCode === match.home_team && awayCode === match.away_team
    })
    if (!found) return { error: `No FIFA event for ${match.home_team} v ${match.away_team}`, status: 404 }
    eventId = found._externalId
    await service.from('matches').update({ fifa_event_id: number(eventId) }).eq('id', match.id)
  }

  const detail = await fifaGet<FifaEvent>(token, `/events/fifa/${eventId}?aggregated=true`)
  if (!finished(detail)) return { ok: true, written: 0, note: 'match not finished yet' }

  const players = await loadPlayers(service)
  const rows = matchEventRows(detail, match.id, players, codeByTeamId)
  const written = await writeMatchEvents(service, match.id, rows)

  return { ok: true, written }
}

async function runSync(trigger: SyncTrigger, matchId?: string) {
  const service = createServiceSupabaseClient()
  const runId = await startSyncRun(service, 'events', trigger)
  const errors: string[] = []
  let totalWritten = 0

  try {
    if (matchId) {
      const result = await syncEvents(service, matchId)
      const status = 'error' in result ? 'failed' : 'success'
      await finishSyncRun(service, runId, status, { matchId, ...result })
      return result
    }

    // Cron: process recently finished matches
    const now = Date.now()
    const { data: matches } = await service
      .from('matches')
      .select('id,home_team,away_team,match_date,fifa_event_id')
      .not('real_home_score', 'is', null)
      .gte('match_date', new Date(now - 6 * 3600_000).toISOString())
      .lte('match_date', new Date(now).toISOString())

    for (const m of (matches ?? []) as DBMatch[]) {
      try {
        const result = await syncEvents(service, m.id)
        if ('written' in result) totalWritten += result.written ?? 0
      } catch (e) {
        errors.push(`${m.home_team} v ${m.away_team}: ${(e as Error).message}`)
      }
    }

    const status = errors.length ? (totalWritten ? 'partial' : 'failed') : 'success'
    await finishSyncRun(service, runId, status, { written: totalWritten, errors })
    return { ok: true, written: totalWritten, ...(errors.length ? { errors } : {}) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await finishSyncRun(service, runId, 'failed', { error: message })
    return { error: message, status: 500 }
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  const body = await request.json().catch(() => ({})) as { match_id?: string }
  const result = await runSync('admin', body.match_id)
  return NextResponse.json(result, { status: 'error' in result ? (result.status as number ?? 500) : 200 })
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runSync('cron')
  return NextResponse.json(result, { status: 'error' in result ? 500 : 200 })
}
