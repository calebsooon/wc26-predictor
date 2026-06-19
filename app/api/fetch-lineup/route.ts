import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { kapi, findFixture, kickoffConfigured, type KLineup } from '@/lib/kickoff'
import { teamNameToCode, groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'

// Admin: pull the confirmed lineup + formation for a match from Kickoffapi and
// write it into the `lineups` table (so the existing SquadPanel / formation pitch
// render it). Kickoffapi is primary; TheStatsAPI fallback is wired separately.
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  if (!kickoffConfigured()) return NextResponse.json({ error: 'KICKOFF_API_KEY not set' }, { status: 500 })

  let match_id: string | undefined
  try { match_id = (await request.json()).match_id } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 })

  const service = createServiceSupabaseClient()
  const { data: match } = await service.from('matches').select('id, home_team, away_team, match_date').eq('id', match_id).single()
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  const m = match as { id: string; home_team: string; away_team: string; match_date: string }

  const found = await findFixture(m.home_team, m.away_team, m.match_date)
  if (!found) return NextResponse.json({ error: 'No matching fixture found on Kickoffapi for this date/teams' }, { status: 404 })

  const { response: lineups } = await kapi<KLineup>(`/fixtures/${found.fixture.id}/lineups`)
  if (!lineups || lineups.length === 0) return NextResponse.json({ error: 'Lineups not published yet for this fixture' }, { status: 404 })

  // Our roster grouped by team code for name-matching within each squad.
  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[]))
    if (data.length < 1000) break
  }
  const byCode = groupPlayersByCode(roster)

  const rows: Record<string, unknown>[] = []
  const formations: Record<string, string | null> = {}
  const unmatched: string[] = []

  for (const lu of lineups) {
    const code = teamNameToCode(lu.team?.name) ?? teamNameToCode(found.fixture.homeTeam.id === lu.teamId ? found.fixture.homeTeam.name : found.fixture.awayTeam.name)
    if (!code) continue
    formations[code] = lu.formation
    const squad = byCode.get(code) ?? []
    const take = (arr: KLineup['startXI'], starting: boolean) => arr.forEach((e, i) => {
      const hit = matchPlayer(e.player.name, squad)
      if (!hit) { unmatched.push(`${code}:${e.player.name}`); return }
      rows.push({
        match_id: m.id, team_code: code, player_id: hit.id,
        is_starting: starting, shirt_number: e.player.number,
        position_label: e.player.pos, grid: e.player.grid, sort_order: i, source: 'kickoff',
      })
    })
    take(lu.startXI ?? [], true)
    take(lu.substitutes ?? [], false)
  }

  // Replace this match's lineups, then write the formations on the match.
  await service.from('lineups').delete().eq('match_id', m.id)
  if (rows.length) {
    const { error } = await service.from('lineups').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await service.from('matches').update({
    home_formation: formations[m.home_team] ?? null,
    away_formation: formations[m.away_team] ?? null,
  }).eq('id', m.id)

  return NextResponse.json({
    ok: true, fixtureId: found.fixture.id,
    formations: { home: formations[m.home_team] ?? null, away: formations[m.away_team] ?? null },
    written: rows.length, unmatched,
  })
}
