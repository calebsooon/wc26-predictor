import type { KEvent } from '@/lib/kickoff'

export interface ProviderSubstitution {
  teamId: number
  playerInName: string
  playerOutName: string
  minute: number
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
