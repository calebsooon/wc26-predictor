import type { SupabaseClient } from '@supabase/supabase-js'
import { nameKey } from '@/lib/normalize'

type PlayerIdentity = {
  id: number
  name: string | null
  team_name: string | null
  team_code: string | null
}

function playerGroupKey(player: PlayerIdentity) {
  const name = player.name ? nameKey(player.name) : ''
  const team = (player.team_name || player.team_code || '').trim().toLowerCase()
  return name && team ? `${team}:${name}` : null
}

export function equivalentPlayerIds(rows: PlayerIdentity[]): Map<number, number[]> {
  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const key = playerGroupKey(row)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), row.id])
  }

  const out = new Map<number, number[]>()
  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    for (const id of ids) out.set(id, ids)
  }
  return out
}

export async function equivalentPlayerIdsForScoring(
  supabase: SupabaseClient,
  ids: Array<number | null | undefined>,
): Promise<Map<number, number[]>> {
  const wanted = Array.from(new Set(ids.filter((id): id is number => typeof id === 'number' && id > 0)))
  if (!wanted.length) return new Map()

  const { data: seedRows, error: seedError } = await supabase
    .from('players')
    .select('id, name, team_name, team_code')
    .in('id', wanted)
  if (seedError) throw new Error(seedError.message)
  if (!seedRows?.length) return new Map()

  const names = Array.from(new Set((seedRows as PlayerIdentity[]).flatMap((row) => row.name ? [row.name] : [])))
  const teams = Array.from(new Set((seedRows as PlayerIdentity[]).flatMap((row) => row.team_name ? [row.team_name] : [])))
  if (!names.length || !teams.length) return new Map()

  const { data: allRows, error } = await supabase
    .from('players')
    .select('id, name, team_name, team_code')
    .in('name', names)
    .in('team_name', teams)
  if (error) throw new Error(error.message)

  return equivalentPlayerIds((allRows ?? []) as PlayerIdentity[])
}
