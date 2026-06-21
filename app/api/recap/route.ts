import { NextResponse } from 'next/server'
import { buildGameweekRecap, type RecapMatch, type RecapMatchStat, type RecapPrediction } from '@/lib/gameweek-recap'
import { isMoneyLeague, type League } from '@/lib/league'
import { resolveWeights } from '@/lib/scoring'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { ProfileLite } from '@/lib/leaderboard'

const PRED_COLS = 'user_id, match_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'

export async function GET(request: Request) {
  const gameweek = Number(new URL(request.url).searchParams.get('gw'))
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 8) return NextResponse.json({ error: 'Invalid gameweek' }, { status: 400 })
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('active_league_id').eq('id', user.id).maybeSingle()
  let leagueId = profile?.active_league_id ?? null
  if (leagueId) {
    const { data: activeMembership } = await supabase.from('league_members').select('league_id').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle()
    // An old active_league_id must never turn a recap endpoint into a cross-
    // league lookup. Fall back to a real membership if the user left it.
    if (!activeMembership) leagueId = null
  }
  if (!leagueId) {
    const { data: membership } = await supabase.from('league_members').select('league_id').eq('user_id', user.id).limit(1).maybeSingle()
    leagueId = membership?.league_id ?? null
  }
  if (!leagueId) return NextResponse.json({ error: 'No active league' }, { status: 404 })

  const [{ data: league }, { data: members }] = await Promise.all([
    supabase.from('leagues').select('id, name, type, prize_pool, scoring').eq('id', leagueId).maybeSingle(),
    supabase.from('league_members').select('user_id').eq('league_id', leagueId),
  ])
  const memberIds = (members ?? []).map((member) => member.user_id)
  const [{ data: profiles }, { data: matches }] = await Promise.all([
    memberIds.length ? supabase.from('profiles').select('id, username, avatar_url').in('id', memberIds) : Promise.resolve({ data: [] }),
    supabase.from('matches').select('id, gw_number, home_team, away_team, real_home_score, real_away_score').lte('gw_number', gameweek),
  ])
  const matchIds = (matches ?? []).map((match) => match.id)
  const gwMatchIds = (matches ?? []).filter((m) => (m as { gw_number?: number | null }).gw_number === gameweek).map((m) => m.id)
  const [{ data: predictions }, { data: matchStats }] = await Promise.all([
    memberIds.length && matchIds.length
      ? supabase.from('predictions').select(PRED_COLS).in('user_id', memberIds).in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
    gwMatchIds.length
      ? supabase.from('match_team_stats').select('match_id, team_code, stats').in('match_id', gwMatchIds)
      : Promise.resolve({ data: [] }),
  ])
  const recap = buildGameweekRecap({
    gameweek,
    matches: (matches ?? []) as RecapMatch[],
    predictions: (predictions ?? []) as RecapPrediction[],
    profiles: (profiles ?? []) as ProfileLite[],
    userId: user.id,
    weights: resolveWeights((league as League | null)?.scoring),
    matchStats: (matchStats ?? []) as RecapMatchStat[],
  })
  return NextResponse.json({ recap, money: isMoneyLeague(league as League | null) }, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120', Vary: 'Cookie' } })
}
