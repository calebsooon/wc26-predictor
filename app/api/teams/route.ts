import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function compactStats(stats: Record<string, unknown> | null) {
  return Object.fromEntries(Object.entries(stats ?? {}).flatMap(([key, value]) => {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? [[key, number]] : []
  }))
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const [teams, matches] = await Promise.all([
    supabase.from('fifa_teams').select('code, name, confederation, group_letter, is_host, flag_url, crest_url, stats, source_updated_at, updated_at').order('name'),
    supabase.from('matches').select('id, home_team, away_team, match_date, real_home_score, real_away_score, group_name').order('match_date'),
  ])
  if (teams.error) return NextResponse.json({ error: teams.error.message }, { status: 500 })
  if (matches.error) return NextResponse.json({ error: matches.error.message }, { status: 500 })

  return NextResponse.json({
    teams: (teams.data ?? []).map((team) => ({ ...team, stats: compactStats(team.stats as Record<string, unknown> | null) })),
    matches: matches.data ?? [],
  }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } })
}
