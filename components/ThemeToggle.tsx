'use client'

import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon } from '@/components/ui'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={`w-9 h-9 grid place-items-center rounded-md bg-card border border-border text-texts hover:text-textp hover:border-texts/40 transition-colors ${className}`}
    >
      {dark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  )
}
