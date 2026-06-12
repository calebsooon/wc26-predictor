'use client'

export function claimLocalOnce(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage.getItem(key)) return false
    window.localStorage.setItem(key, new Date().toISOString())
    return true
  } catch {
    return false
  }
}
