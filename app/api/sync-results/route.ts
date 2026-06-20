import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON, type KFixture, type KEvent } from '@/lib/kickoff'
import { teamNameToCode, groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'
import { scoreMatchPredictions } from '@/lib/score-sync'
import { snapshotLeagueRanks } from '@/lib/snapshot'
import { finishSyncRun, startSyncRun, type SyncTrigger } from '@/lib/sync-runs'
import { firstCreditedGoal, sameFixtureDay } from '@/lib/live-sync'

const FINISHED = new Set(['FT', 'AET', 'PEN'])

// Pull final scores + first goalscorer for finished WC fixtures from Kickoffapi,
// write them, and re-score predictions. POST = admin; GET = cron (GitHub Actions).
async function sync(service = createServiceSupabaseClient()) {
  if (!kickoffConfigured()) return { error: 'KICKOFF_API_KEY not set', status: 500 }

  const { response: fixtures } = await kapi<KFixture>(`/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}`)
  const { data: dbMatches } = await service
    .from('matches')
    .select('id, home_team, away_team, match_date, real_home_score, real_away_score, first_goal_player_id, provider_fixture_id')
  type DBM = { id: string; home_team: string; away_team: string; match_date: string; real_home_score: number | null; real_away_score: number | null; first_goal_player_id: number | null; provider_fixture_id: number | null }
  const byKey = new Map<string, DBM[]>()
  const byFixtureId = new Map<number, DBM>()
  for (const m of (dbMatches ?? []) as DBM[]) {
    const key = [m.home_team, m.away_team].sort().join('|')
    const sameTeams = byKey.get(key) ?? []
    sameTeams.push(m)
    byKey.set(key, sameTeams)
    if (m.provider_fixture_id != null) byFixtureId.set(m.provider_fixture_id, m)
  }

  // Roster for scorer name-matching.
  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[])); if (data.length < 1000) break
  }
  const byCode = groupPlayersByCode(roster)

  let updated = 0, scored = 0
  const errors: string[] = []

  for (const f of fixtures) {
    if (!FINISHED.has(f.statusShort) || f.homeTeam.goals == null || f.awayTeam.goals == null) continue
    const cHome = teamNameToCode(f.homeTeam.name), cAway = teamNameToCode(f.awayTeam.name)
    if (!cHome || !cAway) continue
    const candidates = byKey.get([cHome, cAway].sort().join('|')) ?? []
    const db = byFixtureId.get(f.id)
      ?? candidates.find((candidate) => sameFixtureDay(candidate.match_date, f.date))
      ?? (candidates.length === 1 ? candidates[0] : undefined)
    if (!db) continue

    // Map fixture goals onto our home/away orientation.
    const realHome = db.home_team === cHome ? f.homeTeam.goals : f.awayTeam.goals
    const realAway = db.home_team === cHome ? f.awayTeam.goals : f.homeTeam.goals
    const alreadyScored = db.real_home_score === realHome && db.real_away_score === realAway && db.first_goal_player_id != null
    if (alreadyScored) continue

    // First goalscorer from events (earliest non-own goal).
    let firstGoalTeam: string | null = null
    let firstGoalPlayerId: number | null = null
    try {
      const { response: events } = await kapi<KEvent>(`/fixtures/${f.id}/events`)
      const goal = firstCreditedGoal(events ?? [])
      if (goal) {
        const scorerCode = goal.teamId === f.homeTeam.id ? cHome : cAway
        firstGoalTeam = scorerCode
        const hit = matchPlayer(goal.playerName!, byCode.get(scorerCode) ?? [])
        firstGoalPlayerId = hit?.id ?? null
      }
    } catch (e) { errors.push(`events ${f.id}: ${(e as Error).message}`) }

    const { error: uErr } = await service.from('matches').update({
      real_home_score: realHome, real_away_score: realAway, is_locked: true,
      first_goal_team: firstGoalTeam, first_goal_player_id: firstGoalPlayerId,
      provider_fixture_id: f.id,
    }).eq('id', db.id)
    if (uErr) { errors.push(`update ${db.id}: ${uErr.message}`); continue }
    updated++
    try { scored += await scoreMatchPredictions(service, db.id) } catch (e) { errors.push(`score ${db.id}: ${(e as Error).message}`) }
  }

  if (updated > 0) await snapshotLeagueRanks(service)
  return { ok: true, updated, scored, ...(errors.length ? { errors } : {}) }
}

async function runSync(trigger: SyncTrigger) {
  const service = createServiceSupabaseClient()
  const runId = await startSyncRun(service, 'results', trigger)
  try {
    const result = await sync(service)
    const status = 'error' in result ? 'failed' : ((result.errors?.length ?? 0) > 0 ? 'partial' : 'success')
    await finishSyncRun(service, runId, status, result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown result sync failure'
    await finishSyncRun(service, runId, 'failed', { error: message })
    return { error: message, status: 500 }
  }
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  const r = await runSync('admin')
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await runSync('cron')
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}
