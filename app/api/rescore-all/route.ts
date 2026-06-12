import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { scorePrediction, type PredictionInput, type MatchResult } from '@/lib/scoring'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const serviceSupabase = createServiceSupabaseClient()

  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, real_home_score, real_away_score, first_goal_team, first_goal_player_id')
    .not('real_home_score', 'is', null)
    .not('real_away_score', 'is', null)
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })
  if (!matches || matches.length === 0) return NextResponse.json({ rescored: 0 })

  const matchIds = (matches as { id: string }[]).map((m) => m.id)
  const { data: predictions, error: predsErr } = await serviceSupabase
    .from('predictions')
    .select('id, match_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer')
    .in('match_id', matchIds)
  if (predsErr) return NextResponse.json({ error: predsErr.message }, { status: 500 })
  if (!predictions || predictions.length === 0) return NextResponse.json({ rescored: 0 })

  const matchMap = new Map<string, MatchResult>()
  for (const m of matches as unknown as (MatchResult & { id: string })[]) {
    matchMap.set(m.id, m)
  }

  const updates = (predictions as unknown as (PredictionInput & { id: string; match_id: string })[]).map((p) => {
    const result = matchMap.get(p.match_id)
    if (!result) return null
    const b = scorePrediction(p, result)
    return {
      id: p.id, match_id: p.match_id,
      pred_home: p.pred_home, pred_away: p.pred_away,
      points_awarded: b.total,
      pts_outcome: b.outcome, pts_exact: b.exact, pts_goal_diff: b.goalDiff,
      pts_total_goals: b.totalGoals, pts_team_goals: b.teamGoals, pts_btts: b.btts,
      pts_first_team: b.firstTeam, pts_first_scorer: b.firstScorer,
    }
  }).filter(Boolean)

  const BATCH = 500
  let total = 0
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    const { error } = await serviceSupabase.from('predictions').upsert(batch as object[], { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message, rescored: total }, { status: 500 })
    total += batch.length
  }

  return NextResponse.json({ rescored: total, matches: matches.length })
}
