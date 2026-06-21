import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const teamStatKeys = [
  'matches_played', 'goals', 'goals_conceded', 'clean_sheets', 'passes', 'passes_completed',
  'passing_accuracy_rate', 'possession', 'xg', 'attempt_at_goal', 'attempt_at_goal_on_target',
  'attempt_at_goal_conversion_rate', 'corners', 'crosses', 'crosses_completed', 'take_ons_completed',
  'total_distance', 'sprints', 'forced_turnovers', 'linebreaks_attempted', 'linebreaks_attempted_completed',
  'goalkeeper_saves', 'goalkeeper_save_percentage', 'fouls_for', 'yellow_cards', 'red_cards',
]

function compactStats(stats: Record<string, unknown> | null) {
  return Object.fromEntries(teamStatKeys.map((key) => [key, stats?.[key] ?? 0]))
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const [teams, matches] = await Promise.all([
    supabase.from('fifa_teams').select('code, name, confederation, group_letter, is_host, flag_url, crest_url, stats, updated_at').order('name'),
    supabase.from('matches').select('id, home_team, away_team, match_date, real_home_score, real_away_score, group_name').order('match_date'),
  ])
  if (teams.error) return NextResponse.json({ error: teams.error.message }, { status: 500 })
  if (matches.error) return NextResponse.json({ error: matches.error.message }, { status: 500 })

  return NextResponse.json({
    teams: (teams.data ?? []).map((team) => ({ ...team, stats: compactStats(team.stats as Record<string, unknown> | null) })),
    matches: matches.data ?? [],
  }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } })
}
