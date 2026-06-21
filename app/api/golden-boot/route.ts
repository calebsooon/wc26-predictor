import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Reads MatchDay-owned standings derived from fixture events by the residential
// sync script. The app never trusts the provider's top-scorer aggregate table.
export const dynamic = 'force-dynamic'

interface GoldenBootStat {
  player_name: string
  photo_url: string | null
  goals: number
  assists: number
  team_code: string
  updated_at: string
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('golden_boot_stats')
    .select('player_name, photo_url, goals, assists, team_code, updated_at')
    .order('goals', { ascending: false })
    .order('assists', { ascending: false })
    .order('player_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as GoldenBootStat[]
  const shape = (primary: 'goals' | 'assists') => rows
    .map((row) => ({ name: row.player_name, photo: row.photo_url, goals: row.goals, assists: row.assists, code: row.team_code }))
    .sort((a, b) => b[primary] - a[primary] || b[primary === 'goals' ? 'assists' : 'goals'] - a[primary === 'goals' ? 'assists' : 'goals'] || a.name.localeCompare(b.name))

  return NextResponse.json({
    scorers: shape('goals'),
    assists: shape('assists'),
    updatedAt: rows[0]?.updated_at ?? null,
  })
}
