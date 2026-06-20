/**
 * Residential results sync — pulls finished WC fixtures (score + first scorer)
 * from Kickoffapi, writes them, and re-scores predictions using the SAME logic
 * as the in-app admin flow (lib/score-sync). Run from your machine.
 *
 *   npm run data:results
 *
 * Idempotent — already-scored matches are skipped.
 */

import { createClient } from '@supabase/supabase-js'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON, type KFixture, type KEvent } from '@/lib/kickoff'
import { teamNameToCode, groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'
import { scoreMatchPredictions } from '@/lib/score-sync'
import { snapshotLeagueRanks } from '@/lib/snapshot'
import { firstCreditedGoal } from '@/lib/live-sync'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!URL || !SK) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!kickoffConfigured()) { console.error('Missing KICKOFF_API_KEY'); process.exit(1) }
const service = createClient(URL, SK)

const FINISHED = new Set(['FT', 'AET', 'PEN'])
type DBM = { id: string; home_team: string; away_team: string; match_date: string; real_home_score: number | null; real_away_score: number | null; first_goal_player_id: number | null; provider_fixture_id: number | null }

async function main() {
  const { response: fixtures } = await kapi<KFixture>(`/fixtures?league=${WC_LEAGUE}&season=${WC_SEASON}`)
  const { data: dbMatches } = await service
    .from('matches')
    .select('id, home_team, away_team, match_date, real_home_score, real_away_score, first_goal_player_id, provider_fixture_id')
  const byKey = new Map<string, DBM[]>()
  const byFixtureId = new Map<number, DBM>()
  for (const m of (dbMatches ?? []) as DBM[]) {
    const key = [m.home_team, m.away_team].sort().join('|')
    byKey.set(key, [...(byKey.get(key) ?? []), m])
    if (m.provider_fixture_id != null) byFixtureId.set(m.provider_fixture_id, m)
  }

  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[])); if (data.length < 1000) break
  }
  const byCode = groupPlayersByCode(roster)

  let updated = 0, scored = 0
  for (const f of fixtures) {
    if (!FINISHED.has(f.statusShort) || f.homeTeam.goals == null || f.awayTeam.goals == null) continue
    const cHome = teamNameToCode(f.homeTeam.name), cAway = teamNameToCode(f.awayTeam.name)
    if (!cHome || !cAway) continue
    const candidates = byKey.get([cHome, cAway].sort().join('|')) ?? []
    const db = byFixtureId.get(f.id) ?? candidates.find((c) => c.match_date.slice(0, 10) === f.date.slice(0, 10)) ?? (candidates.length === 1 ? candidates[0] : undefined)
    if (!db) continue

    const realHome = db.home_team === cHome ? f.homeTeam.goals : f.awayTeam.goals
    const realAway = db.home_team === cHome ? f.awayTeam.goals : f.homeTeam.goals
    if (db.real_home_score === realHome && db.real_away_score === realAway && db.first_goal_player_id != null) continue

    let firstGoalTeam: string | null = null, firstGoalPlayerId: number | null = null
    try {
      const { response: events } = await kapi<KEvent>(`/fixtures/${f.id}/events`)
      const goal = firstCreditedGoal(events ?? [])
      if (goal) {
        const scorerCode = goal.teamId === f.homeTeam.id ? cHome : cAway
        firstGoalTeam = scorerCode
        firstGoalPlayerId = matchPlayer(goal.playerName!, byCode.get(scorerCode) ?? [])?.id ?? null
      }
    } catch (e) { console.warn(`events ${f.id}: ${(e as Error).message}`) }

    const { error } = await service.from('matches').update({
      real_home_score: realHome, real_away_score: realAway, is_locked: true,
      first_goal_team: firstGoalTeam, first_goal_player_id: firstGoalPlayerId, provider_fixture_id: f.id,
    }).eq('id', db.id)
    if (error) { console.warn(`update ${db.id}: ${error.message}`); continue }
    updated++
    try { scored += await scoreMatchPredictions(service, db.id) } catch (e) { console.warn(`score ${db.id}: ${(e as Error).message}`) }
  }

  if (updated > 0) await snapshotLeagueRanks(service)
  console.log(`Results: updated ${updated} match(es), scored ${scored} prediction(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
