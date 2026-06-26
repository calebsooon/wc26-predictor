import { describe, expect, it } from 'vitest'
import { equivalentPlayerIds } from './player-equivalence'

describe('equivalentPlayerIds', () => {
  it('groups duplicate player rows by folded name and team name', () => {
    const map = equivalentPlayerIds([
      { id: 4385510, name: 'Mohamed Salah', team_name: 'Egypt', team_code: null },
      { id: 189529648, name: 'Mohamed Salah', team_name: 'Egypt', team_code: 'EGY' },
      { id: 7, name: 'Mohamed Salah', team_name: 'Morocco', team_code: 'MAR' },
    ])

    expect(map.get(4385510)).toEqual([4385510, 189529648])
    expect(map.get(189529648)).toEqual([4385510, 189529648])
    expect(map.has(7)).toBe(false)
  })
})
