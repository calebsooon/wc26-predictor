import { NextResponse } from 'next/server'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON } from '@/lib/kickoff'
import { teamNameToCode } from '@/lib/team-match'

// Public (auth-gated by middleware) Golden Boot feed: top scorers + assists for
// the World Cup, enriched with our team codes. Key stays server-side.
export const dynamic = 'force-dynamic'

interface KStat { playerId: number; teamId: number; goals: number | null; assists: number | null; photo: string | null; player: { id: number; name: string } | null }
interface KTeam { id: number; name: string }

export async function GET() {
  if (!kickoffConfigured()) return NextResponse.json({ error: 'KICKOFF_API_KEY not set' }, { status: 500 })

  try {
    const [scorers, assists, teams] = await Promise.all([
      kapi<KStat>(`/topscorers?league=${WC_LEAGUE}&season=${WC_SEASON}`),
      kapi<KStat>(`/topassists?league=${WC_LEAGUE}&season=${WC_SEASON}`),
      kapi<KTeam>(`/teams?league=${WC_LEAGUE}&season=${WC_SEASON}`),
    ])
    const codeByTeamId = new Map<number, string | null>()
    for (const t of teams.response ?? []) codeByTeamId.set(t.id, teamNameToCode(t.name))

    const shape = (rows: KStat[], primary: 'goals' | 'assists') => (rows ?? [])
      .map((r) => ({
        name: r.player?.name ?? '',
        photo: r.photo ?? null,
        goals: r.goals ?? 0,
        assists: r.assists ?? 0,
        code: codeByTeamId.get(r.teamId) ?? null,
      }))
      .sort((a, b) => b[primary] - a[primary] || b[primary === 'goals' ? 'assists' : 'goals'] - a[primary === 'goals' ? 'assists' : 'goals'] || a.name.localeCompare(b.name))

    return NextResponse.json(
      { scorers: shape(scorers.response, 'goals'), assists: shape(assists.response, 'assists'), updatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load scorer data'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
