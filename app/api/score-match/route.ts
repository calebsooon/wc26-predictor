import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { scorePrediction, type PredictionInput } from '@/lib/scoring'

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let match_id: string | undefined
  try { match_id = (await request.json()).match_id } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!match_id || typeof match_id !== 'string') return NextResponse.json({ error: 'match_id is required' }, { status: 400 })

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, real_home_score, real_away_score, first_goal_team, first_goal_player_id')
    .eq('id', match_id)
    .single()
  if (matchErr || !match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const m = match as unknown as {
    home_team: string; away_team: string
    real_home_score: number | null; real_away_score: number | null
    first_goal_team: string | null; first_goal_player_id: number | null
  }
  if (m.real_home_score === null || m.real_away_score === null) {
    return NextResponse.json({ error: 'Match has no real scores yet' }, { status: 422 })
  }

  const result = {
    home_team: m.home_team, away_team: m.away_team,
    real_home_score: m.real_home_score, real_away_score: m.real_away_score,
    first_goal_team: m.first_goal_team, first_goal_player_id: m.first_goal_player_id,
  }

  const { data: predictions, error: predsErr } = await supabase
    .from('predictions')
    .select('id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id')
    .eq('match_id', match_id)
  if (predsErr) return NextResponse.json({ error: predsErr.message }, { status: 500 })
  if (!predictions || predictions.length === 0) return NextResponse.json({ match_id, scored: 0 })

  const updates = predictions.map((p) => {
    const b = scorePrediction(p as unknown as PredictionInput, result)
    return {
      id: (p as { id: string }).id,
      match_id,
      pred_home: (p as { pred_home: number }).pred_home,
      pred_away: (p as { pred_away: number }).pred_away,
      points_awarded: b.total,
      pts_outcome: b.outcome, pts_exact: b.exact, pts_goal_diff: b.goalDiff,
      pts_total_goals: b.totalGoals, pts_btts: b.btts, pts_first_team: b.firstTeam,
      pts_first_scorer: b.firstScorer,
    }
  })

  const { error: upsertErr } = await supabase.from('predictions').upsert(updates, { onConflict: 'id' })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ match_id, scored: updates.length })
}
