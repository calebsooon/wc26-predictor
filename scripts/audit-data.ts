/**
 * Full database audit — run with:
 *   npm run data:audit
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const sb = createClient(url, key)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRows<T>(table: string, select: string, modifier?: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (sb as any).from(table).select(select).range(from, from + 999)
    if (modifier) q = modifier(q)
    const { data, error } = await q
    if (error) { console.error(`  [${table} query error] ${error.message}`); return [] }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

async function getCount(table: string): Promise<number | string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (sb as any).from(table).select('*', { count: 'exact', head: true })
  if (error) return `ERROR: ${error.message}`
  return count ?? 0
}

function section(title: string) {
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${title.toUpperCase()}`)
  console.log('─'.repeat(64))
}
const ok   = (m: string) => console.log(`  ✓  ${m}`)
const warn = (m: string) => console.log(`  ⚠  ${m}`)
const bad  = (m: string) => console.log(`  ✗  ${m}`)
const info = (m: string) => console.log(`     ${m}`)

/* ── 1. Row counts ─────────────────────────────────────── */
async function auditCounts() {
  section('Table row counts')
  const tables = [
    'rounds','matches','profiles','predictions','players',
    'group_predictions','tournament_predictions','lineups',
    'rank_snapshots','leagues','league_members','push_subscriptions',
    'golden_boot_stats','match_player_stats','match_team_stats',
    'match_events','match_participants','lineup_substitutions',
    'fifa_teams','fifa_raw_snapshots','sync_runs',
  ]
  for (const t of tables) {
    const n = await getCount(t)
    const flag = typeof n === 'string' ? '✗' : n === 0 ? '⚠' : '✓'
    console.log(`  ${flag}  ${t.padEnd(30)} ${n}`)
  }
}

/* ── 2. Matches ────────────────────────────────────────── */
async function auditMatches() {
  section('Matches')
  type Match = {
    id: string; round_id: string | null; home_team: string; away_team: string
    match_date: string; real_home_score: number | null; real_away_score: number | null
    is_locked: boolean; group_name: string | null; gameweek: number | null
    fifa_event_id: number | null; home_formation: string | null; away_formation: string | null
    home_formation_override: string | null; away_formation_override: string | null
  }
  const all = await getRows<Match>('matches',
    'id,round_id,home_team,away_team,match_date,real_home_score,real_away_score,is_locked,group_name,gameweek,fifa_event_id,home_formation,away_formation,home_formation_override,away_formation_override'
  )
  const total = all.length
  const scored = all.filter(m => m.real_home_score != null && m.real_away_score != null)
  const locked = all.filter(m => m.is_locked)
  const tbd    = all.filter(m => m.home_team === 'TBD' || m.away_team === 'TBD')
  const noRound    = all.filter(m => !m.round_id)
  const noFifaId   = scored.filter(m => !m.fifa_event_id)
  const noGroup    = all.filter(m => !m.group_name)
  const inconsistentStage = all.filter(m => (m.gameweek == null) !== (m.group_name == null))
  const noFormation = scored.filter(m => (!m.home_formation && !m.home_formation_override) || (!m.away_formation && !m.away_formation_override))
  const scoredButNotLocked = scored.filter(m => !m.is_locked)

  info(`Total: ${total}  |  Scored: ${scored.length}  |  Locked: ${locked.length}  |  TBD teams: ${tbd.length}`)
  if (noRound.length) warn(`${noRound.length} match(es) missing round_id`)
  else ok('All matches have a round_id')
  if (noFifaId.length) warn(`${noFifaId.length} scored match(es) missing fifa_event_id`)
  else ok('All scored matches have fifa_event_id')
  if (inconsistentStage.length) warn(`${inconsistentStage.length} match(es) have a group/gameweek mismatch`)
  else info(`${noGroup.length} knockout fixture(s) have no group or gameweek — expected`)
  if (scoredButNotLocked.length) bad(`${scoredButNotLocked.length} match(es) have a score but is_locked=false`)
  else ok('All scored matches are locked')
  if (noFormation.length) warn(`${noFormation.length} scored match(es) missing home or away formation: ${noFormation.map((match) => `${match.home_team} v ${match.away_team}`).join(', ')}`)
  else if (scored.length > 0) ok('All scored matches have formations recorded')
  if (tbd.length) info(`TBD matches (knockout placeholders): ${tbd.length} — normal until bracket is set`)
}

