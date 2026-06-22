import { describe, expect, it } from 'vitest'
import { resolvePitchLayout } from './lineup-layout'

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
