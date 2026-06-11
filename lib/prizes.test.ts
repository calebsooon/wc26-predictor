import { describe, it, expect } from 'vitest'
import { gwPrize, overallPrize, formatPrize, prizeTone, GW_PRIZES, OVERALL_PRIZES } from './prizes'

describe('prize helpers', () => {
  it('maps rank to the GW prize tier and clamps', () => {
    expect(gwPrize(1)).toBe(GW_PRIZES[0])
    expect(gwPrize(7)).toBe(GW_PRIZES[6])
    expect(gwPrize(99)).toBe(GW_PRIZES[6]) // clamp to last
    expect(gwPrize(0)).toBe(GW_PRIZES[0])  // clamp to first
  })

  it('maps rank to the overall prize tier', () => {
    expect(overallPrize(1)).toBe(OVERALL_PRIZES[0])
    expect(overallPrize(7)).toBe(OVERALL_PRIZES[6])
  })

  it('formats prize amounts with sign', () => {
    expect(formatPrize(15)).toBe('+$15')
    expect(formatPrize(-10)).toBe('-$10')
    expect(formatPrize(0)).toBe('$0')
  })

  it('tones by sign', () => {
    expect(prizeTone(5)).toBe('green')
    expect(prizeTone(-5)).toBe('red')
    expect(prizeTone(0)).toBe('default')
  })
})