/* ── 3. Players ────────────────────────────────────────── */
async function auditPlayers() {
  section('Players')
  type Player = {
    id: number; name: string; team_name: string | null; photo_url: string | null
    position: string | null; nationality: string | null; dob: string | null
    club: string | null; group_letter: string | null; jersey_number: number | null
  }
  const all = await getRows<Player>('players',
    'id,name,team_name,photo_url,position,nationality,dob,club,group_letter,jersey_number'
  )
  info(`Total: ${all.length}`)

  const noPhoto     = all.filter(p => !p.photo_url)
  const emptyPhoto  = all.filter(p => p.photo_url === '')
  const noPos       = all.filter(p => !p.position)
  const noDob       = all.filter(p => !p.dob)
  const noTeam      = all.filter(p => !p.team_name)
  const noNat       = all.filter(p => !p.nationality)
  const noClub      = all.filter(p => !p.club)
  const noGroup     = all.filter(p => !p.group_letter)
  const noJersey    = all.filter(p => p.jersey_number == null)

  // Duplicate name+team
  const seen = new Map<string, number>()
  for (const p of all) {
    const k = `${p.name}|${p.team_name ?? ''}`
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const dupes = [...seen.entries()].filter(([, c]) => c > 1)

  ok(`${all.length - noPhoto.length} / ${all.length} have a photo  (${noPhoto.length} missing)`)
  if (emptyPhoto.length) bad(`${emptyPhoto.length} players have empty-string photo_url — should be NULL`)
  if (noPos.length) warn(`${noPos.length} player(s) missing position`)
  else ok('All players have a position')
  if (noDob.length) warn(`${noDob.length} player(s) missing date of birth`)
  else ok('All players have a DOB')
  if (noTeam.length) warn(`${noTeam.length} player(s) missing team_name`)
  else ok('All players have a team_name')
  if (noNat.length) warn(`${noNat.length} player(s) missing nationality`)
  else ok('All players have nationality')
  if (noClub.length) warn(`${noClub.length} player(s) missing club`)
  else ok('All players have a club')
  if (noGroup.length) warn(`${noGroup.length} player(s) missing group_letter`)
  else ok('All players have group_letter')
  if (noJersey.length) warn(`${noJersey.length} player(s) missing jersey_number`)
  else ok('All players have a jersey number')
  if (dupes.length) warn(`${dupes.length} duplicate name+team combos: ${dupes.slice(0,5).map(([k]) => k).join(', ')}`)
  else ok('No duplicate name+team combos')
}

/* ── 4. Lineups ────────────────────────────────────────── */
async function auditLineups() {
  section('Lineups')
  type Lineup = {
    match_id: string; team_code: string; player_id: number
    is_starting: boolean; shirt_number: number | null
    position_label: string | null; sort_order: number; grid: string | null
  }
  const all = await getRows<Lineup>('lineups',
    'match_id,team_code,player_id,is_starting,shirt_number,position_label,sort_order,grid'
  )
  const starters  = all.filter(l => l.is_starting)
  const subs      = all.filter(l => !l.is_starting)
  const matchIds  = new Set(all.map(l => l.match_id))
  const noPos     = starters.filter(l => !l.position_label)
  const noShirt   = starters.filter(l => l.shirt_number == null)
  const withGrid  = all.filter(l => l.grid)

  // Count starters per match+team — expect 11
  const starterCounts = new Map<string, number>()
  for (const l of starters) {
    const k = `${l.match_id}|${l.team_code}`
    starterCounts.set(k, (starterCounts.get(k) ?? 0) + 1)
  }
  const notEleven = [...starterCounts.entries()].filter(([, c]) => c !== 11)

  info(`Total entries: ${all.length}  |  Starters: ${starters.length}  |  Subs: ${subs.length}  |  Matches: ${matchIds.size}  |  With admin grid: ${withGrid.length}`)
  if (noPos.length) warn(`${noPos.length} starter(s) missing position_label`)
  else ok('All starters have a position_label')
  if (noShirt.length) warn(`${noShirt.length} starter(s) missing shirt_number`)
  else ok('All starters have a shirt_number')
  if (notEleven.length) warn(`${notEleven.length} team-sheet(s) ≠ 11 starters: ${notEleven.slice(0,6).map(([k,c]) => `${k.split('|')[1]}=${c}`).join(', ')}`)
  else ok('All team sheets have exactly 11 starters')
}

/* ── 5. Predictions ────────────────────────────────────── */
async function auditPredictions() {
  section('Predictions')
  type Pred = {
    id: string; user_id: string; match_id: string
    pred_home: number | null; pred_away: number | null; points_awarded: number | null
    pts_outcome: number | null; pts_exact: number | null; pts_first_scorer: number | null
    pred_first_scorer_id: number | null; pred_first_goal_team: string | null
  }
  const all = await getRows<Pred>('predictions',
    'id,user_id,match_id,pred_home,pred_away,points_awarded,pts_outcome,pts_exact,pts_first_scorer,pred_first_scorer_id,pred_first_goal_team'
  )
  const users   = new Set(all.map(p => p.user_id))
  const matches = new Set(all.map(p => p.match_id))
  const nullScore  = all.filter(p => p.pred_home == null || p.pred_away == null)
  const scored     = all.filter(p => p.pts_outcome != null)
  const withScorer = all.filter(p => p.pred_first_scorer_id != null)
  const withTeam   = all.filter(p => p.pred_first_goal_team != null)

  info(`Total: ${all.length}  |  Users: ${users.size}  |  Matches covered: ${matches.size}`)
  info(`Scored: ${scored.length}  |  Awaiting score: ${all.length - scored.length}  |  With first-scorer pick: ${withScorer.length}  |  With first-goal-team: ${withTeam.length}`)
  if (nullScore.length) bad(`${nullScore.length} prediction(s) with null pred_home or pred_away`)
  else ok('All predictions have a scoreline')

  // Per-user submission count
  const byUser = new Map<string, number>()
  for (const p of all) byUser.set(p.user_id, (byUser.get(p.user_id) ?? 0) + 1)
  const counts = [...byUser.values()].sort((a, b) => a - b)
  if (counts.length) info(`Predictions per user — min: ${counts[0]}  max: ${counts.at(-1)}  median: ${counts[Math.floor(counts.length / 2)]}`)
}

/* ── 6. Golden Boot ────────────────────────────────────── */
async function auditGoldenBoot() {
  section('Golden Boot')
  type GBRow = {
    provider_player_id: number; player_name: string; team_code: string | null
    goals: number; assists: number; minutes_played: number | null
    photo_url: string | null; source: string | null; updated_at: string
    fifa_rank: number | null; fifa_assist_rank: number | null
  }
  const all = await getRows<GBRow>('golden_boot_stats',
    'provider_player_id,player_name,team_code,goals,assists,minutes_played,photo_url,source,updated_at,fifa_rank,fifa_assist_rank'
  )
  const noPhoto  = all.filter(r => !r.photo_url)
  const noTeam   = all.filter(r => !r.team_code)
  const noMin    = all.filter(r => r.minutes_played == null)
  const stale    = all.filter(r => r.updated_at && new Date(r.updated_at) < new Date(Date.now() - 25 * 60 * 60 * 1000))
  const goalers  = all.filter(r => r.goals > 0).sort((a,b) => b.goals - a.goals)
  const assisters= all.filter(r => r.assists > 0).sort((a,b) => b.assists - a.assists)

  info(`Total rows: ${all.length}  |  With goals: ${goalers.length}  |  With assists: ${assisters.length}`)
  if (goalers[0])   info(`Top scorer:    ${goalers[0].player_name} (${goalers[0].goals} goals, ${goalers[0].team_code ?? '?'})`)
  if (assisters[0]) info(`Top assist:    ${assisters[0].player_name} (${assisters[0].assists} assists, ${assisters[0].team_code ?? '?'})`)
  if (noPhoto.length) warn(`${noPhoto.length} / ${all.length} missing photo URL`)
  else ok('All rows have a photo URL')
  if (noTeam.length) warn(`${noTeam.length} row(s) not matched to a team_code`)
  else ok('All rows matched to a team')
  if (noMin.length) warn(`${noMin.length} row(s) missing minutes_played`)
  else ok('All rows have minutes_played')
  if (stale.length) warn(`${stale.length} row(s) not updated in >25h — golden boot sync may have failed`)
  else ok('Golden boot data is fresh')
}

/* ── 7. Match stats (jsonb) ────────────────────────────── */
async function auditMatchStats() {
  section('Match stats (team + player)')
  type TeamStat = { match_id: string; team_code: string; stats: Record<string, unknown>; updated_at: string }
  type ScoredMatch = { id: string; home_team: string; away_team: string; real_home_score: number | null; real_away_score: number | null }
  type Participant = { match_id: string; player_id: number | null; is_starting: boolean }
  type Substitution = { match_id: string; player_in_id: number }
  const [teamStats, playerStats, matches, participants, substitutions] = await Promise.all([
    getRows<TeamStat>('match_team_stats', 'match_id,team_code,stats,updated_at'),
    getRows<PlayerStat>('match_player_stats', 'match_id,player_id,team_code,stats,updated_at'),
    getRows<ScoredMatch>('matches', 'id,home_team,away_team,real_home_score,real_away_score'),
    getRows<Participant>('match_participants', 'match_id,player_id,is_starting'),
    getRows<Substitution>('lineup_substitutions', 'match_id,player_in_id'),
  ])

  type PlayerStat = { match_id: string; player_id: number; team_code: string; stats: Record<string, unknown>; updated_at: string }
  const scoredMatchIds = new Set(matches.filter((match) => match.real_home_score != null && match.real_away_score != null).map((match) => match.id))
  const matchLabel = new Map(matches.map((match) => [match.id, `${match.home_team} v ${match.away_team}`]))
  const playersWhoAppeared = new Set([
    ...participants.filter((row) => row.is_starting && row.player_id != null).map((row) => `${row.match_id}:${row.player_id}`),
    ...substitutions.map((row) => `${row.match_id}:${row.player_in_id}`),
  ])

  const teamMatches = new Set(teamStats.map(s => s.match_id))

  // Inspect jsonb keys from first few rows
  const allTeamKeys = new Set<string>()
  for (const s of teamStats.slice(0, 20)) Object.keys(s.stats ?? {}).forEach(k => allTeamKeys.add(k))
  const allPlayerKeys = new Set<string>()
  for (const s of playerStats.slice(0, 20)) Object.keys(s.stats ?? {}).forEach(k => allPlayerKeys.add(k))

  const emptyTeamStats   = teamStats.filter(s => scoredMatchIds.has(s.match_id) && (!s.stats || Object.keys(s.stats).length === 0))
  const emptyPlayerStats = playerStats.filter((stat) =>
    scoredMatchIds.has(stat.match_id) &&
    playersWhoAppeared.has(`${stat.match_id}:${stat.player_id}`) &&
    (!stat.stats || Object.keys(stat.stats).length === 0),
  )
  const pendingEmptyTeamStats = teamStats.filter(s => !scoredMatchIds.has(s.match_id) && (!s.stats || Object.keys(s.stats).length === 0))
  const unusedBenchWithoutStats = playerStats.filter((stat) =>
    scoredMatchIds.has(stat.match_id) &&
    !playersWhoAppeared.has(`${stat.match_id}:${stat.player_id}`) &&
    (!stat.stats || Object.keys(stat.stats).length === 0),
  )

  info(`Team stat rows: ${teamStats.length} across ${teamMatches.size} match(es)`)
  info(`Team stat keys: ${[...allTeamKeys].slice(0, 18).join(', ')}${allTeamKeys.size > 18 ? ` … +${allTeamKeys.size - 18} more` : ''}`)
  if (emptyTeamStats.length) warn(`${emptyTeamStats.length} team-stat row(s) have empty stats jsonb`)
  else ok('All team-stat rows have stats data')
  if (pendingEmptyTeamStats.length) info(`${pendingEmptyTeamStats.length} empty team-stat row(s) belong to unscored fixtures — expected before FIFA publishes a stat pack`)

  info(`Player stat rows: ${playerStats.length}`)
  info(`Player stat keys: ${[...allPlayerKeys].slice(0, 18).join(', ')}${allPlayerKeys.size > 18 ? ` … +${allPlayerKeys.size - 18} more` : ''}`)
  if (emptyPlayerStats.length) {
    const affected = [...new Set(emptyPlayerStats.map((row) => matchLabel.get(row.match_id) ?? row.match_id))]
    warn(`${emptyPlayerStats.length} player-stat row(s) have empty stats jsonb: ${affected.join(', ')}`)
  }
  else ok('All player-stat rows have stats data')
  if (unusedBenchWithoutStats.length) info(`${unusedBenchWithoutStats.length} empty player-stat row(s) belong to unused bench players — expected`)

  // Possession sanity: should sum to ~100 per match
  type Poss = { match_id: string; stats: { possession?: number } }
  const withPoss = (teamStats as unknown as Poss[]).filter(s => s.stats?.possession != null)
  const byMatch = new Map<string, number[]>()
  for (const s of withPoss) byMatch.set(s.match_id, [...(byMatch.get(s.match_id) ?? []), s.stats.possession!])
  const badPairs = [...byMatch.entries()].filter(([, vals]) => vals.length === 2 && Math.abs(vals[0]! + vals[1]! - 100) > 2)
  if (badPairs.length) warn(`${badPairs.length} match(es) where possession pair doesn't sum to ~100`)
  else if (byMatch.size > 0) ok(`Possession sums to ~100 in all ${byMatch.size} match(es) that have it`)
}

/* ── 8. Match events ───────────────────────────────────── */
async function auditMatchEvents() {
  section('Match events')
  type Event = { match_id: string; type: string; team_code: string; minute: number | null; player: { name: string } | null }
  const all = await getRows<Event>('match_events', 'match_id,type,team_code,minute,player:player_id(name)')

  const byType = new Map<string, number>()
  for (const e of all) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
  const noMinute = all.filter(e => e.minute == null)
  const noPlayer = all.filter(e => !e.player)

  info(`Total events: ${all.length}`)
  for (const [type, n] of [...byType.entries()].sort((a,b) => b[1] - a[1])) {
    info(`  ${type.padEnd(15)} ${n}`)
  }
  if (noMinute.length) warn(`${noMinute.length} event(s) missing minute`)
  else if (all.length > 0) ok('All events have a minute')
  if (noPlayer.length) warn(`${noPlayer.length} event(s) have no linked player`)
  else if (all.length > 0) ok('All events have a linked player')
}

/* ── 9. Leagues & members ──────────────────────────────── */
async function auditLeagues() {
  section('Leagues & members')
  type League = { id: string; name: string; join_code: string | null; type: string; scoring: unknown; created_at: string }
  type Member = { league_id: string; user_id: string; joined_at: string }

  const leagues = await getRows<League>('leagues', 'id,name,join_code,type,scoring,created_at')
  const members = await getRows<Member>('league_members', 'league_id,user_id,joined_at')

  const noCode = leagues.filter(l => !l.join_code)
  const byLeague = new Map<string, number>()
  for (const m of members) byLeague.set(m.league_id, (byLeague.get(m.league_id) ?? 0) + 1)

  info(`Leagues: ${leagues.length}  |  Total memberships: ${members.length}`)
  for (const l of leagues) {
    const n = byLeague.get(l.id) ?? 0
    const hasCustomScoring = l.scoring && Object.keys(l.scoring as object).length > 0
    info(`  "${l.name}"  type=${l.type}  members=${n}  code=${l.join_code ?? 'NONE'}  custom-scoring=${hasCustomScoring ? 'yes' : 'no'}`)
  }
  if (noCode.length) warn(`${noCode.length} league(s) missing join_code`)
  else ok('All leagues have a join code')

  // Orphan members (no matching league)
  const leagueIds = new Set(leagues.map(l => l.id))
  const orphans = members.filter(m => !leagueIds.has(m.league_id))
  if (orphans.length) bad(`${orphans.length} member row(s) reference a non-existent league`)
  else ok('All members reference a valid league')
}

/* ── 10. Profiles ──────────────────────────────────────── */
async function auditProfiles() {
  section('Profiles')
  type Profile = { id: string; username: string | null; avatar_url: string | null; is_admin: boolean; theme: string | null }
  const all = await getRows<Profile>('profiles', 'id,username,avatar_url,is_admin,theme')

  const noUsername = all.filter(p => !p.username)
  const noAvatar   = all.filter(p => !p.avatar_url)
  const admins     = all.filter(p => p.is_admin)
  const byTheme    = new Map<string, number>()
  for (const p of all) byTheme.set(p.theme ?? 'unset', (byTheme.get(p.theme ?? 'unset') ?? 0) + 1)

  info(`Total users: ${all.length}  |  Admins: ${admins.map(a => a.username ?? a.id.slice(0,8)).join(', ')}`)
  if (noUsername.length) warn(`${noUsername.length} profile(s) missing username`)
  else ok('All profiles have a username')
  info(`Avatar coverage: ${all.length - noAvatar.length} / ${all.length} have an avatar (${noAvatar.length} using initials — normal)`)
  info(`Theme: ${[...byTheme.entries()].map(([k,v]) => `${k}=${v}`).join('  ')}`)
}

/* ── 11. Group & tournament predictions ─────────────────── */
async function auditGroupTournament() {
  section('Group & tournament predictions')
  type GP = { id: string; user_id: string; group_name: string; ranked_codes: string[]; points_awarded: number | null }
  type TP = { user_id: string; champion: string | null; runner_up: string | null; pts_champion: number | null; pts_runner_up: number | null; pts_semi: number | null; pts_quarter: number | null }

  const gp = await getRows<GP>('group_predictions', 'id,user_id,group_name,ranked_codes,points_awarded')
  const tp = await getRows<TP>('tournament_predictions', 'user_id,champion,runner_up,pts_champion,pts_runner_up,pts_semi,pts_quarter')

  const gpUsers = new Set(gp.map(r => r.user_id))
  const tpUsers = new Set(tp.map(r => r.user_id))
  const gpScored = gp.filter(r => r.points_awarded != null)

  // 12 groups expected per user
  const groupsByUser = new Map<string, Set<string>>()
  for (const g of gp) {
    if (!groupsByUser.has(g.user_id)) groupsByUser.set(g.user_id, new Set())
    groupsByUser.get(g.user_id)!.add(g.group_name)
  }
  const incomplete = [...groupsByUser.entries()].filter(([, gs]) => gs.size < 12)

  info(`Group predictions: ${gp.length} rows  |  Users: ${gpUsers.size}  |  Scored: ${gpScored.length} / ${gp.length}`)
  if (incomplete.length) warn(`${incomplete.length} user(s) haven't predicted all 12 groups`)
  else if (gpUsers.size > 0) ok('All active users have all 12 group predictions')
  else info('No group predictions yet')

  info(`Tournament predictions: ${tp.length}  |  Users: ${tpUsers.size}`)
  const noChampion = tp.filter(r => !r.champion)
  if (noChampion.length) warn(`${noChampion.length} tournament prediction(s) missing champion pick`)
  else if (tp.length > 0) ok('All tournament predictions have a champion pick')
}

/* ── 12. FIFA teams cache ──────────────────────────────── */
async function auditFifaTeams() {
  section('FIFA teams cache')
  type FifaTeam = { code: string; name: string | null; crest_url: string | null; source_updated_at: string | null }
  const all = await getRows<FifaTeam>('fifa_teams', 'code,name,crest_url,source_updated_at')

  const noCrest = all.filter(t => !t.crest_url)
  const noName  = all.filter(t => !t.name)
  const stale   = all.filter(t => t.source_updated_at && new Date(t.source_updated_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  info(`FIFA team entries: ${all.length} / 48 expected`)
  if (all.length < 48) warn(`Only ${all.length} of 48 teams in fifa_teams — run data:fifa-teams to backfill`)
  else ok('All 48 teams present')
  if (noCrest.length) warn(`${noCrest.length} team(s) missing crest_url`)
  else ok('All teams have a crest URL')
  if (noName.length) warn(`${noName.length} team(s) missing name`)
  else ok('All teams have a name')
  if (stale.length) warn(`${stale.length} team(s) not updated in 7+ days`)
  else ok('All team records are recent')
}

/* ── 13. Recent sync runs ──────────────────────────────── */
async function auditSyncRuns() {
  section('Recent sync runs (last 25)')
  type Run = { id: string; kind: string; trigger_source: string; status: string; started_at: string; finished_at: string | null; details: Record<string, unknown>; error_summary: string | null }
  const recent = await getRows<Run>('sync_runs', 'id,kind,trigger_source,status,started_at,finished_at,details,error_summary',
    (q) => q.order('started_at', { ascending: false }).limit(25)
  )
  if (!recent.length) { warn('No sync runs found'); return }

  const byKind = new Map<string, { ok: number; fail: number; last: string; lastStatus: string }>()
  for (const r of recent) {
    const entry = byKind.get(r.kind) ?? { ok: 0, fail: 0, last: r.started_at, lastStatus: r.status }
    if (r.status === 'success') entry.ok++
    else if (r.status === 'failed') entry.fail++
    byKind.set(r.kind, entry)
  }

  for (const [kind, s] of byKind.entries()) {
    const flag = s.lastStatus === 'success' ? '✓' : '⚠'
    console.log(`  ${flag}  ${kind.padEnd(25)} latest=${s.lastStatus.padEnd(8)} ✓${s.ok} ✗${s.fail}  last: ${s.last.slice(0,16)}`)
  }

  // Show the last 10 in chronological detail
  console.log('')
  for (const r of recent.slice(0, 10)) {
    const dur = r.finished_at ? `${Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s` : '…'
    const flag = r.status === 'success' ? '✓' : r.status === 'failed' ? '✗' : '…'
    console.log(`  ${flag}  ${r.kind.padEnd(20)} ${r.status.padEnd(10)} ${dur.padStart(5)}  ${r.started_at.slice(0,16)}  ${r.error_summary ? `ERR: ${r.error_summary.slice(0,70)}` : ''}`)
  }
}

/* ── main ──────────────────────────────────────────────── */
async function main() {
  console.log('\n' + '═'.repeat(64))
  console.log('  MatchDay — Full Database Audit')
  console.log(`  ${new Date().toISOString()}`)
  console.log('═'.repeat(64))

  await auditCounts()
  await auditMatches()
  await auditPlayers()
  await auditLineups()
  await auditPredictions()
  await auditGoldenBoot()
  await auditMatchStats()
  await auditMatchEvents()
  await auditLeagues()
  await auditProfiles()
  await auditGroupTournament()
  await auditFifaTeams()
  await auditSyncRuns()

  console.log('\n' + '═'.repeat(64))
  console.log('  Audit complete.')
  console.log('═'.repeat(64) + '\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
