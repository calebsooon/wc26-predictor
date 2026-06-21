export interface LineupPlayerState {
  player_id: number
  is_starting: boolean
  shirt_number: number | null
  position_label: string | null
  grid: string | null
  sort_order: number
  players: { name: string } | null
}

export interface LineupSubstitution {
  id?: string
  team_code: string
  player_out_id: number
  player_in_id: number
  minute: number
  source?: 'kickoff' | 'manual'
  created_at?: string
}

export interface ResolvedLineup {
  current: LineupPlayerState[]
  bench: LineupPlayerState[]
  applied: LineupSubstitution[]
}

/** Apply only safe, sequential substitutions. Incoming players inherit the outgoing pitch slot. */
export function resolveLineupState(rows: LineupPlayerState[], substitutions: LineupSubstitution[], teamCode: string): ResolvedLineup {
  const current = rows.filter((row) => row.is_starting).map((row) => ({ ...row }))
  const bench = rows.filter((row) => !row.is_starting).map((row) => ({ ...row }))
  const applied: LineupSubstitution[] = []
  const ordered = substitutions
    .filter((sub) => sub.team_code === teamCode)
    .sort((a, b) => a.minute - b.minute || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  for (const sub of ordered) {
    const outIndex = current.findIndex((row) => row.player_id === sub.player_out_id)
    const inIndex = bench.findIndex((row) => row.player_id === sub.player_in_id)
    if (outIndex < 0 || inIndex < 0) continue
    const outgoing = current[outIndex]!
    const incoming = bench[inIndex]!
    current[outIndex] = { ...incoming, is_starting: true, grid: outgoing.grid, position_label: outgoing.position_label, sort_order: outgoing.sort_order }
    bench.splice(inIndex, 1)
    applied.push(sub)
  }
  return { current, bench, applied }
}
