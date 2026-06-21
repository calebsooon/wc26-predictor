import { matchPlayer, type RosterPlayer } from '@/lib/team-match'

export interface GoldenBootEvent {
  teamId: number
  playerId: number | null
  playerName: string | null
  assistId?: number | null
  assistName?: string | null
  type: string
  detail: string
}

export interface GoldenBootStat {
  provider_player_id: number
  player_id: number | null
  team_code: string
  player_name: string
  goals: number
  assists: number
  photo_url: string | null
}

/** Derive official player totals from every normal goal in completed fixtures. */
export function deriveGoldenBootStats({
  fixtures, rosterByCode,
}: {
  fixtures: Array<{ teamCodes: Map<number, string>; events: GoldenBootEvent[] }>
  rosterByCode: Map<string, RosterPlayer[]>
}): GoldenBootStat[] {
  const stats = new Map<number, GoldenBootStat>()

  function add(providerId: number | null, name: string | null, teamCode: string | undefined, kind: 'goal' | 'assist') {
    if (!providerId || !name?.trim() || !teamCode) return
    const rosterPlayer = matchPlayer(name, rosterByCode.get(teamCode) ?? [])
    const current = stats.get(providerId) ?? {
      provider_player_id: providerId, player_id: rosterPlayer?.id ?? null, team_code: teamCode,
      player_name: rosterPlayer?.name ?? name, goals: 0, assists: 0,
      photo_url: `https://cdn.kickoffapi.com/images/players/${providerId}.png`,
    }
    if (!current.player_id && rosterPlayer) { current.player_id = rosterPlayer.id; current.player_name = rosterPlayer.name }
    if (kind === 'goal') current.goals++
    else current.assists++
    stats.set(providerId, current)
  }

  for (const fixture of fixtures) {
    for (const event of fixture.events) {
      if (event.type.toLowerCase() !== 'goal' || event.detail.toLowerCase() === 'own goal') continue
      const code = fixture.teamCodes.get(event.teamId)
      add(event.playerId, event.playerName, code, 'goal')
      add(event.assistId ?? null, event.assistName ?? null, code, 'assist')
    }
  }
  return Array.from(stats.values()).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player_name.localeCompare(b.player_name))
}
