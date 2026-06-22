import { describe, expect, it } from 'vitest'
import { validateLineup } from './lineup-validation'

const player = (id: number, position_label: string | null) => ({ player_id: id, position_label })

describe('validateLineup', () => {
  it('flags structural issues without preventing a reviewable sheet', () => {
    const warnings = validateLineup([player(1, 'CB'), player(2, null)], '4-3-3')
    expect(warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['starter_count', 'goalkeeper_count', 'missing_positions']))
  })

  it('accepts a normal complete XI without structural errors', () => {
    const positions = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW']
    const warnings = validateLineup(positions.map((position, index) => player(index + 1, position)), '4-3-3')
    expect(warnings.filter((warning) => warning.level === 'error')).toEqual([])
  })

  it('warns when a five-back declaration has too few defensive labels', () => {
    const positions = ['GK', 'CB', 'CB', 'CB', 'CM', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW']
    const warnings = validateLineup(positions.map((position, index) => player(index + 1, position)), '5-3-2')
    expect(warnings.some((warning) => warning.code === 'defensive_shape')).toBe(true)
  })
})
