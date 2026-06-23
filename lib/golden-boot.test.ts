import { describe, expect, it } from 'vitest'
import { normaliseFifaGoldenBootActors } from './golden-boot'

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
