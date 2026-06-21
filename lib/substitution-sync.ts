import type { SupabaseClient } from '@supabase/supabase-js'
import { kapi, type KEvent } from '@/lib/kickoff'
import { normaliseProviderMatchEvents, normaliseProviderSubstitutions } from '@/lib/lineup-events'
import { groupPlayersByCode, matchPlayer, type RosterPlayer } from '@/lib/team-match'

type MatchRow = { id: string; home_team: string; away_team: string; provider_fixture_id: number | null }

export async function syncMatchSubstitutions(service: SupabaseClient, matches: MatchRow[]) {
  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data?.length) break
    roster.push(...(data as RosterPlayer[]))
    if (data.length < 1000) break
  }
  const byCode = groupPlayersByCode(roster)
  let written = 0
  let eventWritten = 0
  const errors: string[] = []

  for (const match of matches) {
    if (!match.provider_fixture_id) continue
    try {
      const { response } = await kapi<KEvent>(`/fixtures/${match.provider_fixture_id}/events`)
      const normalized = normaliseProviderSubstitutions(response ?? [])
      const timeline = normaliseProviderMatchEvents(response ?? [])
      const mapped: Array<{ match_id: string; team_code: string; player_out_id: number; player_in_id: number; minute: number; source: 'kickoff' }> = []
      for (const event of normalized) {
        // Resolve the event's team against the provider fixture's lineup rows.
        // Event payloads do not always ship a team name, so determine the code
        // from the player matched in either participating squad.
        const candidates = [match.home_team, match.away_team]
        const code = candidates.find((candidate) => matchPlayer(event.playerInName, byCode.get(candidate) ?? []) && matchPlayer(event.playerOutName, byCode.get(candidate) ?? []))
        if (!code) continue
        const incoming = matchPlayer(event.playerInName, byCode.get(code) ?? [])
        const outgoing = matchPlayer(event.playerOutName, byCode.get(code) ?? [])
        if (!incoming || !outgoing) continue
        mapped.push({ match_id: match.id, team_code: code, player_out_id: outgoing.id, player_in_id: incoming.id, minute: event.minute, source: 'kickoff' })
      }
      const { error: deleteError } = await service.from('lineup_substitutions').delete().eq('match_id', match.id).eq('source', 'kickoff')
      if (deleteError) throw deleteError
      if (mapped.length) {
        const { error: insertError } = await service.from('lineup_substitutions').upsert(mapped, { onConflict: 'match_id,player_out_id,player_in_id,minute' })
        if (insertError) throw insertError
        written += mapped.length
      }

      const mappedEvents: Array<{ match_id: string; team_code: string; minute: number; type: string; detail: string | null; player_id: number | null; assist_id: number | null; provider_key: string; source: 'kickoff' }> = []
      for (const event of timeline) {
        const candidates = [match.home_team, match.away_team]
        const code = candidates.find((candidate) => matchPlayer(event.playerName, byCode.get(candidate) ?? []))
        if (!code) continue
        const player = matchPlayer(event.playerName, byCode.get(code) ?? [])
        const assist = event.assistName ? matchPlayer(event.assistName, byCode.get(code) ?? []) : null
        mappedEvents.push({ match_id: match.id, team_code: code, minute: event.minute, type: event.type, detail: event.detail, player_id: player?.id ?? null, assist_id: assist?.id ?? null, provider_key: event.providerKey, source: 'kickoff' })
      }
      const { error: clearEventsError } = await service.from('match_events').delete().eq('match_id', match.id).eq('source', 'kickoff')
      if (clearEventsError) throw clearEventsError
      if (mappedEvents.length) {
        const { error: eventError } = await service.from('match_events').upsert(mappedEvents, { onConflict: 'match_id,provider_key' })
        if (eventError) throw eventError
        eventWritten += mappedEvents.length
      }
    } catch (error) {
      errors.push(`${match.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  return { written, eventWritten, errors }
}
