/**
 * Deterministic pitch layout for provider and admin lineups.
 *
 * FIFA GameDay publishes a formation and position codes, but not individual
 * x/y coordinates. Admin grid values are therefore authoritative when they
 * exist; every other player is placed from a formation-aware fallback.
 */
export interface PitchLayoutPlayer {
  player_id: number
  position_label: string | null
  grid: string | null
  sort_order: number
}

export interface PitchPosition<T extends PitchLayoutPlayer> {
  player: T
  x: number
  y: number
  row: number
  lane: number
  inferred: boolean
}

type Slot<T extends PitchLayoutPlayer> = { player: T; row: number; lane: number; inferred: boolean }

const LEFT_WIDE = new Set(['LB', 'LWB', 'LM', 'LW', 'LWF', 'AML', 'WBL'])
const RIGHT_WIDE = new Set(['RB', 'RWB', 'RM', 'RW', 'RWF', 'AMR', 'WBR'])
const LEFT_CENTRAL = new Set(['LCB', 'LCM', 'LCDM', 'LDM', 'DML', 'ML', 'STL', 'CFL', 'IFL'])
const RIGHT_CENTRAL = new Set(['RCB', 'RCM', 'RCDM', 'RDM', 'DMR', 'MR', 'STR', 'CFR', 'IFR'])

function normalisePosition(label: string | null) {
  return (label ?? '').toUpperCase().trim().replace(/[\s_-]/g, '')
}

function parseGrid(grid: string | null) {
  const matched = grid?.match(/^(\d+):(\d+)$/)
  if (!matched) return null
  const row = Number(matched[1]), lane = Number(matched[2])
  if (!Number.isInteger(row) || !Number.isInteger(lane) || row < 0 || row > 8 || lane < 1 || lane > 5) return null
  return { row, lane }
}

function formationLines(formation: string | null | undefined) {
  const lines = (formation?.match(/\d+/g) ?? []).map(Number).filter((line) => line >= 1 && line <= 5)
  return lines.length >= 1 && lines.reduce((sum, line) => sum + line, 0) === 10 ? lines : null
}

function genericBand(position: string) {
  if (['GK', 'G', 'GKP'].includes(position)) return 0
  if (position === 'DM' || position === 'CDM' || position.startsWith('DM')) return 2
  if (position === 'CAM' || position === 'AM' || position.startsWith('AM') || position.startsWith('W') || position === 'SS') return 4
  if (['ST', 'CF', 'F', 'FW', 'FC'].includes(position) || position.startsWith('ST') || position.startsWith('CF') || position.startsWith('FW')) return 5
  if (position.startsWith('D') || ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DF', 'SW'].includes(position)) return 1
  return 3
}

function inferredRow(position: string, formation: number[] | null) {
  const band = genericBand(position)
  if (!formation) return band
  const outfieldRows = formation.length
  if (band === 0) return 0
  if (band === 1) return 1
  if (outfieldRows === 1) return 1
  if (outfieldRows === 2) return 2
  if (outfieldRows === 3) return band >= 4 || band === 5 ? 3 : 2
  // 4-2-3-1, 3-4-2-1 and similar: holding mids, creators, then forwards.
  if (band === 2 || band === 3) return 2
  if (band === 4) return outfieldRows - 1
  return outfieldRows
}

function inferredLane(position: string) {
  if (['GK', 'G', 'GKP'].includes(position)) return 3
  if (LEFT_WIDE.has(position) || position.endsWith('L') && !position.startsWith('C')) return 1
  if (RIGHT_WIDE.has(position) || position.endsWith('R') && !position.startsWith('C')) return 5
  if (LEFT_CENTRAL.has(position)) return 2
  if (RIGHT_CENTRAL.has(position)) return 4
  return 3
}

const laneX = (lane: number) => 15 + (lane - 1) * 17.5
const collisionOffsets: Record<number, number[]> = {
  1: [0],
  2: [-8, 8],
  3: [-12, 0, 12],
  4: [-15, -5, 5, 15],
  5: [-18, -9, 0, 9, 18],
}

/**
 * Resolve positions in one shared place so the match pitch and admin preview
 * cannot disagree. Multiple players in the same lane fan out symmetrically;
 * this makes generic CB/CM/ST codes useful without manual placement.
 */
export function resolvePitchLayout<T extends PitchLayoutPlayer>(rows: T[], home: boolean, formation?: string | null): PitchPosition<T>[] {
  const lines = formationLines(formation)
  const slots: Slot<T>[] = rows.map((player) => {
    const explicit = parseGrid(player.grid)
    if (explicit) return { player, ...explicit, inferred: false }
    const position = normalisePosition(player.position_label)
    return { player, row: inferredRow(position, lines), lane: inferredLane(position), inferred: true }
  })
  const rowKeys = Array.from(new Set(slots.map((slot) => slot.row))).sort((a, b) => a - b)
  const lastRow = rowKeys.length - 1
  const yForRow = (row: number) => {
    const index = rowKeys.indexOf(row)
    const progress = lastRow > 0 ? index / lastRow : 0.5
    // Keep a generous centre-circle buffer. Player photos and nameplates have
    // visual height, so a nominal 50% line still looks like it crosses halves.
    return home ? 85 - progress * 25 : 15 + progress * 25
  }
  const groups = new Map<string, Slot<T>[]>()
  for (const slot of slots) {
    const key = `${slot.row}:${slot.lane}`
    groups.set(key, [...(groups.get(key) ?? []), slot])
  }
  const layout = new Map<number, PitchPosition<T>>()
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.player.sort_order - b.player.sort_order || a.player.player_id - b.player.player_id)
    const offsets = collisionOffsets[Math.min(ordered.length, 5)] ?? ordered.map((_, index) => (index - (ordered.length - 1) / 2) * 8)
    ordered.forEach((slot, index) => {
      layout.set(slot.player.player_id, {
        player: slot.player,
        x: Math.max(8, Math.min(92, laneX(slot.lane) + (offsets[index] ?? 0))),
        y: yForRow(slot.row),
        row: slot.row,
        lane: slot.lane,
        inferred: slot.inferred,
      })
    })
  }
  const result = slots.map((slot) => layout.get(slot.player.player_id)!).filter(Boolean)

  // Provider lineups commonly provide only broad codes (for example CB/CM).
  // If no admin coordinate anchors a line, preserve left-to-right position
  // order but lay the whole unit out evenly. This avoids a lopsided cluster
  // when a provider only labels one side of an otherwise normal formation.
  const byRow = new Map<number, PitchPosition<T>[]>()
  for (const position of result) byRow.set(position.row, [...(byRow.get(position.row) ?? []), position])
  for (const line of byRow.values()) {
    if (!line.every((position) => position.inferred)) continue
    const ordered = [...line].sort((a, b) => a.lane - b.lane || a.player.sort_order - b.player.sort_order || a.player.player_id - b.player.player_id)
    const edge = ordered.length <= 1 ? 50 : ordered.length === 2 ? 33 : ordered.length === 3 ? 21 : ordered.length === 4 ? 16 : 12
    ordered.forEach((position, index) => {
      position.x = ordered.length <= 1 ? 50 : edge + (index / (ordered.length - 1)) * (100 - edge * 2)
    })
  }
  return result
}
