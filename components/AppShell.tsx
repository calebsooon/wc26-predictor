'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import ThemeToggle from '@/components/ThemeToggle'
import {
  Logo, Avatar, ChevDown,
  HomeIcon, CalIcon, TrophyIcon, GridIcon, TreeIcon, UserIcon, ShieldIcon, UsersIcon, HelpIcon,
} from '@/components/ui'

interface Profile {
  username: string
  avatar_url: string | null
  is_admin: boolean
}

type NavItem = { href: string; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element; admin?: boolean }

const SIDEBAR: NavItem[] = [
  { href: '/dashboard',   label: 'Home',        icon: HomeIcon },
  { href: '/predictions', label: 'Fixtures',    icon: CalIcon },
  { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { href: '/groups',      label: 'Groups',      icon: GridIcon },
  { href: '/bracket',     label: 'Bracket',     icon: TreeIcon },
  { href: '/squads',      label: 'Squads',      icon: UsersIcon },
  { href: '/rules',       label: 'Rules',       icon: HelpIcon },
  { href: '/profile',     label: 'Profile',     icon: UserIcon },
  { href: '/admin',       label: 'Admin',       icon: ShieldIcon, admin: true },
]

const BOTTOM: NavItem[] = [
  { href: '/dashboard',   label: 'Home',    icon: HomeIcon },
  { href: '/predictions', label: 'Fixtures',icon: CalIcon },
  { href: '/leaderboard', label: 'Ranks',   icon: TrophyIcon },
  { href: '/bracket',     label: 'Bracket', icon: TreeIcon },
  { href: '/profile',     label: 'Profile', icon: UserIcon },
]

// Routes that render WITHOUT the app shell (own full-bleed layout)
const BARE = ['/', '/login', '/auth']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setProfile(null); return }
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url, is_admin')
        .eq('id', user.id)
        .single()
      if (data) setProfile(data as Profile)
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setProfile(null)
      if (event === 'SIGNED_IN') load()
    })
    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isBare = BARE.some((b) => pathname === b || pathname.startsWith('/auth'))
  if (isBare) return <>{children}</>

  const items = SIDEBAR.filter((it) => !it.admin || profile?.is_admin)
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-bg text-textp">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 border-r border-border bg-surface/50 z-30">
        <Link href="/dashboard" className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <Logo />
          <span className="font-extrabold tracking-tight">MATCHDAY</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => {
            const Ic = it.icon
            const active = isActive(it.href)
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`w-full flex items-center gap-3 h-11 px-3 rounded-xl font-bold text-sm transition-all ${active ? 'bg-primary/12 text-primary' : 'text-texts hover:text-textp hover:bg-card'}`}
              >
                <Ic size={20} className={active ? 'text-primary' : ''} />
                <span className="flex-1">{it.label}</span>
                {it.admin && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold">ADMIN</span>}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <button onClick={logout} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-card transition-colors">
            <Avatar name={profile?.username ?? '?'} src={profile?.avatar_url} size={36} />
            <div className="flex-1 text-left min-w-0">
              <div className="font-bold text-sm truncate">{profile?.username ?? 'Sign in'}</div>
              <div className="text-[11px] text-texts">Log out</div>
            </div>
            <ChevDown size={14} className="text-texts -rotate-90" />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-bg/90 backdrop-blur-md">
          <div className="h-full max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <Logo size={26} />
              <span className="font-extrabold tracking-tight text-sm">MATCHDAY</span>
            </Link>
            <div className="hidden lg:flex items-center gap-3.5">
              <span className="text-xs font-bold uppercase tracking-wider text-texts whitespace-nowrap">World Cup 2026</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5">
              <ThemeToggle />
              <Link href="/profile" className="lg:hidden">
                <Avatar name={profile?.username ?? '?'} src={profile?.avatar_url} size={34} />
              </Link>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 py-5 sm:py-7 pb-28 lg:pb-10 max-w-6xl mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-lg border-t border-border">
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
          {BOTTOM.map((it) => {
            const Ic = it.icon
            const active = isActive(it.href)
            return (
              <Link key={it.href} href={it.href} className="flex flex-col items-center justify-center gap-1 relative">
                {active && <span className="absolute top-0 w-10 h-0.5 rounded-full bg-primary" />}
                <Ic size={22} className={active ? 'text-primary' : 'text-texts'} />
                <span className={`text-[10px] font-bold ${active ? 'text-primary' : 'text-texts'}`}>{it.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
