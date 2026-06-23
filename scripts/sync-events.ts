/**
 * Pull goal / card events from FIFA GameDay into match_events.
 *   npm run data:fifa:events                 # finished matches in last 6h
 *   MATCH_ID=<uuid> npm run data:fifa:events # one specific match
 *   ALL=1 npm run data:fifa:events           # every scored match (backfill)
 */
import { createClient } from '@supabase/supabase-js'
import {
  fifaToken, fetchFifaSchedule, fifaGet, eventTeams, finished, idTail, number,
  type FifaEvent, type FifaPlayer,
} from '@/lib/fifa-client'
import { matchEventRows, writeMatchEvents } from '@/lib/events-sync'
import { describeSyncError, finishSyncRun, startSyncRun } from '@/lib/sync-runs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !SK) { console.error('Missing env vars'); process.exit(1) }
const service = createClient(URL, SK)

const MATCH_ID = process.env.MATCH_ID ?? null
const ALL = process.env.ALL === '1'

type DBMatch = { id: string; home_team: string; away_team: string; match_date: string; fifa_event_id: number | null; real_home_score: number | null }
type FifaTeam = { code: string; fifa_team_id: string }

async function loadPlayers(): Promise<Map<number, FifaPlayer>> {
  const out: FifaPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from('players').select('id,fifa_player_id,team_code').not('fifa_player_id', 'is', null).range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []) as FifaPlayer[])
    if (!data || data.length < 1000) break
  }
  return new Map(out.map((p) => [p.fifa_player_id, p]))
}

async function main() {
  const runId = await startSyncRun(service, 'events', 'cli', { provider: 'fifa', scope: MATCH_ID ? `match:${MATCH_ID}` : ALL ? 'backfill' : 'window' })
  let totalWritten = 0
  const errors: string[] = []

  try {
    const [token, matchesResult, teamsResult] = await Promise.all([
      fifaToken(),
      service.from('matches').select('id,home_team,away_team,match_date,fifa_event_id,real_home_score'),
      service.from('fifa_teams').select('code,fifa_team_id'),
    ])
    if (matchesResult.error) throw matchesResult.error
    if (teamsResult.error) throw teamsResult.error

    const allMatches = (matchesResult.data ?? []) as DBMatch[]
    const codeByTeamId = new Map((teamsResult.data as FifaTeam[]).map((t) => [idTail(t.fifa_team_id)!, t.code]))
    const players = await loadPlayers()

    const now = Date.now()
    let matches: DBMatch[]
    if (MATCH_ID) {
      matches = allMatches.filter((m) => m.id === MATCH_ID)
    } else if (ALL) {
      matches = allMatches.filter((m) => m.real_home_score != null)
    } else {
      matches = allMatches.filter((m) => {
        const t = new Date(m.match_date).getTime()
        return t >= now - 6 * 3600_000 && t <= now + 30 * 60_000
      })
    }

    const matchesNeedingScan = matches.filter((m) => !m.fifa_event_id)
    const scheduleByPair = new Map<string, FifaEvent>()
    if (matchesNeedingScan.length) {
      const schedule = await fetchFifaSchedule(token)
      for (const ev of schedule) {
        const { homeCode, awayCode } = eventTeams(ev, codeByTeamId)
        if (homeCode && awayCode) scheduleByPair.set(`${homeCode}|${awayCode}`, ev)
      }
    }

    console.log(`Syncing events for ${matches.length} match(es)…`)
    for (const match of matches) {
      let eventId = match.fifa_event_id ? String(match.fifa_event_id) : null
      if (!eventId) {
        const ev = scheduleByPair.get(`${match.home_team}|${match.away_team}`)
        if (!ev) { console.log(`  ${match.home_team} v ${match.away_team}: no FIFA event`); continue }
        eventId = ev._externalId
        await service.from('matches').update({ fifa_event_id: number(eventId) }).eq('id', match.id)
      }
      try {
        const detail = await fifaGet<FifaEvent>(token, `/events/fifa/${eventId}?aggregated=true`)
        if (!finished(detail)) { console.log(`  ${match.home_team} v ${match.away_team}: not finished`); continue }
        const rows = matchEventRows(detail, match.id, players, codeByTeamId)
        const written = await writeMatchEvents(service, match.id, rows)
        totalWritten += written
        console.log(`  ${match.home_team} v ${match.away_team}: ${written} events`)
      } catch (e) {
        const msg = describeSyncError(e)
        errors.push(`${match.home_team} v ${match.away_team}: ${msg}`)
        console.warn(`  ${match.home_team} v ${match.away_team}: ${msg}`)
      }
    }

    const status = errors.length ? (totalWritten ? 'partial' : 'failed') : 'success'
    await finishSyncRun(service, runId, status, { written: totalWritten, errors })
    console.log(`Done — ${totalWritten} events written.${errors.length ? ` Errors: ${errors.join('; ')}` : ''}`)
  } catch (error) {
    const message = describeSyncError(error)
    await finishSyncRun(service, runId, 'failed', { error: message }).catch(() => undefined)
    console.error(error); process.exit(1)
  }
}

main()
