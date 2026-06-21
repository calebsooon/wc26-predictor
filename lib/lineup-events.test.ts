import { describe, expect, it } from 'vitest'
import { normaliseProviderSubstitutions } from './lineup-events'

describe('normaliseProviderSubstitutions', () => {
  it('uses provider player/assist pairs and discards incomplete substitutions', () => {
    expect(normaliseProviderSubstitutions([
      { time: 67, teamId: 1, playerId: 2, playerName: 'Incoming', type: 'subst', detail: 'Substitution', assist: { id: 3, name: 'Outgoing' } },
      { time: 72, teamId: 1, playerId: 4, playerName: 'Incomplete', type: 'subst', detail: 'Substitution' },
    ])).toEqual([{ teamId: 1, playerInName: 'Incoming', playerOutName: 'Outgoing', minute: 67 }])
  })
})
