import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { teamNameToCode } from '@/lib/team-match'

// Reads Golden Boot data from the live_cache table (populated by the residential
// scripts/sync-golden-boot.ts, since Vercel can't reach Kickoffapi directly).
export const dynamic = 'force-dynamic'

interface KStat { teamId: number; goals: number | null; assists: number | null; photo: string | null; player: { name: string } | null }
interface KTeam { id: number; name: string }
interface Cached { scorers: KStat[]; assists: KStat[]; teams: KTeam[] }

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: row, error } = await supabase
    .from('live_cache').select('data, updated_at').eq('key', 'golden_boot').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ scorers: [], assists: [], updatedAt: null })

  const cached = (row as { data: Cached; updated_at: string }).data
  const codeByTeamId = new Map<number, string | null>()
  for (const t of cached.teams ?? []) codeByTeamId.set(t.id, teamNameToCode(t.name))

  const shape = (rows: KStat[], primary: 'goals' | 'assists') => (rows ?? [])
    .map((r) => ({
      name: r.player?.name ?? '',
      photo: r.photo ?? null,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      code: codeByTeamId.get(r.teamId) ?? null,
    }))
    .sort((a, b) => b[primary] - a[primary] || b[primary === 'goals' ? 'assists' : 'goals'] - a[primary === 'goals' ? 'assists' : 'goals'] || a.name.localeCompare(b.name))

  return NextResponse.json({
    scorers: shape(cached.scorers, 'goals'),
    assists: shape(cached.assists, 'assists'),
    updatedAt: (row as { updated_at: string }).updated_at,
  })
}
