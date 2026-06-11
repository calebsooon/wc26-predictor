'use client'

import { Toaster } from 'sonner'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { createClient } from '@/lib/supabase-browser'
import { getMyLeagues, setActiveLeague, isMoneyLeague, type League } from '@/lib/league'
import ThemeToggle from '@/components/ThemeToggle'
import {
  Logo, Avatar, ChevDown, LeagueBadge,
  HomeIcon, CalIcon, TrophyIcon, GridIcon, TreeIcon, UserIcon, ShieldIcon, UsersIcon, HelpIcon,
} from '@/components/ui'

interface Profile {
  username: string
  avatar_url: string | null
  is_admin: boolean
  active_league_id: string | null
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
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [leaguesReady, setLeaguesReady] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setProfile(null); setLeaguesReady(false); return }
      const [{ data }, leagues] = await Promise.all([
        supabase.from('profiles').select('username, avatar_url, is_admin, active_league_id').eq('id', user.id).single(),
        getMyLeagues(supabase, user.id),
      ])
      if (data) setProfile(data as Profile)
      setMyLeagues(leagues)
      setLeaguesReady(true)
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setProfile(null); setMyLeagues([]); setLeaguesReady(false) }
      if (event === 'SIGNED_IN') load()
    })
    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isBare = BARE.some((b) => pathname === b || pathname.startsWith('/auth'))

  // Gate: a signed-in user with no league memberships must onboard via /join
  useEffect(() => {
    if (isBare || !leaguesReady) return
    if (myLeagues.length === 0 && pathname !== '/join') router.replace('/join')
  }, [isBare, leaguesReady, myLeagues.length, pathname, router])

  const activeLeague = myLeagues.find((l) => l.id === profile?.active_league_id) ?? myLeagues[0] ?? null

  async function switchLeague(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await setActiveLeague(supabase, user.id, id)
    setProfile((p) => (p ? { ...p, active_league_id: id } : p))
    router.refresh()
  }

  if (isBare) return <MotionConfig reducedMotion="user">{children}<Toaster position="bottom-center" richColors /></MotionConfig>

  const items = SIDEBAR.filter((it) => !it.admin || profile?.is_admin)
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-bg text-textp">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 border-r border-border bg-surface/50 z-30">
        <Link href="/dashboard" className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <Logo />
          <span className="font-extrabold tracking-tight">MATCHDAY</span>
        </Link>
        {activeLeague && (
          <div className="px-3 pt-3">
            <LeagueSwitcher leagues={myLeagues} active={activeLeague} onSwitch={switchLeague} />
          </div>
        )}
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
              {activeLeague && (
                <div className="lg:hidden">
                  <LeagueSwitcher leagues={myLeagues} active={activeLeague} onSwitch={switchLeague} compact />
                </div>
              )}
              <ThemeToggle />
              <Link href="/profile" className="lg:hidden">
                <Avatar name={profile?.username ?? '?'} src={profile?.avatar_url} size={34} />
              </Link>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 py-5 sm:py-7 pb-28 lg:pb-10 max-w-6xl mx-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              className="w-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
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
      <Toaster position="bottom-center" richColors />
    </div>
    </MotionConfig>
  )
}

function LeagueSwitcher({
  leagues, active, onSwitch, compact = false,
}: { leagues: League[]; active: League; onSwitch: (id: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-xl border border-border bg-card hover:border-texts/40 transition-colors ${compact ? 'h-9 px-2.5 max-w-[150px]' : 'w-full h-11 px-3'}`}
      >
        <TrophyIcon size={15} className={isMoneyLeague(active) ? 'text-gold' : 'text-primary'} />
        <span className="flex-1 text-left font-bold text-[13px] truncate">{active.name}</span>
        {!compact && <LeagueBadge name={active.league_labels?.name} color={active.league_labels?.color} money={isMoneyLeague(active)} />}
        <ChevDown size={13} className="text-texts shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={`absolute z-40 mt-2 ${compact ? 'right-0 w-56' : 'left-0 w-full'} bg-card border border-border rounded-xl shadow-2xl overflow-hidden`}>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { onSwitch(l.id); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${l.id === active.id ? 'bg-primary/10' : 'hover:bg-surface'}`}
                >
                  <TrophyIcon size={14} className={isMoneyLeague(l) ? 'text-gold' : 'text-primary'} />
                  <span className="flex-1 text-[13px] font-semibold text-textp truncate">{l.name}</span>
                  <LeagueBadge name={l.league_labels?.name} color={l.league_labels?.color} money={isMoneyLeague(l)} />
                </button>
              ))}
            </div>
            <Link
              href="/join"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 h-10 border-t border-border text-[13px] font-bold text-primary hover:bg-surface"
            >
              + Enter a league code
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
