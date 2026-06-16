'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { SunIcon, MoonIcon } from '@/components/ui'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  async function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    const value = next ? 'dark' : 'light'
    try { localStorage.setItem('theme', value) } catch {}
    const { data: { user } } = await supabase.auth.getUser()
    if (user) supabase.from('profiles').update({ theme: value }).eq('id', user.id).then(() => {})
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
