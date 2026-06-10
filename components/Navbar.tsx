'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

interface Profile {
  username: string
  is_admin: boolean
}

export default function Navbar() {
  const supabase = createClient()
  const router   = useRouter()
  const pathname = usePathname()
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('username, is_admin')
        .eq('id', user.id)
        .single()
      if (data) setProfile(data as Profile)
    }
    loadProfile()

    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') setProfile(null)
      if (event === 'SIGNED_IN')  loadProfile()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (pathname === '/login') return null
  if (!profile) return null

  const NAV_LINKS = [
    { href: '/predictions', label: 'Predictions' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/groups',      label: 'Groups' },
    { href: '/bracket',     label: 'Bracket' },
    { href: '/squads',      label: 'Squads' },
    ...(profile.is_admin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <nav className="bg-black sticky top-0 z-50">
      {/* FIFA red accent line */}
      <div className="h-0.5 bg-fifa-red w-full" />

      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-13 py-2">

          {/* Logo */}
          <Link href="/predictions" className="flex items-center gap-2.5 shrink-0">
            <span className="text-xl select-none">⚽</span>
            <div className="hidden sm:block leading-tight">
              <p className="text-white font-extrabold text-sm tracking-tight">WORLD CUP 2026</p>
              <p className="text-white/40 text-[10px] font-medium tracking-widest uppercase">Predictor</p>
            </div>
            <span className="text-white font-extrabold text-sm sm:hidden">WC26</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(href)
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Right: username + logout */}
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href="/profile"
              className="text-xs text-white/40 font-medium hover:text-white transition-colors px-2 py-1.5 rounded-md hover:bg-white/5"
            >
              {profile.username}
            </Link>
            <button
              onClick={logout}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-colors"
            >
              Log out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-white/60 hover:text-white p-1"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen
              ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
            }
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-white/10 bg-black px-4 py-3 space-y-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(href) ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <Link href="/profile" onClick={() => setMenuOpen(false)} className="text-xs text-white/40 hover:text-white transition-colors">
              {profile.username}
            </Link>
            <button onClick={logout} className="text-xs font-medium px-3 py-1.5 rounded-md border border-white/10 text-white/60 hover:text-white transition-colors">
              Log out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
