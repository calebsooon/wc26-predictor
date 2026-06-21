import { describe, expect, it } from 'vitest'
import { resolveLineupState, type LineupPlayerState } from './lineup-state'

const player = (id: number, starting: boolean): LineupPlayerState => ({ player_id: id, is_starting: starting, shirt_number: id, position_label: id === 1 ? 'GK' : 'ST', grid: id === 1 ? '1:1' : '4:1', sort_order: id, players: { name: `Player ${id}` } })

describe('resolveLineupState', () => {
  const rows = [player(1, true), player(2, true), player(3, false), player(4, false)]

  it('replaces the outgoing player in their pitch slot and removes the used sub', () => {
    const result = resolveLineupState(rows, [{ team_code: 'AAA', player_out_id: 2, player_in_id: 3, minute: 60 }], 'AAA')
    expect(result.current.map((p) => p.player_id)).toEqual([1, 3])
    expect(result.current.find((p) => p.player_id === 3)?.grid).toBe('4:1')
    expect(result.bench.map((p) => p.player_id)).toEqual([4])
  })

  it('supports chained changes and ignores invalid events', () => {
    const result = resolveLineupState(rows, [
      { team_code: 'AAA', player_out_id: 2, player_in_id: 3, minute: 60 },
      { team_code: 'AAA', player_out_id: 3, player_in_id: 4, minute: 75 },
      { team_code: 'BBB', player_out_id: 1, player_in_id: 4, minute: 70 },
    ], 'AAA')
    expect(result.current.map((p) => p.player_id)).toEqual([1, 4])
    expect(result.applied).toHaveLength(2)
  })
})
