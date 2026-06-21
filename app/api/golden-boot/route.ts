import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// The daily sync stores FIFA's published ranked table. Keeping that in our DB
// makes the app fast and avoids exposing a third-party request to clients.
export const dynamic = 'force-dynamic'

interface GoldenBootStat {
  player_name: string
  photo_url: string | null
  goals: number
  assists: number
  minutes_played: number
  fifa_rank: number | null
  fifa_assist_rank: number | null
  fifa_assist_order: number | null
  team_code: string
  updated_at: string
  players: { photo_url: string | null } | { photo_url: string | null }[] | null
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('golden_boot_stats')
    .select('player_name, photo_url, goals, assists, minutes_played, fifa_rank, fifa_assist_rank, fifa_assist_order, team_code, updated_at, players(photo_url)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as GoldenBootStat[]
  const playerPhoto = (player: GoldenBootStat['players']) =>
    Array.isArray(player) ? player[0]?.photo_url : player?.photo_url
  const storedPhoto = (photo: string | null | undefined) =>
    photo?.includes('.supabase.co/storage/v1/object/public/') ? photo : null
  const shape = (primary: 'goals' | 'assists') => rows
    .map((row) => ({
      name: row.player_name,
      photo: storedPhoto(playerPhoto(row.players)) ?? storedPhoto(row.photo_url),
      goals: row.goals,
      assists: row.assists,
      minutes: row.minutes_played,
      rank: primary === 'goals' ? row.fifa_rank : row.fifa_assist_rank,
      order: primary === 'goals' ? row.fifa_rank : row.fifa_assist_order,
      code: row.team_code,
    }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name))

  return NextResponse.json({
    scorers: shape('goals'),
    assists: shape('assists'),
    updatedAt: rows.reduce<string | null>((latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest, null),
  }, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } })
}
