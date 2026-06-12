'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/* ── Install prompt (Android + Desktop Chrome/Edge) ──────────────
   Captures the browser's beforeinstallprompt event so we can
   trigger the native install dialog from our own UI instead of
   relying on the address-bar icon. Does nothing on iOS — Apple
   doesn't fire this event; users must go through Safari Share sheet.
   ─────────────────────────────────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already running as installed PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) { setIsInstalled(true); return }

    function onPrompt(e: Event) {
      e.preventDefault()
      deferred.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    function onInstalled() {
      setIsInstalled(true)
      setCanInstall(false)
      deferred.current = null
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred.current) return 'unavailable'
    await deferred.current.prompt()
    const { outcome } = await deferred.current.userChoice
    deferred.current = null
    setCanInstall(false)
    if (outcome === 'accepted') setIsInstalled(true)
    return outcome
  }, [])

  return { canInstall, isInstalled, triggerInstall }
}

/* ── App badge ────────────────────────────────────────────────────
   Sets the OS-level badge on the installed app icon.
   Supported: Android Chrome 81+, Desktop Chrome/Edge 81+, Safari 17.4+
   Silently no-ops on unsupported browsers.
   count = 0 clears the badge.
   ─────────────────────────────────────────────────────────────── */

export function useAppBadge(count: number) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {})
    } else {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [count])
}
