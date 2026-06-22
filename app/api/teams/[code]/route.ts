import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function compactStats(stats: Record<string, unknown> | null) {
  // FIFA's stat catalogue grows during the tournament. Keep numeric values
  // rather than maintaining a brittle allow-list that silently turns new
  // metrics (for example tackles/interceptions) into zero in the UI.
  return Object.fromEntries(Object.entries(stats ?? {}).flatMap(([key, value]) => {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? [[key, number]] : []
  }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return NextResponse.json({ error: 'Unknown team' }, { status: 404 })
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const [team, players, matches, picks] = await Promise.all([
    supabase.from('fifa_teams').select('code, name, confederation, group_letter, is_host, flag_url, crest_url, stats, source_updated_at, updated_at').eq('code', code).maybeSingle(),
    supabase.from('fifa_player_stats')
      .select('player_id, fifa_player_id, jersey_number, position, height_cm, weight_kg, stats, source_updated_at, players!fifa_player_stats_player_id_fkey!inner(name, photo_url, dob, injured, injury_type)')
      .eq('team_code', code)
      .order('jersey_number', { nullsFirst: false }),
    supabase.from('matches').select('id, home_team, away_team, match_date, real_home_score, real_away_score, group_name').or(`home_team.eq.${code},away_team.eq.${code}`).order('match_date'),
    // This feeds the personal gold star in the squad, not league consensus.
    // Keep it scoped to the signed-in player both for correctness and cost.
    supabase.from('predictions').select('pred_first_scorer_id').eq('user_id', user.id).not('pred_first_scorer_id', 'is', null),
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
