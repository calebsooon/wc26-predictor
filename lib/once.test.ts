import { afterEach, describe, expect, it } from 'vitest'
import { claimLocalOnce } from './once'

function installLocalStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    },
    configurable: true,
  })
}

describe('claimLocalOnce', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('claims a key once and rejects repeats', () => {
    installLocalStorage()
    expect(claimLocalOnce('md_confetti_exact_user_match')).toBe(true)
    expect(claimLocalOnce('md_confetti_exact_user_match')).toBe(false)
  })

  it('does not claim during server-side execution', () => {
    expect(claimLocalOnce('md_confetti_rank_user_league_snapshot_move')).toBe(false)
  })
})
