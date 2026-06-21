import type { KEvent } from '@/lib/kickoff'

export interface ProviderSubstitution {
  teamId: number
  playerInName: string
  playerOutName: string
  minute: number
}

export interface ProviderMatchEvent {
  teamId: number
  playerName: string
  assistName: string | null
  minute: number
  type: 'goal' | 'yellow_card' | 'red_card'
  detail: string | null
  providerKey: string
}

/**
 * Kickoffapi follows the usual football event shape for substitutions: `player`
 * is the incoming player and `assist` is the outgoing player. The flat fields
 * are accepted too, which keeps recorded payloads and provider revisions safe.
 */
export function normaliseProviderSubstitutions(events: KEvent[]): ProviderSubstitution[] {
  return events
    .filter((event) => event.type.toLowerCase() === 'subst')
    .map((event) => ({
      teamId: event.teamId,
      playerInName: event.player?.name ?? event.playerName ?? '',
      playerOutName: event.assist?.name ?? event.assistName ?? '',
      minute: Number(event.time),
    }))
    .filter((event) => event.teamId != null && event.playerInName.trim() && event.playerOutName.trim() && Number.isInteger(event.minute) && event.minute > 0)
    .sort((a, b) => a.minute - b.minute)
}

/** Keep the compact events which belong in a broadcast-style match timeline. */
export function normaliseProviderMatchEvents(events: KEvent[]): ProviderMatchEvent[] {
  return events.flatMap((event) => {
    const rawType = event.type.toLowerCase()
    const detail = event.detail?.trim() || null
    const card = rawType === 'card' ? detail?.toLowerCase() ?? '' : ''
    const type: ProviderMatchEvent['type'] | null = rawType === 'goal'
      ? 'goal'
      : card.includes('red') ? 'red_card'
        : card.includes('yellow') ? 'yellow_card'
          : null
    const playerName = event.player?.name ?? event.playerName ?? ''
    const minute = Number(event.time)
    if (!type || event.teamId == null || !playerName.trim() || !Number.isInteger(minute) || minute <= 0) return []
    const assistName = event.assist?.name ?? event.assistName ?? null
    return [{
      teamId: event.teamId,
      playerName: playerName.trim(),
      assistName: assistName?.trim() || null,
      minute,
      type,
      detail,
      providerKey: `${type}:${event.teamId}:${minute}:${event.playerId ?? playerName.trim().toLowerCase()}`,
    }]
  }).sort((a, b) => a.minute - b.minute)
}
