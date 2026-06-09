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
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
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

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setProfile(null)
      if (event === 'SIGNED_IN') loadProfile()
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Don't render navbar on the login page
  if (pathname === '/login') return null
  // Don't render if not authenticated yet
  if (!profile) return null

  const navLink = (href: string, label: string) => {
    const active = pathname.startsWith(href)
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors ${
          active
            ? 'text-white'
            : 'text-white/60 hover:text-white'
        }`}
        onClick={() => setMenuOpen(false)}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-blue-700 shadow-sm sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/predictions" className="flex items-center gap-2 shrink-0">
            <span className="text-lg select-none">⚽</span>
            <span className="font-bold text-white text-sm leading-tight hidden sm:block">
              World Cup 2026<br />
              <span className="font-normal text-white/70 text-xs">Predictor</span>
            </span>
            <span className="font-bold text-white text-sm sm:hidden">WC26</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-6">
            {navLink('/predictions', 'Predictions')}
            {navLink('/leaderboard', 'Leaderboard')}
            {profile.is_admin && navLink('/admin', 'Admin')}
          </div>

          {/* Right: username + logout */}
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-white/70 font-medium">{profile.username}</span>
            <button
              onClick={logout}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Log out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-white/80 hover:text-white p-1"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-white/10 px-4 py-3 space-y-3 bg-blue-700">
          {navLink('/predictions', 'Predictions')}
          {navLink('/leaderboard', 'Leaderboard')}
          {profile.is_admin && navLink('/admin', 'Admin')}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm text-white/60">{profile.username}</span>
            <button
              onClick={logout}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
