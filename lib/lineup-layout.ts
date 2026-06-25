/**
 * Deterministic pitch layout for provider and admin lineups.
 *
 * FIFA GameDay publishes a formation and position codes, but not individual
 * x/y coordinates. A complete formation is therefore the default layout
 * engine; admin grid values are an explicit override when a team sheet needs
 * precise manual placement.
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
const POSITION_ALIASES: Record<string, string> = {
  GOALKEEPER: 'GK', KEEPER: 'GK',
  CENTREBACK: 'CB', CENTERBACK: 'CB', LEFTCENTREBACK: 'LCB', LEFTCENTERBACK: 'LCB', RIGHTCENTREBACK: 'RCB', RIGHTCENTERBACK: 'RCB',
  LEFTBACK: 'LB', RIGHTBACK: 'RB', LEFTWINGBACK: 'LWB', RIGHTWINGBACK: 'RWB',
  DEFENSIVEMIDFIELDER: 'DM', HOLDINGMIDFIELDER: 'DM', CENTRALMIDFIELDER: 'CM', CENTREMIDFIELDER: 'CM',
  LEFTMIDFIELDER: 'LM', RIGHTMIDFIELDER: 'RM', ATTACKINGMIDFIELDER: 'AM',
  LEFTWINGER: 'LW', RIGHTWINGER: 'RW', LEFTFORWARD: 'LW', RIGHTFORWARD: 'RW',
  CENTREFORWARD: 'CF', CENTERFORWARD: 'CF', STRIKER: 'ST', SECONDSTRIKER: 'SS',
}

function normalisePosition(label: string | null) {
  const normalised = (label ?? '').toUpperCase().trim().replace(/[\s_-]/g, '')
  return POSITION_ALIASES[normalised] ?? normalised
}

function parseGrid(grid: string | null) {
  const matched = grid?.match(/^(\d+):(\d+)$/)
  if (!matched) return null
  const row = Number(matched[1]), lane = Number(matched[2])
  if (!Number.isInteger(row) || !Number.isInteger(lane) || row < 0 || row > 8 || lane < 1 || lane > 5) return null
  return { row, lane }
}

export function parseFormation(formation: string | null | undefined) {
  const lines = (formation?.match(/\d+/g) ?? []).map(Number).filter((line) => line >= 1 && line <= 5)
  const total = lines.reduce((sum, line) => sum + line, 0)
  if (lines.length >= 2 && total === 10) return lines
  // A few feeds abbreviate a lone striker as "4-3-2" rather than the more
  // complete 4-3-2-1. Treat that narrow, unambiguous nine-outfielder shape as
  // a trailing striker instead of abandoning formation-first placement.
  if (lines.length >= 3 && total === 9) return [...lines, 1]
  return null
}

function genericBand(position: string) {
  if (['GK', 'G', 'GKP'].includes(position)) return 0
  if (position.includes('DM')) return 2
  // Provider codes are not perfectly uniform: both LCB/RCB and CBL/CBR are
  // common. Classification must happen before the generic CM fallback or a
  // back three/five gets pushed into midfield.
  if (position.startsWith('D') || position.includes('CB') || position.includes('WB') || ['LB', 'RB', 'DF', 'SW'].includes(position)) return 1
  if (position === 'CAM' || position === 'AM' || position.includes('AM') || position.startsWith('W') || position === 'SS') return 4
  if (['ST', 'CF', 'F', 'FW', 'FC'].includes(position) || position.startsWith('ST') || position.startsWith('CF') || position.startsWith('FW') || position.includes('ST')) return 5
  return 3
}

export function positionBand(label: string | null) {
  return genericBand(normalisePosition(label))
}

function isWideDefender(position: string) {
  return position.includes('WB') || ['LB', 'RB', 'LFB', 'RFB'].includes(position)
}

function inferredRow(position: string, formation: number[] | null) {
  const band = genericBand(position)
  if (!formation) return band
  const outfieldRows = formation.length
  if (band === 0) return 0
  // In back-three formations, wide defenders are usually wing-backs on the
  // next line. Five-/four-back shapes retain them in the defensive unit.
  if (band === 1) return isWideDefender(position) && formation[0] <= 3 && outfieldRows >= 3 ? 2 : 1
  if (outfieldRows === 1) return 1
  if (outfieldRows === 2) return 2
  if (outfieldRows === 3) return band >= 4 || band === 5 ? 3 : 2
  // 4-2-3-1, 3-4-2-1 and similar: holding mids, creators, then forwards.
  if (band === 2) return 2
  if (band === 3) {
    const singlePivot = formation[1] === 1
    const wideMid = ['LM', 'RM', 'ML', 'MR'].includes(position)
    // In a 4-1-4-1 / 3-1-4-2 the lone pivot owns row two, so ordinary
    // midfielders belong on the next line. In a 4-2-3-1, wide midfield codes
    // are more often the two outside creators than part of the double pivot.
    if (singlePivot || (wideMid && formation[1] <= 2 && formation[2] >= 2)) return 3
    return 2
  }
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

const laneX = (lane: number) => 20 + (lane - 1) * 15
const collisionOffsets: Record<number, number[]> = {
  1: [0],
  2: [-8, 8],
  3: [-12, 0, 12],
  4: [-15, -5, 5, 15],
  5: [-18, -9, 0, 9, 18],
}

function bestFormationRows<T extends PitchLayoutPlayer>(slots: Slot<T>[], formation: number[]) {
  const goalkeeper = slots.filter((slot) => genericBand(normalisePosition(slot.player.position_label)) === 0)
  const outfield = slots.filter((slot) => genericBand(normalisePosition(slot.player.position_label)) !== 0)
  const targetRows = formation.flatMap((count, index) => Array.from({ length: count }, () => index + 1))
  // Only force a full template when it is a complete, recognisable XI. Partial
  // provider sheets are better served by the tolerant row fallback below.
  if (goalkeeper.length !== 1 || outfield.length !== targetRows.length) return null

  const cost = (slot: Slot<T>, targetRow: number) => {
    const position = normalisePosition(slot.player.position_label)
    const preferred = inferredRow(position, formation)
    const band = genericBand(position)
    let value = Math.abs(targetRow - preferred) * 20
    // A named centre-back should never displace a wing-back just because the
    // feed happened to order the sheet differently.
    if (position.includes('CB') && targetRow !== 1) value += 45
    if (band === 5 && targetRow !== formation.length) value += 30
    if (band === 2 && targetRow > 2) value += 14
    return value
  }

  type Result = { cost: number; rows: number[] }
  const memo = new Map<string, Result>()
  const solve = (playerIndex: number, used: number): Result => {
    if (playerIndex === outfield.length) return { cost: 0, rows: [] }
    const key = `${playerIndex}:${used}`
    const cached = memo.get(key)
    if (cached) return cached
    let best: Result | null = null
    for (let slotIndex = 0; slotIndex < targetRows.length; slotIndex += 1) {
      if (used & (1 << slotIndex)) continue
      const rest = solve(playerIndex + 1, used | (1 << slotIndex))
      const candidate = { cost: cost(outfield[playerIndex]!, targetRows[slotIndex]!) + rest.cost, rows: [targetRows[slotIndex]!, ...rest.rows] }
      if (!best || candidate.cost < best.cost) best = candidate
    }
    const result = best!
    memo.set(key, result)
    return result
  }

  const chosen = solve(0, 0)
  const rows = new Map<number, number>()
  goalkeeper.forEach((slot) => rows.set(slot.player.player_id, 0))
  outfield.forEach((slot, index) => rows.set(slot.player.player_id, chosen.rows[index]!))
  return rows
}

/**
 * Resolve positions in one shared place so the match pitch and admin preview
 * cannot disagree. Multiple players in the same lane fan out symmetrically;
 * this makes generic CB/CM/ST codes useful without manual placement.
 */
