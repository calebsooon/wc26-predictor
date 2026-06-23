/**
 * FIFA-based match event extraction (goals and cards).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type FifaEvent, type FifaPlayer, type Tag,
  idTail, number, tagValue,
} from './fifa-client'

type EventRow = {
  match_id: string
  team_code: string
  minute: number
  type: 'goal' | 'yellow_card' | 'red_card'
  detail: string | null
  player_id: number | null
  assist_id: number | null
  provider_key: string
  source: 'fifa'
}

// Parse "43'" or "90'+3'" → integer minute
function parseMinuteStr(s: string | undefined): number | null {
  if (!s) return null
  const m = /(\d+)(?:\+(\d+))?'?/.exec(s.trim())
  if (!m) return null
  const total = parseInt(m[1]) + (m[2] ? parseInt(m[2]) : 0)
  return total >= 1 && total <= 130 ? total : null
}

// Goal entry format: "seq - assist_id - minute' - period_id - period_name - extra"
function goalMinute(entry: string): number | null {
  return parseMinuteStr(entry.split(' - ')[2])
}

// Card entry format: "count - minute' - period_id - period_name - extra"
function cardMinute(entry: string): number | null {
  return parseMinuteStr(entry.split(' - ')[1])
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (v != null && v !== '') return [String(v)]
  return []
}

export function matchEventRows(
  event: FifaEvent,
  matchId: string,
  players: Map<number, FifaPlayer>,
  codeByTeamId: Map<string, string>
): EventRow[] {
  const rows: EventRow[] = []
  const teamParticipants = (event.participants ?? []).filter(
    (p) => p.role === 'Home Team' || p.role === 'Away Team'
  )

  // Collect team→code and team→goals array for OG resolution
  const teamGoalMinutes = new Map<string, number[]>()
  for (const tp of teamParticipants) {
    const code = codeByTeamId.get(idTail(tp._externalTeamId) ?? '')
    if (!code) continue
    const rawGoals = tagValue(tp.tags, ':goals') as number[] | null
    teamGoalMinutes.set(code, Array.isArray(rawGoals) ? rawGoals.map(Math.floor) : [])
  }

  const homeParticipant = teamParticipants.find((p) => p.role === 'Home Team')
  const awayParticipant = teamParticipants.find((p) => p.role === 'Away Team')
  const homeCode = codeByTeamId.get(idTail(homeParticipant?._externalTeamId) ?? '')
  const awayCode = codeByTeamId.get(idTail(awayParticipant?._externalTeamId) ?? '')

  // Track claimed goal minutes per team to detect own goals later
  const claimedGoalMinutes = new Map<string, Set<number>>()
  if (homeCode) claimedGoalMinutes.set(homeCode, new Set())
  if (awayCode) claimedGoalMinutes.set(awayCode, new Set())

  const ownGoalPlayers: Array<{ teamCode: string; playerId: number | null; fifaId: number }> = []

  for (const p of event.participants ?? []) {
    if (p.role !== 'Player' && p.role !== 'Reserve Player') continue
    const tags = p.tags ?? []
    const fifaId = number(p._externalSportsPersonId)
    const teamCode = codeByTeamId.get(idTail(p._externalTeamId) ?? '')
    const dbPlayer = fifaId ? players.get(fifaId) : null
    if (!teamCode) continue

    // Regular goals
    const goalTag = tags.find(
      (t: Tag) => t.name.endsWith(':goals') && !t.name.includes(':stats') && !t.name.includes(':attempt')
    )
    for (const entry of asArray(goalTag?.value)) {
      const min = goalMinute(entry)
      if (min == null) continue
      claimedGoalMinutes.get(teamCode)?.add(min)
      rows.push({
        match_id: matchId, team_code: teamCode, minute: min,
        type: 'goal', detail: null,
        player_id: dbPlayer?.id ?? null, assist_id: null,
        provider_key: `fifa:goal:${min}:${fifaId ?? 'x'}`,
        source: 'fifa',
      })
    }

    // Track OG candidates
    const ownGoalStat = number(tagValue(tags, ':stats:own_goals'))
    if ((ownGoalStat ?? 0) > 0 && fifaId) {
      ownGoalPlayers.push({ teamCode, playerId: dbPlayer?.id ?? null, fifaId })
    }

    // Yellow cards
    for (const entry of asArray(tagValue(tags, ':fdcp:discipline:yellow_card'))) {
      const min = cardMinute(entry)
      if (min == null) continue
      rows.push({
        match_id: matchId, team_code: teamCode, minute: min,
        type: 'yellow_card', detail: null,
        player_id: dbPlayer?.id ?? null, assist_id: null,
        provider_key: `fifa:yc:${min}:${fifaId ?? 'x'}`,
        source: 'fifa',
      })
    }

    // Red cards (direct or second yellow)
    for (const entry of asArray(tagValue(tags, ':fdcp:discipline:red_card'))) {
      const min = cardMinute(entry)
      if (min == null) continue
      rows.push({
        match_id: matchId, team_code: teamCode, minute: min,
        type: 'red_card', detail: null,
        player_id: dbPlayer?.id ?? null, assist_id: null,
        provider_key: `fifa:rc:${min}:${fifaId ?? 'x'}`,
        source: 'fifa',
      })
    }
  }

  // Resolve own goals: unaccounted minutes in a team's goals array belong to the other team
  for (const [code, allMins] of teamGoalMinutes) {
    const claimed = claimedGoalMinutes.get(code) ?? new Set()
    const opposing = code === homeCode ? awayCode : homeCode
    const ogCandidates = ownGoalPlayers.filter((og) => og.teamCode === opposing)
    const unclaimed = allMins.filter((m) => !claimed.has(m))

    unclaimed.forEach((min, i) => {
      const ogPlayer = ogCandidates[i] ?? null
      rows.push({
        match_id: matchId, team_code: code, minute: min,
        type: 'goal', detail: 'own_goal',
        player_id: ogPlayer?.playerId ?? null, assist_id: null,
        provider_key: `fifa:og:${min}:${ogPlayer?.fifaId ?? i}`,
        source: 'fifa',
      })
    })
  }

  return rows
}

export async function writeMatchEvents(
  service: SupabaseClient,
  matchId: string,
  rows: EventRow[]
): Promise<number> {
  await service.from('match_events').delete().eq('match_id', matchId).eq('source', 'fifa')
  if (!rows.length) return 0
  const { error } = await service
    .from('match_events')
    .upsert(rows, { onConflict: 'match_id,provider_key' })
  if (error) throw error
  return rows.length
}
