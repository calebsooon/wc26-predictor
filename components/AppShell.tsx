'use client'

import { Toaster } from 'sonner'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { createClient } from '@/lib/supabase-browser'
import { getMyLeagues, setActiveLeague, isMoneyLeague, type League } from '@/lib/league'
import { ActiveLeagueProvider } from '@/lib/active-league'
import { syncColorblindFromDb } from '@/lib/prefs'
import ThemeToggle from '@/components/ThemeToggle'
import CommandPalette from '@/components/CommandPalette'
import {
  Logo, Avatar, ChevDown, LeagueBadge, hexToRgbChannels,
  HomeIcon, CalIcon, TrophyIcon, GridIcon, TreeIcon, UserIcon, ShieldIcon, UsersIcon, HelpIcon, ChartIcon,
} from '@/components/ui'

const InstallIcon = ({ size = 20, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M12 8v8M8 14l4 4 4-4"/>
  </svg>
)

interface Profile {
  username: string
  avatar_url: string | null
  is_admin: boolean
}

type NavItem = { href: string; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element; admin?: boolean; section?: string }

// Grouped for the desktop sidebar (section label shown when it changes). Order
// here is also the order used by the mobile drawer and command palette.
const SIDEBAR: NavItem[] = [
  { href: '/dashboard',   label: 'Home',        icon: HomeIcon },
  { href: '/predictions', label: 'Fixtures',    icon: CalIcon,     section: 'Play' },
  { href: '/groups',      label: 'Groups',      icon: GridIcon,    section: 'Play' },
  { href: '/bracket',     label: 'Bracket',     icon: TreeIcon,    section: 'Play' },
  { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon,  section: 'Standings' },
  { href: '/h2h',         label: 'Compare',     icon: ChartIcon,   section: 'Standings' },
  { href: '/golden-boot', label: 'Golden Boot', icon: TrophyIcon,  section: 'Standings' },
  { href: '/squads',      label: 'Teams',       icon: UsersIcon,   section: 'Reference' },
  { href: '/faq',         label: 'FAQ',         icon: HelpIcon,    section: 'Reference' },
  { href: '/profile',     label: 'Profile',     icon: UserIcon,    section: 'You' },
  { href: '/install',     label: 'Get the app', icon: InstallIcon, section: 'You' },
  { href: '/admin',       label: 'Admin',       icon: ShieldIcon, admin: true, section: 'Admin' },
]

const BOTTOM: NavItem[] = [
  { href: '/dashboard',   label: 'Home',     icon: HomeIcon },
  { href: '/predictions', label: 'Fixtures', icon: CalIcon },
  { href: '/leaderboard', label: 'Ranks',    icon: TrophyIcon },
]

// Routes that render WITHOUT the app shell (own full-bleed layout)
const BARE = ['/', '/login', '/auth', '/privacy', '/terms']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [leaguesReady, setLeaguesReady] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setProfile(null); setLeaguesReady(false); return }
        const [{ data }, leagues] = await Promise.all([
          supabase.from('profiles').select('username, avatar_url, is_admin, theme, colorblind, colorblind_scope').eq('id', user.id).single(),
          getMyLeagues(supabase, user.id),
        ])
        if (data) {
          setProfile(data as Profile)
          // Sync theme preference from profile if no local override
          const p = data as Profile & { theme?: string | null; colorblind?: boolean | null; colorblind_scope?: string | null }
          if (p.theme) {
            const isDark = p.theme === 'dark'
            document.documentElement.classList.toggle('dark', isDark)
            try { localStorage.setItem('theme', p.theme) } catch {}
          }
          // Hydrate colour-blind preference (cross-device source of truth)
          syncColorblindFromDb(p.colorblind === true, p.colorblind_scope === 'graph' ? 'graph' : 'all')
        }
        setMyLeagues(leagues)
        try {
          const stored = window.localStorage.getItem(`matchday:active-league:${user.id}`)
          const resolved = leagues.find((l) => l.id === stored)?.id ?? leagues[0]?.id ?? null
          setActiveLeagueId(resolved)
        } catch {
          setActiveLeagueId(leagues[0]?.id ?? null)
        }
        setLeaguesReady(true)
      } catch {
        // Shell failure is non-fatal — nav still renders, pages handle their own auth
        setLeaguesReady(true)
      }
    }
    load()
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setProfile(null); setMyLeagues([]); setActiveLeagueId(null); setLeaguesReady(false) }
      if (event === 'SIGNED_IN') load()
    })
    function handleProfileUpdated(event: Event) {
      const detail = (event as CustomEvent<{ username?: string; avatar_url?: string | null }>).detail
      setProfile((prev) => (prev ? { ...prev, ...detail } : prev))
    }
    function handleActiveLeagueChanged(event: Event) {
      const detail = (event as CustomEvent<{ leagueId?: string }>).detail
      if (detail?.leagueId) setActiveLeagueId(detail.leagueId)
    }
    window.addEventListener('matchday:profile-updated', handleProfileUpdated as EventListener)
    window.addEventListener('matchday:active-league-changed', handleActiveLeagueChanged as EventListener)
    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener('matchday:profile-updated', handleProfileUpdated as EventListener)
      window.removeEventListener('matchday:active-league-changed', handleActiveLeagueChanged as EventListener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isBare = BARE.some((b) => pathname === b || pathname.startsWith('/auth'))

  // Gate: a signed-in user with no league memberships must onboard via /join
  useEffect(() => {
    if (isBare || !leaguesReady) return
    if (myLeagues.length === 0 && pathname !== '/join') router.replace('/join')
  }, [isBare, leaguesReady, myLeagues.length, pathname, router])

  const activeLeague = myLeagues.find((l) => l.id === activeLeagueId) ?? myLeagues[0] ?? null
  const accentChannels = hexToRgbChannels(activeLeague?.league_labels?.color)
  const accentStyle = accentChannels ? ({ ['--accent' as string]: accentChannels } as React.CSSProperties) : undefined

  const switchLeague = useCallback(async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setActiveLeagueId(id)
    await setActiveLeague(supabase, user.id, id)
    router.refresh()
  }, [router, supabase])

  const providerValue = useMemo(() => ({
    league: activeLeague,
    leagues: myLeagues,
    profile,
    leaguesReady,
    switchLeague,
  }), [activeLeague, myLeagues, profile, leaguesReady, switchLeague])

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  if (isBare) return <MotionConfig reducedMotion="user">{children}<Toaster position="bottom-center" richColors /></MotionConfig>

  const items = SIDEBAR.filter((it) => !it.admin || profile?.is_admin)
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const mobileItems = [...items, { href: '/join', label: 'Join League', icon: TrophyIcon }]

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <MotionConfig reducedMotion="user">
    <ActiveLeagueProvider value={providerValue}>
    <div className="min-h-screen bg-bg text-textp" style={accentStyle}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 border-r border-border bg-surface z-30">
        <Link href="/dashboard" className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <Logo />
          <span className="font-extrabold tracking-tight">MATCHDAY</span>
        </Link>
        {activeLeague && (
          <div className="px-3 pt-3">
            <LeagueSwitcher leagues={myLeagues} active={activeLeague} onSwitch={switchLeague} />
          </div>
        )}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
          {items.map((it, i) => {
            const Ic = it.icon
            const active = isActive(it.href)
            const showSection = it.section && it.section !== items[i - 1]?.section
            return (
              <Fragment key={it.href}>
                {showSection && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-faint">{it.section}</div>
                )}
                <Link
                  href={it.href}
                  className={`w-full flex items-center gap-3 h-11 px-3 rounded-xl font-bold text-sm transition-all border ${active ? 'bg-accent/[0.10] border-accent/[0.22] text-accent' : 'text-texts hover:text-textp hover:bg-surface2 border-transparent'}`}
                >
                  <Ic size={20} className={active ? 'text-accent' : ''} />
                  <span className="flex-1">{it.label}</span>
                  {it.admin && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold">ADMIN</span>}
                </Link>
              </Fragment>
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

        <main className="px-4 sm:px-6 py-5 sm:py-7 lg:pb-10 max-w-6xl mx-auto overflow-x-hidden">
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
          {/* Safe-area-aware spacer for mobile bottom nav — hidden on desktop */}
          <div className="lg:hidden" style={{ height: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }} aria-hidden="true" />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-bg/85 backdrop-blur-xl border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4 h-16 max-w-md mx-auto">
          {BOTTOM.map((it) => {
            const Ic = it.icon
            const active = isActive(it.href)
            return (
              <Link key={it.href} href={it.href} className="flex flex-col items-center justify-center gap-1 relative">
                {active && <span className="absolute top-0 w-10 h-0.5 rounded-full bg-accent" />}
                <Ic size={22} className={active ? 'text-accent' : 'text-texts'} />
                <span className={`text-[10px] font-bold ${active ? 'text-accent' : 'text-texts'}`}>{it.label}</span>
              </Link>
            )
          })}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center justify-center gap-1 relative">
            {moreOpen && <span className="absolute top-0 w-10 h-0.5 rounded-full bg-accent" />}
            <GridIcon size={22} className={moreOpen ? 'text-accent' : 'text-texts'} />
            <span className={`text-[10px] font-bold ${moreOpen ? 'text-accent' : 'text-texts'}`}>More</span>
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.button
              aria-label="Close navigation"
              className="lg:hidden fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="lg:hidden fixed inset-x-0 bottom-0 z-50 max-h-[86vh] rounded-t-2xl border border-border bg-card shadow-2xl overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{ willChange: 'transform' }}
            >
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-texts">Navigate</p>
                    <p className="text-sm font-extrabold text-textp truncate">{activeLeague?.name ?? 'MatchDay'}</p>
                  </div>
                  <button onClick={() => setMoreOpen(false)} className="w-9 h-9 rounded-lg border border-border text-texts hover:text-textp">×</button>
                </div>
                {activeLeague && (
                  <div className="mt-3">
                    <LeagueSwitcher leagues={myLeagues} active={activeLeague} onSwitch={switchLeague} />
                  </div>
                )}
              </div>
              <div className="p-3 grid grid-cols-2 gap-2 overflow-y-auto max-h-[60vh]">
                {mobileItems.map((it) => {
                  const Ic = it.icon
                  const active = isActive(it.href)
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`flex items-center gap-3 h-12 px-3 rounded-xl border font-bold text-sm ${active ? 'border-accent/40 bg-accent/12 text-accent' : 'border-border bg-surface text-textp'}`}
                    >
                      <Ic size={19} className={active ? 'text-accent' : 'text-texts'} />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Toaster position="bottom-center" richColors />
      <CommandPalette
        commands={[
          ...items.map((it) => ({ id: `nav:${it.href}`, label: it.label, hint: 'Page', run: () => router.push(it.href) })),
          ...myLeagues.map((l) => ({ id: `lg:${l.id}`, label: `Switch to ${l.name}`, hint: 'League', run: () => switchLeague(l.id) })),
        ]}
      />
    </div>
    </ActiveLeagueProvider>
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
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`League: ${active.name}`}
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
