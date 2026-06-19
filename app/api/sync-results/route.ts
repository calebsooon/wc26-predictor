import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON, type KFixture, type KEvent } from '@/lib/kickoff'
import { teamNameToCode, groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'
import { scoreMatchPredictions } from '@/lib/score-sync'
import { snapshotLeagueRanks } from '@/lib/snapshot'

const FINISHED = new Set(['FT', 'AET', 'PEN'])

// Pull final scores + first goalscorer for finished WC fixtures from Kickoffapi,
// write them, and re-score predictions. POST = admin; GET = cron (GitHub Actions).
async function sync() {
  if (!kickoffConfigured()) return { error: 'KICKOFF_API_KEY not set', status: 500 }
  const service = createServiceSupabaseClient()

  const { response: fixtures } = await kapi<KFixture>(`/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}`)
  const { data: dbMatches } = await service
    .from('matches')
    .select('id, home_team, away_team, real_home_score, real_away_score, first_goal_player_id')
  type DBM = { id: string; home_team: string; away_team: string; real_home_score: number | null; real_away_score: number | null; first_goal_player_id: number | null }
  const byKey = new Map<string, DBM>()
  for (const m of (dbMatches ?? []) as DBM[]) byKey.set([m.home_team, m.away_team].sort().join('|'), m)

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
    const db = byKey.get([cHome, cAway].sort().join('|'))
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
      const goal = (events ?? [])
        .filter((e) => e.type === 'Goal' && e.detail !== 'Own Goal' && e.playerName)
        .sort((a, b) => a.time - b.time)[0]
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
    }).eq('id', db.id)
    if (uErr) { errors.push(`update ${db.id}: ${uErr.message}`); continue }
    updated++
    try { scored += await scoreMatchPredictions(service, db.id) } catch (e) { errors.push(`score ${db.id}: ${(e as Error).message}`) }
  }

  if (updated > 0) await snapshotLeagueRanks(service)
  return { ok: true, updated, scored, ...(errors.length ? { errors } : {}) }
}

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  const r = await sync()
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await sync()
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}
