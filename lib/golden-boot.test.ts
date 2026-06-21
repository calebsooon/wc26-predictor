import { describe, expect, it } from 'vitest'
import { deriveGoldenBootStats } from './golden-boot'

describe('deriveGoldenBootStats', () => {
  it('totals normal goals and assists while excluding own goals', () => {
    const stats = deriveGoldenBootStats({
      rosterByCode: new Map([['ARG', [{ id: 1, name: 'Lionel Messi', team_name: 'Argentina' }, { id: 2, name: 'Rodrigo De Paul', team_name: 'Argentina' }]]]),
      fixtures: [{ teamCodes: new Map([[26, 'ARG']]), events: [
        { teamId: 26, playerId: 154, playerName: 'L. Messi', assistId: 2472, assistName: 'R. De Paul', type: 'Goal', detail: 'Normal Goal' },
        { teamId: 26, playerId: 154, playerName: 'L. Messi', type: 'Goal', detail: 'Normal Goal' },
        { teamId: 26, playerId: 99, playerName: 'Own Goal', type: 'Goal', detail: 'Own Goal' },
      ] }],
    })
    expect(stats).toEqual([
      expect.objectContaining({ provider_player_id: 154, player_name: 'Lionel Messi', goals: 2, assists: 0 }),
      expect.objectContaining({ provider_player_id: 2472, player_name: 'Rodrigo De Paul', goals: 0, assists: 1 }),
    ])
  })
})
