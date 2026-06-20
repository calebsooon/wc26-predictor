import recordedEvents from '@/lib/fixtures/kickoff-recorded-events.json'
import { describe, expect, it } from 'vitest'
import { firstCreditedGoal, sameFixtureDay } from '@/lib/live-sync'

describe('recorded Kickoffapi event handling', () => {
  it('uses the earliest credited goal and ignores own goals', () => {
    expect(firstCreditedGoal(recordedEvents)).toMatchObject({
      time: 37,
      playerName: 'First Credited Scorer',
    })
  })

  it('matches provider fixtures by calendar day across time zones', () => {
    expect(sameFixtureDay('2026-06-14T12:00:00.000Z', '2026-06-14T20:00:00+08:00')).toBe(true)
    expect(sameFixtureDay('2026-06-14T23:00:00.000Z', '2026-06-15T00:30:00+01:00')).toBe(false)
  })
})
