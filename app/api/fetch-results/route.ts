import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { scorePrediction, type PredictionInput } from '@/lib/scoring'
import { snapshotLeagueRanks } from '@/lib/snapshot'

const FD_TOKEN = process.env.FOOTBALL_DATA_API_KEY ?? process.env.FOOTBALL_API_TOKEN ?? ''
const FD_BASE = 'https://api.football-data.org/v4'

interface FDMatch {
  id: number
  utcDate: string
  status: string
  homeTeam: { tla: string }
  awayTeam: { tla: string }
  score: {
    fullTime: { home: number | null; away: number | null }
  }
}

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  // Service client bypasses RLS for scoring writes across all users' predictions
  const serviceSupabase = createServiceSupabaseClient()

  if (!FD_TOKEN) return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not set' }, { status: 500 })

  // Fetch all FINISHED WC2026 matches from football-data.org
  const fdRes = await fetch(`${FD_BASE}/competitions/WC/matches?season=2026&status=FINISHED`, {
    headers: { 'X-Auth-Token': FD_TOKEN },
    next: { revalidate: 0 },
  })
  if (!fdRes.ok) {
    const txt = await fdRes.text()
    return NextResponse.json({ error: `football-data.org error ${fdRes.status}: ${txt}` }, { status: 502 })
  }
  const { matches: fdMatches }: { matches: FDMatch[] } = await fdRes.json()

  // Load our match table (home/away team + existing scores)
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, real_home_score, real_away_score, match_date')
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Build a lookup: "HOME_TLA|AWAY_TLA" → db match id
  type DBMatch = { id: string; home_team: string; away_team: string; real_home_score: number | null; real_away_score: number | null; match_date: string }
  const byTeams = new Map<string, DBMatch>()
  for (const m of (dbMatches ?? []) as DBMatch[]) {
    byTeams.set(`${m.home_team}|${m.away_team}`, m)
  }

  const toUpdate: { id: string; real_home_score: number; real_away_score: number }[] = []

  for (const fm of fdMatches) {
    if (fm.score.fullTime.home === null || fm.score.fullTime.away === null) continue
    const key = `${fm.homeTeam.tla}|${fm.awayTeam.tla}`
    const db = byTeams.get(key)
    if (!db) continue
    // Skip if score is already set to the same values
    if (db.real_home_score === fm.score.fullTime.home && db.real_away_score === fm.score.fullTime.away) continue
    toUpdate.push({ id: db.id, real_home_score: fm.score.fullTime.home, real_away_score: fm.score.fullTime.away })
  }

  if (toUpdate.length === 0) {
    return NextResponse.json({ message: 'No new results to update', updated: 0, scored: 0 })
  }

  type MatchRow = { home_team: string; away_team: string; real_home_score: number; real_away_score: number; first_goal_team: string | null; first_goal_player_id: number | null }

  // Update matches + lock them, tracking any failures
  const matchErrors: string[] = []
  for (const u of toUpdate) {
    const { error } = await supabase.from('matches').update({ real_home_score: u.real_home_score, real_away_score: u.real_away_score, is_locked: true }).eq('id', u.id)
    if (error) matchErrors.push(`match ${u.id}: ${error.message}`)
  }

  // Re-score predictions for each updated match
  let totalScored = 0
  const scoreErrors: string[] = []
  for (const u of toUpdate) {
    const { data: match, error: mErr } = await supabase.from('matches').select('id, home_team, away_team, real_home_score, real_away_score, first_goal_team, first_goal_player_id').eq('id', u.id).single()
    if (mErr || !match) { scoreErrors.push(`fetch match ${u.id}: ${mErr?.message ?? 'not found'}`); continue }
    const m = match as unknown as MatchRow
    const { data: preds, error: pErr } = await serviceSupabase.from('predictions').select('user_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer').eq('match_id', u.id)
    if (pErr) { scoreErrors.push(`fetch preds ${u.id}: ${pErr.message}`); continue }
    if (!preds?.length) continue
    const result = { home_team: m.home_team, away_team: m.away_team, real_home_score: m.real_home_score, real_away_score: m.real_away_score, first_goal_team: m.first_goal_team, first_goal_player_id: m.first_goal_player_id }
    type FRPredRow = PredictionInput & { user_id: string }
    const updates = (preds as unknown as FRPredRow[]).map((p) => {
      const b = scorePrediction(p, result)
      return { user_id: p.user_id, match_id: u.id, pred_home: p.pred_home, pred_away: p.pred_away, points_awarded: b.total, pts_outcome: b.outcome, pts_exact: b.exact, pts_goal_diff: b.goalDiff, pts_total_goals: b.totalGoals, pts_team_goals: b.teamGoals, pts_btts: b.btts, pts_first_team: b.firstTeam, pts_first_scorer: b.firstScorer }
    })
    const { error: uErr } = await serviceSupabase.from('predictions').upsert(updates, { onConflict: 'user_id,match_id' })
    if (uErr) { scoreErrors.push(`upsert preds ${u.id}: ${uErr.message}`); continue }
    totalScored += updates.length
  }

  // Snapshot ranks so movement arrows reflect the new results
  const snapshotted = await snapshotLeagueRanks(serviceSupabase)

  const errors = [...matchErrors, ...scoreErrors]
  return NextResponse.json({
    message: `Updated ${toUpdate.length} match result${toUpdate.length !== 1 ? 's' : ''}, scored ${totalScored} prediction${totalScored !== 1 ? 's' : ''}, snapshotted ${snapshotted} rank${snapshotted !== 1 ? 's' : ''}`,
    updated: toUpdate.length, scored: totalScored, snapshotted,
    ...(errors.length ? { errors } : {}),
  })
}
