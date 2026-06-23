import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { fifaToken, fetchFifaSchedule, eventTeams, finished, idTail, number } from '@/lib/fifa-client'
import { scoreMatchPredictions } from '@/lib/score-sync'
import { snapshotLeagueRanks } from '@/lib/snapshot'
import { finishSyncRun, startSyncRun, type SyncTrigger } from '@/lib/sync-runs'
import type { SupabaseClient } from '@supabase/supabase-js'

type DBMatch = {
  id: string; home_team: string; away_team: string; match_date: string
  real_home_score: number | null; real_away_score: number | null
  fifa_event_id: number | null
}
type FifaTeam = { code: string; fifa_team_id: string }

async function sync(service: SupabaseClient) {
  const [token, matchesResult, teamsResult] = await Promise.all([
    fifaToken(),
    service.from('matches').select('id,home_team,away_team,match_date,real_home_score,real_away_score,fifa_event_id'),
    service.from('fifa_teams').select('code,fifa_team_id'),
  ])
  if (matchesResult.error) throw matchesResult.error
  if (teamsResult.error) throw teamsResult.error

  const matches = (matchesResult.data ?? []) as DBMatch[]
  const codeByTeamId = new Map(
    (teamsResult.data as FifaTeam[] ?? []).map((t) => [idTail(t.fifa_team_id)!, t.code])
  )
  const byPair = new Map(matches.map((m) => [`${m.home_team}|${m.away_team}`, m]))

  const schedule = await fetchFifaSchedule(token)
  let updated = 0, rescored = 0
  const errors: string[] = []

  for (const event of schedule) {
    if (!finished(event)) continue
    const { home, away, homeCode, awayCode } = eventTeams(event, codeByTeamId)
    if (!homeCode || !awayCode) continue
    const homeScore = number(home?.score)
    const awayScore = number(away?.score)
    if (homeScore == null || awayScore == null) continue

    const match = byPair.get(`${homeCode}|${awayCode}`)
    if (!match) continue
    if (match.real_home_score === homeScore && match.real_away_score === awayScore) continue

    const { error } = await service.from('matches').update({
      real_home_score: homeScore,
      real_away_score: awayScore,
      is_locked: true,
      fifa_event_id: number(event._externalId),
      fifa_updated_at: event.updatedAt ?? null,
    }).eq('id', match.id)
    if (error) { errors.push(`update ${match.id}: ${error.message}`); continue }
    updated++
    try { rescored += await scoreMatchPredictions(service, match.id) }
    catch (e) { errors.push(`score ${match.id}: ${(e as Error).message}`) }
  }

  if (updated > 0) await snapshotLeagueRanks(service)
  return { ok: true, updated, rescored, ...(errors.length ? { errors } : {}) }
}

async function runSync(trigger: SyncTrigger) {
  const service = createServiceSupabaseClient()
  const runId = await startSyncRun(service, 'results', trigger)
  try {
    const result = await sync(service)
    const status = (result.errors?.length ?? 0) > 0 ? 'partial' : 'success'
    await finishSyncRun(service, runId, status, result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await finishSyncRun(service, runId, 'failed', { error: message })
    return { error: message, status: 500 }
  }
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  const r = await runSync('admin')
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number ?? 500) : 200 })
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await runSync('cron')
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number ?? 500) : 200 })
}
