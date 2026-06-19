'use client'

/* ============================================================
   MatchDay — per-device display preferences (localStorage).
   Colour-blind mode swaps chart palettes for a CVD-safe set.
   ============================================================ */

import { useEffect, useState } from 'react'

const CB_KEY = 'matchday:colorblind'
const CB_EVENT = 'matchday:colorblind-change'

export function getColorblind(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(CB_KEY) === '1' } catch { return false }
}

export function setColorblind(on: boolean) {
  try { localStorage.setItem(CB_KEY, on ? '1' : '0') } catch {}
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('cb', on)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CB_EVENT))
}

/**
 * Hydrate the local cache from the DB-backed preference (source of truth), only
 * when it differs — so AppShell can sync cross-device without a redundant write.
 */
export function syncColorblindFromDb(on: boolean) {
  if (getColorblind() !== on) setColorblind(on)
}

/** Reactive read — updates when toggled here or in another tab. */
export function useColorblind(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    setOn(getColorblind())
    const handler = () => setOn(getColorblind())
    window.addEventListener(CB_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CB_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return on
}
