import { describe, expect, it } from 'vitest'
import { normaliseProviderMatchEvents, normaliseProviderSubstitutions } from './lineup-events'

describe('normaliseProviderSubstitutions', () => {
  it('uses provider player/assist pairs and discards incomplete substitutions', () => {
    expect(normaliseProviderSubstitutions([
      { time: 67, teamId: 1, playerId: 2, playerName: 'Incoming', type: 'subst', detail: 'Substitution', assist: { id: 3, name: 'Outgoing' } },
      { time: 72, teamId: 1, playerId: 4, playerName: 'Incomplete', type: 'subst', detail: 'Substitution' },
    ])).toEqual([{ teamId: 1, playerInName: 'Incoming', playerOutName: 'Outgoing', minute: 67 }])
  })
})

describe('normaliseProviderMatchEvents', () => {
  it('keeps goals and recognised cards in chronological order', () => {
    expect(normaliseProviderMatchEvents([
      { time: 78, teamId: 1, playerId: 8, playerName: 'Booked Player', type: 'Card', detail: 'Yellow Card' },
      { time: 23, teamId: 2, playerId: 9, playerName: 'Goalscorer', assistName: 'Creator', type: 'Goal', detail: 'Normal Goal' },
      { time: 90, teamId: 1, playerId: 7, playerName: 'Dismissed Player', type: 'Card', detail: 'Red Card' },
      { time: 10, teamId: 1, playerId: 4, playerName: 'Ignored', type: 'Var', detail: 'Goal cancelled' },
    ])).toMatchObject([
      { minute: 23, type: 'goal', playerName: 'Goalscorer', assistName: 'Creator' },
      { minute: 78, type: 'yellow_card', playerName: 'Booked Player' },
      { minute: 90, type: 'red_card', playerName: 'Dismissed Player' },
    ])
  })
})
