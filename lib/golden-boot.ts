import { matchPlayer, type RosterPlayer } from '@/lib/team-match'

export interface FifaStoryTag {
  name: string
  value: unknown
}

export interface FifaGoldenBootActor {
  number: number
  name: { eng?: string }
  key: { _externalSportsPersonId?: string }
  tags: FifaStoryTag[]
}

export interface FifaGoldenBootRow {
  provider_player_id: number
  player_id: number | null
  team_code: string
  player_name: string
  goals: number
  assists: number
  minutes_played: number
  fifa_rank: number | null
  fifa_assist_rank: number | null
  fifa_assist_order: number | null
  photo_url: string | null
  source: 'fifa'
}

const FIFA_TAGS = {
  assists: 'urn:gd:tag:football:stats:assists',
  goals: 'urn:gd:tag:football:stats:goals',
  minutes: 'urn:gd:tag:football:stats:total_competition_minutes_played',
  photo: 'urn:gd:tag:story:staff:image',
  teamCode: 'urn:gd:tag:story:team:abbreviation',
} as const

function tagValue(tags: FifaStoryTag[], name: string) {
  return tags.find((tag) => tag.name === name)?.value
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * Normalise FIFA's published Golden Boot table. The rank belongs to FIFA's
 * table rather than a local sort, so its official tie breakers are preserved.
 */
export function normaliseFifaGoldenBootActors(
  actors: FifaGoldenBootActor[],
  rosterByCode: Map<string, RosterPlayer[]>,
  rankedBy: 'goals' | 'assists',
): FifaGoldenBootRow[] {
  const rows: FifaGoldenBootRow[] = actors.flatMap((actor) => {
    const providerId = Number(actor.key._externalSportsPersonId)
    const name = actor.name.eng?.trim()
    const teamCode = String(tagValue(actor.tags, FIFA_TAGS.teamCode) ?? '').trim().toUpperCase()
    if (!Number.isSafeInteger(providerId) || !name || !teamCode) return []

    const rosterPlayer = matchPlayer(name, rosterByCode.get(teamCode) ?? [])
    return [{
      provider_player_id: providerId,
      player_id: rosterPlayer?.id ?? null,
      team_code: teamCode,
      player_name: rosterPlayer?.name ?? name,
      goals: numberValue(tagValue(actor.tags, FIFA_TAGS.goals)),
      assists: numberValue(tagValue(actor.tags, FIFA_TAGS.assists)),
      minutes_played: numberValue(tagValue(actor.tags, FIFA_TAGS.minutes)),
      fifa_rank: rankedBy === 'goals' ? actor.number : null,
      // FIFA's actor.number remains the Golden Boot rank even in its assists
      // table. Assist rank is therefore the published row order below.
      fifa_assist_rank: null,
      fifa_assist_order: null,
      photo_url: typeof tagValue(actor.tags, FIFA_TAGS.photo) === 'string' ? String(tagValue(actor.tags, FIFA_TAGS.photo)) : null,
      source: 'fifa',
    }]
  })
  if (rankedBy !== 'assists') return rows
  const firstPositionByAssists = new Map<number, number>()
  rows.forEach((row, index) => {
    if (!firstPositionByAssists.has(row.assists)) firstPositionByAssists.set(row.assists, index + 1)
  })
  return rows.map((row, index) => ({
    ...row,
    fifa_assist_rank: firstPositionByAssists.get(row.assists) ?? index + 1,
    fifa_assist_order: index + 1,
  }))
}
