import { parseFormation, positionBand } from '@/lib/lineup-layout'

export type LineupWarning = {
  code: 'starter_count' | 'goalkeeper_count' | 'missing_positions' | 'defensive_shape' | 'attacking_shape'
  level: 'error' | 'warning'
  message: string
}

export type LineupCandidate = {
  player_id: number
  position_label: string | null
}

/**
 * Conservative editor-time checks. These flag impossible or suspicious sheets
 * without blocking a legitimate unusual tactic or an incomplete provider feed.
 */
export function validateLineup(starters: LineupCandidate[], formation: string | null | undefined): LineupWarning[] {
  const warnings: LineupWarning[] = []
  if (starters.length !== 11) {
    warnings.push({
      code: 'starter_count', level: 'error',
      message: `An announced XI should have 11 starters (currently ${starters.length}).`,
    })
  }

  const goalkeeperCount = starters.filter((player) => positionBand(player.position_label) === 0).length
  if (goalkeeperCount !== 1) {
    warnings.push({
      code: 'goalkeeper_count', level: 'error',
      message: goalkeeperCount === 0 ? 'No goalkeeper is selected.' : `${goalkeeperCount} goalkeepers are selected; an XI normally has one.`,
    })
  }

  const missingPositions = starters.filter((player) => !player.position_label?.trim()).length
  if (missingPositions) {
    warnings.push({
      code: 'missing_positions', level: 'warning',
      message: `${missingPositions} starter${missingPositions === 1 ? '' : 's'} ${missingPositions === 1 ? 'has' : 'have'} no position label, so formation placement may be approximate.`,
    })
  }

  const lines = parseFormation(formation)
  if (!lines || starters.length !== 11) return warnings
  const defenders = starters.filter((player) => positionBand(player.position_label) === 1).length
  const attackers = starters.filter((player) => positionBand(player.position_label) >= 4).length
  const expectedBackLine = lines[0]!
  const expectedFrontLine = lines.at(-1)!

  if (expectedBackLine >= 5 && defenders < 5) {
    warnings.push({
      code: 'defensive_shape', level: 'warning',
      message: `${formation} expects a five-player back line, but only ${defenders} defender/wing-back labels are selected.`,
    })
  }
  if (expectedBackLine === 3 && defenders < 3) {
    warnings.push({
      code: 'defensive_shape', level: 'warning',
      message: `${formation} expects a back three, but only ${defenders} defender labels are selected.`,
    })
  }
  if (expectedFrontLine >= 2 && attackers < expectedFrontLine) {
    warnings.push({
      code: 'attacking_shape', level: 'warning',
      message: `${formation} expects ${expectedFrontLine} advanced players, but only ${attackers} attacking position labels are selected.`,
    })
  }
  return warnings
}
