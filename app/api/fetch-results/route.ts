import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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

  // Update matches + lock them
  for (const u of toUpdate) {
    await supabase.from('matches').update({ real_home_score: u.real_home_score, real_away_score: u.real_away_score, is_locked: true }).eq('id', u.id)
  }

  // Re-score predictions for each updated match
  let totalScored = 0
  for (const u of toUpdate) {
    const { data: match } = await supabase.from('matches').select('id, home_team, away_team, real_home_score, real_away_score, first_goal_team, first_goal_player_id').eq('id', u.id).single()
    if (!match) continue
    const m = match as unknown as { home_team: string; away_team: string; real_home_score: number; real_away_score: number; first_goal_team: string | null; first_goal_player_id: number | null }
    const { data: preds } = await supabase.from('predictions').select('id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer').eq('match_id', u.id)
    if (!preds?.length) continue
    const result = { home_team: m.home_team, away_team: m.away_team, real_home_score: m.real_home_score, real_away_score: m.real_away_score, first_goal_team: m.first_goal_team, first_goal_player_id: m.first_goal_player_id }
    const updates = preds.map((p) => {
      const b = scorePrediction(p as unknown as PredictionInput, result)
      return { id: (p as { id: string }).id, match_id: u.id, pred_home: (p as { pred_home: number }).pred_home, pred_away: (p as { pred_away: number }).pred_away, points_awarded: b.total, pts_outcome: b.outcome, pts_exact: b.exact, pts_goal_diff: b.goalDiff, pts_total_goals: b.totalGoals, pts_team_goals: b.teamGoals, pts_btts: b.btts, pts_first_team: b.firstTeam, pts_first_scorer: b.firstScorer }
    })
    await supabase.from('predictions').upsert(updates, { onConflict: 'id' })
    totalScored += updates.length
  }

  // Snapshot ranks so movement arrows reflect the new results
  const snapshotted = await snapshotLeagueRanks(supabase)

  return NextResponse.json({ message: `Updated ${toUpdate.length} match result${toUpdate.length !== 1 ? 's' : ''}, scored ${totalScored} prediction${totalScored !== 1 ? 's' : ''}, snapshotted ${snapshotted} rank${snapshotted !== 1 ? 's' : ''}`, updated: toUpdate.length, scored: totalScored, snapshotted })
}
