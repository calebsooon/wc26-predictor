'use client'

/* ============================================================
   MatchDay — per-device display preferences (localStorage).
   Colour-blind mode swaps the leaderboard chart palette for a
   CVD-safe set; an optional "everywhere" scope also remaps the
   app-wide semantic colours (success / amber / coral) via the
   `.cb-all` class on <html>.
   ============================================================ */

import { useEffect, useState } from 'react'

export type ColorblindScope = 'graph' | 'all'

const CB_KEY = 'matchday:colorblind'
const CB_SCOPE_KEY = 'matchday:colorblind-scope'
const CB_EVENT = 'matchday:colorblind-change'

export function getColorblind(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(CB_KEY) === '1' } catch { return false }
}

export function getColorblindScope(): ColorblindScope {
  if (typeof window === 'undefined') return 'all'
  try { return localStorage.getItem(CB_SCOPE_KEY) === 'graph' ? 'graph' : 'all' } catch { return 'all' }
}

// Reflect the current preference onto <html>: `.cb` whenever colour-blind mode
// is on, `.cb-all` only when its scope covers the whole app.
function applyClasses() {
  if (typeof document === 'undefined') return
  const on = getColorblind()
  const all = on && getColorblindScope() === 'all'
  document.documentElement.classList.toggle('cb', on)
  document.documentElement.classList.toggle('cb-all', all)
}

export function setColorblind(on: boolean) {
  try { localStorage.setItem(CB_KEY, on ? '1' : '0') } catch {}
  applyClasses()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CB_EVENT))
}

export function setColorblindScope(scope: ColorblindScope) {
  try { localStorage.setItem(CB_SCOPE_KEY, scope) } catch {}
  applyClasses()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CB_EVENT))
}

/**
 * Hydrate the local cache from the DB-backed preference (source of truth), only
 * when it differs — so AppShell can sync cross-device without a redundant write.
 */
export function syncColorblindFromDb(on: boolean, scope: ColorblindScope = 'all') {
  if (getColorblind() !== on) setColorblind(on)
  if (getColorblindScope() !== scope) setColorblindScope(scope)
  else applyClasses() // ensure classes reflect DB even when local already matched
}

/** Reactive read of the on/off flag — updates when toggled here or in another tab. */
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

/** Reactive read of the scope — updates when toggled here or in another tab. */
export function useColorblindScope(): ColorblindScope {
  const [scope, setScope] = useState<ColorblindScope>('all')
  useEffect(() => {
    setScope(getColorblindScope())
    const handler = () => setScope(getColorblindScope())
    window.addEventListener(CB_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CB_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return scope
}
