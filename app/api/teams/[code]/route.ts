import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const playerStatKeys = [
  'goals', 'assists', 'total_competition_minutes_played', 'matches_played',
  'passes', 'passes_completed', 'passing_accuracy_rate', 'attempt_at_goal', 'attempt_at_goal_on_target',
  'xg', 'crosses', 'crosses_completed', 'take_ons_completed', 'total_distance', 'avg_speed', 'top_speed',
  'sprints', 'forced_turnovers', 'linebreaks_attempted', 'linebreaks_attempted_completed',
  'goalkeeper_saves', 'goalkeeper_save_percentage', 'clean_sheets', 'yellow_cards', 'red_cards',
]

function compactStats(stats: Record<string, unknown> | null) {
  return Object.fromEntries(playerStatKeys.map((key) => [key, stats?.[key] ?? 0]))
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return NextResponse.json({ error: 'Unknown team' }, { status: 404 })
  const supabase = await createServerSupabaseClient()
  const [team, players, matches, picks] = await Promise.all([
    supabase.from('fifa_teams').select('*').eq('code', code).maybeSingle(),
    supabase.from('fifa_player_stats')
      .select('player_id, fifa_player_id, jersey_number, position, height_cm, weight_kg, stats, source_updated_at, players!fifa_player_stats_player_id_fkey!inner(name, photo_url, dob, injured, injury_type)')
      .eq('team_code', code)
      .order('jersey_number', { nullsFirst: false }),
    supabase.from('matches').select('id, home_team, away_team, match_date, real_home_score, real_away_score, group_name').or(`home_team.eq.${code},away_team.eq.${code}`).order('match_date'),
    supabase.from('predictions').select('pred_first_scorer_id').not('pred_first_scorer_id', 'is', null),
  ])
  if (team.error) return NextResponse.json({ error: team.error.message }, { status: 500 })
  if (!team.data) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (players.error) return NextResponse.json({ error: players.error.message }, { status: 500 })
  if (matches.error) return NextResponse.json({ error: matches.error.message }, { status: 500 })

  return NextResponse.json({
    team: team.data,
    players: (players.data ?? []).map((row) => {
      const player = Array.isArray(row.players) ? row.players[0] : row.players
      return { ...row, player, players: undefined, stats: compactStats(row.stats as Record<string, unknown> | null) }
    }),
    matches: matches.data ?? [],
    picks: (picks.data ?? []).flatMap((pick) => pick.pred_first_scorer_id ? [pick.pred_first_scorer_id] : []),
  }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } })
}
