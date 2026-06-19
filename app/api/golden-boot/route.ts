import { NextResponse } from 'next/server'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON } from '@/lib/kickoff'
import { teamNameToCode } from '@/lib/team-match'

// Public (auth-gated by middleware) Golden Boot feed: top scorers + assists for
// the World Cup, enriched with our team codes. Key stays server-side.
export const revalidate = 1800

interface KStat { playerId: number; teamId: number; goals: number | null; assists: number | null; photo: string | null; player: { id: number; name: string } | null }
interface KTeam { id: number; name: string }

export async function GET() {
  if (!kickoffConfigured()) return NextResponse.json({ error: 'KICKOFF_API_KEY not set' }, { status: 500 })

  const [scorers, assists, teams] = await Promise.all([
    kapi<KStat>(`/topscorers?league=${WC_LEAGUE}&season=${WC_SEASON}`),
    kapi<KStat>(`/topassists?league=${WC_LEAGUE}&season=${WC_SEASON}`),
    kapi<KTeam>(`/teams?league=${WC_LEAGUE}&season=${WC_SEASON}`),
  ])
  const codeByTeamId = new Map<number, string | null>()
  for (const t of teams.response ?? []) codeByTeamId.set(t.id, teamNameToCode(t.name))

  const shape = (rows: KStat[]) => (rows ?? []).map((r) => ({
    name: r.player?.name ?? '',
    photo: r.photo ?? null,
    goals: r.goals ?? 0,
    assists: r.assists ?? 0,
    code: codeByTeamId.get(r.teamId) ?? null,
  }))

  return NextResponse.json(
    { scorers: shape(scorers.response), assists: shape(assists.response) },
    { headers: { 'Cache-Control': 'public, max-age=1800' } },
  )
}
