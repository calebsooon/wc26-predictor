import { describe, expect, it } from 'vitest'
import { positionBand, resolvePitchLayout } from './lineup-layout'

const player = (id: number, position_label: string | null, grid: string | null, sort_order = id) => ({ player_id: id, position_label, grid, sort_order })

describe('resolvePitchLayout', () => {
  it('uses an admin grid lane as the real horizontal pitch coordinate', () => {
    const [left, centre, right] = resolvePitchLayout([
      player(1, 'LB', '1:1'), player(2, 'CB', '1:3'), player(3, 'RB', '1:5'),
    ], true, '4-3-3')
    expect(left.x).toBeLessThan(centre.x)
    expect(centre.x).toBeLessThan(right.x)
    expect(left.row).toBe(1)
  })

  it('infers sensible formation rows and wings from FIFA position codes', () => {
    const layout = resolvePitchLayout([
      player(1, 'GK', null), player(2, 'LB', null), player(3, 'CB', null), player(4, 'RB', null),
      player(5, 'CDM', null), player(6, 'CAM', null), player(7, 'LW', null), player(8, 'RW', null), player(9, 'ST', null),
    ], true, '4-2-3-1')
    const byId = new Map(layout.map((slot) => [slot.player.player_id, slot]))
    expect(byId.get(1)?.row).toBe(0)
    expect(byId.get(2)?.x).toBeLessThan(byId.get(4)?.x ?? 0)
    expect(byId.get(5)?.row).toBe(2)
    expect(byId.get(6)?.row).toBe(3)
    expect(byId.get(7)?.x).toBeLessThan(byId.get(8)?.x ?? 0)
    expect(byId.get(9)?.row).toBe(4)
  })

  it('fans duplicate generic central positions across the same line', () => {
    const layout = resolvePitchLayout([player(1, 'CB', null), player(2, 'CB', null), player(3, 'CB', null)], false, '5-4-1')
    expect(layout.map((slot) => slot.x)).toEqual([...layout.map((slot) => slot.x)].sort((a, b) => a - b))
    expect(new Set(layout.map((slot) => slot.x)).size).toBe(3)
  })

  it('keeps the home and away shapes in opposite halves', () => {
    const home = resolvePitchLayout([player(1, 'GK', null), player(2, 'ST', null)], true, '4-3-3')
    const away = resolvePitchLayout([player(1, 'GK', null), player(2, 'ST', null)], false, '4-3-3')
    expect(home[0]!.y).toBeGreaterThan(home[1]!.y)
    expect(away[0]!.y).toBeLessThan(away[1]!.y)
    expect(Math.max(...away.map((slot) => slot.y))).toBeLessThan(50)
    expect(Math.min(...home.map((slot) => slot.y))).toBeGreaterThan(50)
  })

  it('keeps incomplete provider data on its formation rows instead of compressing the shape', () => {
    const layout = resolvePitchLayout([player(1, 'GK', null), player(2, 'ST', null)], true, '4-2-3-1')
    const byId = new Map(layout.map((slot) => [slot.player.player_id, slot]))
    // A 4-2-3-1 has four outfield rows. The striker belongs on the last one,
    // even though the other provider rows are missing from this partial XI.
    expect(byId.get(2)?.row).toBe(4)
    expect(byId.get(2)?.y).toBe(58)
    expect(byId.get(1)?.y).toBe(88)
  })

  it('understands three-at-the-back, five-at-the-back, pivots, and compact formation variants', () => {
    const cases = [
      {
        formation: '5-3-2',
        positions: ['LWB', 'LCB', 'CB', 'RCB', 'RWB', 'LCM', 'CM', 'RCM', 'ST', 'ST'],
        rows:      [1,     1,     1,    1,     1,     2,     2,    2,     3,    3],
      },
      {
        formation: '3-4-2-1',
        positions: ['LCB', 'CB', 'RCB', 'LM', 'LCM', 'RCM', 'RM', 'LAM', 'RAM', 'ST'],
        rows:      [1,     1,    1,     2,    2,     2,     2,    3,     3,     4],
      },
      {
        formation: '4-1-4-1',
        positions: ['LB', 'LCB', 'RCB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
        rows:      [1,    1,     1,     1,    2,     3,    3,    3,    3,    4],
      },
      {
        // A common abbreviated feed value; the engine supplies its lone ST.
        formation: '4-3-2',
        positions: ['LB', 'LCB', 'RCB', 'RB', 'CM', 'CM', 'CM', 'LAM', 'RAM', 'ST'],
        rows:      [1,    1,     1,     1,    2,    2,    2,    3,     3,     4],
      },
    ] as const

    for (const scenario of cases) {
      const layout = resolvePitchLayout(scenario.positions.map((position, index) => player(index + 1, position, null)), true, scenario.formation)
      expect(layout.map((slot) => slot.row), scenario.formation).toEqual(scenario.rows)
      for (const slot of layout) expect(slot.y).toBeGreaterThan(50)
    }
  })

  it('uses the declared formation capacity to move wing-backs into midfield for a back three', () => {
    const positions = ['GK', 'LCB', 'CB', 'RCB', 'LWB', 'LCM', 'RCM', 'RWB', 'LW', 'ST', 'RW']
    const layout = resolvePitchLayout(positions.map((position, index) => player(index + 1, position, null)), true, '3-4-3')
    expect(layout.map((slot) => slot.row)).toEqual([0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3])
    const wingBacks = layout.filter((slot) => ['LWB', 'RWB'].includes(slot.player.position_label ?? ''))
    expect(wingBacks.every((slot) => slot.row === 2)).toBe(true)
  })

  it('normalises verbose provider position aliases before resolving the shape', () => {
    expect(positionBand('Left Centre Back')).toBe(1)
    expect(positionBand('Right Wing-Back')).toBe(1)
    expect(positionBand('Defensive Midfielder')).toBe(2)
    expect(positionBand('Attacking Midfielder')).toBe(4)
    expect(positionBand('Centre Forward')).toBe(5)
  })

  it('centres and evenly spaces an unanchored inferred line while preserving manual anchors', () => {
    const inferred = resolvePitchLayout([player(1, 'RB', null), player(2, 'CB', null), player(3, 'CB', null), player(4, 'LB', null)], true, '4-3-3')
    expect(Math.round(inferred.reduce((sum, slot) => sum + slot.x, 0) / inferred.length)).toBe(50)
    const ordered = [...inferred].sort((a, b) => a.x - b.x)
    const gaps = ordered.slice(1).map((slot, index) => Math.round(slot.x - ordered[index]!.x))
    expect(new Set(gaps).size).toBe(1)
    const anchored = resolvePitchLayout([player(1, 'RB', '1:5'), player(2, 'CB', '1:3')], true, '4-3-3')
    expect(Math.round(anchored.reduce((sum, slot) => sum + slot.x, 0) / anchored.length)).not.toBe(50)
  })
})
