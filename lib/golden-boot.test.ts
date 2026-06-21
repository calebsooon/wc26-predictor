import { describe, expect, it } from 'vitest'
import { deriveGoldenBootStats, normaliseFifaGoldenBootActors } from './golden-boot'

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

describe('normaliseFifaGoldenBootActors', () => {
  it('preserves FIFA’s published Golden Boot order and values', () => {
    const rows = normaliseFifaGoldenBootActors([
      {
        number: 1,
        name: { eng: 'Deniz Undav' },
        key: { _externalSportsPersonId: '484851' },
        tags: [
          { name: 'urn:gd:tag:story:team:abbreviation', value: 'GER' },
          { name: 'urn:gd:tag:football:stats:goals', value: 3 },
          { name: 'urn:gd:tag:football:stats:assists', value: 2 },
          { name: 'urn:gd:tag:football:stats:total_competition_minutes_played', value: 69 },
          { name: 'urn:gd:tag:story:staff:image', value: 'https://images.fifa.test/undav' },
        ],
      },
      {
        number: 2,
        name: { eng: 'Lionel Messi' },
        key: { _externalSportsPersonId: '229397' },
        tags: [
          { name: 'urn:gd:tag:story:team:abbreviation', value: 'ARG' },
          { name: 'urn:gd:tag:football:stats:goals', value: 3 },
          { name: 'urn:gd:tag:football:stats:assists', value: 0 },
          { name: 'urn:gd:tag:football:stats:total_competition_minutes_played', value: 83 },
        ],
      },
    ], new Map(), 'goals')

    expect(rows).toEqual([
      expect.objectContaining({ player_name: 'Deniz Undav', team_code: 'GER', goals: 3, assists: 2, minutes_played: 69, fifa_rank: 1, fifa_assist_rank: null }),
      expect.objectContaining({ player_name: 'Lionel Messi', team_code: 'ARG', goals: 3, assists: 0, minutes_played: 83, fifa_rank: 2, fifa_assist_rank: null }),
    ])
  })

  it('uses FIFA’s assists-table order instead of the unrelated Golden Boot actor number', () => {
    const [row] = normaliseFifaGoldenBootActors([{
      number: 21,
      name: { eng: 'Alexander Isak' },
      key: { _externalSportsPersonId: '430150' },
      tags: [
        { name: 'urn:gd:tag:story:team:abbreviation', value: 'SWE' },
        { name: 'urn:gd:tag:football:stats:goals', value: 1 },
        { name: 'urn:gd:tag:football:stats:assists', value: 3 },
        { name: 'urn:gd:tag:football:stats:total_competition_minutes_played', value: 194 },
      ],
    }], new Map(), 'assists')

    expect(row).toMatchObject({ player_name: 'Alexander Isak', goals: 1, assists: 3, fifa_rank: null, fifa_assist_rank: 1, fifa_assist_order: 1 })
  })
})