export function resolvePitchLayout<T extends PitchLayoutPlayer>(rows: T[], home: boolean, formation?: string | null): PitchPosition<T>[] {
  const lines = parseFormation(formation)
  const slots: Slot<T>[] = rows.map((player) => {
    const explicit = parseGrid(player.grid)
    if (explicit) return { player, ...explicit, inferred: false }
    const position = normalisePosition(player.position_label)
    return { player, row: inferredRow(position, lines), lane: inferredLane(position), inferred: true }
  })
  // Formation-first means an incomplete provider team sheet still occupies
  // its real tactical rows. For example, the forward in a 4-2-3-1 stays on
  // row four even if midfield players have not been identified yet. Once an
  // admin supplies a grid anchor, preserve the hand-tuned grid instead.
  const formationFirst = Boolean(lines) && slots.every((slot) => slot.inferred)
  if (formationFirst && lines) {
    const assigned = bestFormationRows(slots, lines)
    if (assigned) {
      for (const slot of slots) slot.row = assigned.get(slot.player.player_id) ?? slot.row
    }
  }
  const rowKeys = Array.from(new Set(slots.map((slot) => slot.row))).sort((a, b) => a - b)
  const lastRow = rowKeys.length - 1
  const yForRow = (row: number) => {
    if (formationFirst && lines) {
      const progress = Math.max(0, Math.min(lines.length, row)) / lines.length
      // Keeper stays inside its box (nameplate must not clip the goal line) and
      // the front line stops well short of halfway so its nameplate never spills
      // across the centre line into the other team's half.
      return home ? 87 - progress * 30 : 13 + progress * 30
    }
    const index = rowKeys.indexOf(row)
    const progress = lastRow > 0 ? index / lastRow : 0.5
    // Same half-fill for partial provider sheets without a parseable formation.
    return home ? 86 - progress * 28 : 14 + progress * 28
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
    // Larger edge inset keeps the wide players off the touchline so the whole
    // line reads as centred rather than stretched corner-to-corner.
    const edge = ordered.length <= 1 ? 50 : ordered.length === 2 ? 36 : ordered.length === 3 ? 26 : ordered.length === 4 ? 20 : 16
    ordered.forEach((position, index) => {
      position.x = ordered.length <= 1 ? 50 : edge + (index / (ordered.length - 1)) * (100 - edge * 2)
    })
  }

  // GKs must always be centred regardless of how their lane was derived.
  for (const pos of result) {
    if (genericBand(normalisePosition(pos.player.position_label)) === 0) pos.x = 50
  }

  return result
}
