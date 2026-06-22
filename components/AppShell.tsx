'use client'

import { Toaster, toast } from 'sonner'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { createClient } from '@/lib/supabase-browser'
import { getMyLeagues, setActiveLeague, isMoneyLeague, type League } from '@/lib/league'
import { ActiveLeagueProvider } from '@/lib/active-league'
import { syncColorblindFromDb } from '@/lib/prefs'
import ThemeToggle from '@/components/ThemeToggle'
import CommandPalette from '@/components/CommandPalette'
import {
  Logo, Avatar, Button, ChevDown, LeagueBadge, Modal, hexToRgbChannels,
  HomeIcon, CalIcon, TrophyIcon, GridIcon, TreeIcon, UserIcon, ShieldIcon, UsersIcon, HelpIcon, ChartIcon,
} from '@/components/ui'

const RecapIcon = ({ size = 20, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

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
  sidebar_preferences?: unknown | null
}

const SIDEBAR_PREFERENCE_KEYS = ['fixtures', 'groups', 'bracket', 'leaderboard', 'recap', 'compare', 'teams', 'golden-boot', 'admin', 'profile', 'install', 'faq'] as const
type SidebarPreferenceKey = typeof SIDEBAR_PREFERENCE_KEYS[number]
type NavItem = { href: string; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element; admin?: boolean; section?: string; preferenceKey?: SidebarPreferenceKey }

function readHiddenSidebarItems(value: unknown) {
  const hidden = value && typeof value === 'object' && 'hidden' in value
    ? (value as { hidden?: unknown }).hidden
    : []
  return new Set(
    Array.isArray(hidden)
      ? hidden.filter((key): key is SidebarPreferenceKey => typeof key === 'string' && (SIDEBAR_PREFERENCE_KEYS as readonly string[]).includes(key))
      : [],
  )
}

// The shell is deliberately task-oriented: play the fixtures, follow your
// league, then explore the tournament. Utility links live with the account,
// rather than competing with matchday actions in the primary rail.
const SIDEBAR: NavItem[] = [
  { href: '/dashboard',   label: 'Home',        icon: HomeIcon },
  { href: '/predictions', label: 'Fixtures',    icon: CalIcon,     section: 'Play', preferenceKey: 'fixtures' },
  { href: '/groups',      label: 'Groups',      icon: GridIcon,    section: 'Play', preferenceKey: 'groups' },
  { href: '/bracket',     label: 'Bracket',     icon: TreeIcon,    section: 'Play', preferenceKey: 'bracket' },
  { href: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon,  section: 'League', preferenceKey: 'leaderboard' },
  { href: '/recap',       label: 'Recap',       icon: RecapIcon,   section: 'League', preferenceKey: 'recap' },
  { href: '/h2h',         label: 'Compare',     icon: ChartIcon,   section: 'League', preferenceKey: 'compare' },
  { href: '/squads',      label: 'Teams',       icon: UsersIcon,   section: 'Tournament', preferenceKey: 'teams' },
  { href: '/golden-boot', label: 'Golden Boot', icon: TrophyIcon,  section: 'Tournament', preferenceKey: 'golden-boot' },
  { href: '/admin',       label: 'Admin',       icon: ShieldIcon, admin: true, section: 'Operations', preferenceKey: 'admin' },
]

const UTILITY: NavItem[] = [
  { href: '/profile',     label: 'Profile',     icon: UserIcon, preferenceKey: 'profile' },
  { href: '/install',     label: 'Get the app', icon: InstallIcon, preferenceKey: 'install' },
  { href: '/faq',         label: 'FAQ',         icon: HelpIcon, preferenceKey: 'faq' },
]

const BOTTOM: NavItem[] = [
  { href: '/dashboard',   label: 'Home',     icon: HomeIcon },
  { href: '/predictions', label: 'Fixtures', icon: CalIcon },
  { href: '/leaderboard', label: 'League',   icon: TrophyIcon },
]

type MatchdayPulse = {
  missingPicks: number
  liveMatches: number
  gameweek: number | null
  recapReady: boolean
}

// Routes that render WITHOUT the app shell (own full-bleed layout)
const BARE = ['/', '/login', '/auth', '/privacy', '/terms']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [leaguesReady, setLeaguesReady] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [hiddenSidebarItems, setHiddenSidebarItems] = useState<Set<SidebarPreferenceKey>>(new Set())
  const [sidebarCustomizerOpen, setSidebarCustomizerOpen] = useState(false)
  const [matchday, setMatchday] = useState<MatchdayPulse | null>(null)

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem('matchday:sidebar-collapsed') === 'true') } catch {}
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value
      try { window.localStorage.setItem('matchday:sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setProfile(null); setLeaguesReady(false); return }
        const [{ data }, leagues] = await Promise.all([
          supabase.from('profiles').select('username, avatar_url, is_admin, theme, colorblind, colorblind_scope, sidebar_preferences').eq('id', user.id).single(),
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
          setHiddenSidebarItems(readHiddenSidebarItems(p.sidebar_preferences))
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
    setProfileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!profileMenuOpen) return
    function handler(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileMenuOpen])

  // One cached, compact read powers the navigation status; it does not make a
  // provider request and avoids refetching whenever the user moves between
  // pages in the shell.
  useEffect(() => {
    if (!profile || !activeLeague) { setMatchday(null); return }
    let cancelled = false
    async function loadPulse() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const cacheKey = `matchday:navigation-pulse:${user.id}`
        const cached = sessionStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached) as { at: number; value: MatchdayPulse }
          if (Date.now() - parsed.at < 45_000) { if (!cancelled) setMatchday(parsed.value); return }
        }
        const [{ data: matches, error: matchesError }, { data: picks, error: picksError }] = await Promise.all([
          supabase.from('matches').select('id, match_date, gw_number, real_home_score, real_away_score, fifa_status'),
          supabase.from('predictions').select('match_id, pred_home, pred_away').eq('user_id', user.id),
        ])
        if (matchesError || picksError) return
        const predicted = new Set((picks ?? []).filter((pick) => pick.pred_home != null && pick.pred_away != null).map((pick) => pick.match_id))
        const now = Date.now()
        const liveMatches = (matches ?? []).filter((match) => {
          const kickoff = new Date(match.match_date).getTime()
          return match.real_home_score == null && (/live|in.?progress|half/i.test(match.fifa_status ?? '') || (kickoff <= now && kickoff > now - 4 * 3600_000))
        })
        const relevant = (matches ?? []).filter((match) => match.gw_number != null)
        const inProgress = relevant.filter((match) => match.real_home_score == null && new Date(match.match_date).getTime() <= now)
        const next = relevant.filter((match) => match.real_home_score == null && new Date(match.match_date).getTime() > now).sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date))[0]
        const latestScored = relevant.filter((match) => match.real_home_score != null).map((match) => match.gw_number ?? 0)
        const gameweek = inProgress[0]?.gw_number ?? next?.gw_number ?? (latestScored.length ? Math.max(...latestScored) : null)
        const weekMatches = gameweek ? relevant.filter((match) => match.gw_number === gameweek) : []
        const value = {
          missingPicks: (matches ?? []).filter((match) => match.real_home_score == null && new Date(match.match_date).getTime() > now && !predicted.has(match.id)).length,
          liveMatches: liveMatches.length,
          gameweek,
          recapReady: weekMatches.length > 0 && weekMatches.every((match) => match.real_home_score != null),
        }
        sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), value }))
        if (!cancelled) setMatchday(value)
      } catch { /* Navigation stays useful if this optional signal cannot load. */ }
    }
    void loadPulse()
    return () => { cancelled = true }
  }, [activeLeague, profile, supabase])

  if (isBare) return <MotionConfig reducedMotion="user">{children}<Toaster position="bottom-center" richColors /></MotionConfig>

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  // Mobile navigation and the command palette always retain the whole app.
  // Desktop customisation is a decluttering preference, never an access gate.
  const primaryItems = SIDEBAR.filter((it) => !it.admin || profile?.is_admin)
  const utilityItems = UTILITY
  const items = primaryItems.filter((it) => !it.preferenceKey || !hiddenSidebarItems.has(it.preferenceKey) || isActive(it.href))
  const visibleUtilityItems = utilityItems.filter((it) => !it.preferenceKey || !hiddenSidebarItems.has(it.preferenceKey) || isActive(it.href))
  const customizableItems = [...primaryItems, ...utilityItems].filter((it): it is NavItem & { preferenceKey: SidebarPreferenceKey } => Boolean(it.preferenceKey))
  const mobileItems = [...primaryItems, ...utilityItems, { href: '/join', label: 'Join League', icon: TrophyIcon }]
  const openCommandPalette = () => window.dispatchEvent(new Event('matchday:open-command-palette'))

  const saveSidebarPreferences = async (hidden: Set<SidebarPreferenceKey>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const hiddenValues = [...hidden]
    const { error } = await supabase.from('profiles').update({ sidebar_preferences: { version: 1, hidden: hiddenValues } }).eq('id', user.id)
    if (error) {
      toast.error('Could not save sidebar preferences')
      return false
    }
    setHiddenSidebarItems(new Set(hiddenValues))
    setProfile((previous) => previous ? { ...previous, sidebar_preferences: { version: 1, hidden: hiddenValues } } : previous)
    return true
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <MotionConfig reducedMotion="user">
    <ActiveLeagueProvider value={providerValue}>
    <div className="min-h-screen bg-bg text-textp" style={accentStyle}>
      {/* Desktop sidebar: a compactable matchday control rail. */}
      <aside className={`hidden lg:flex flex-col fixed inset-y-0 left-0 border-r border-border bg-surface z-30 transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-60'}`}>
        <div className={`h-16 flex items-center border-b border-border ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-5'}`}>
          <Link href="/dashboard" aria-label="MatchDay home" className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
            <Logo />
            {!collapsed && <span className="font-extrabold tracking-tight">MATCHDAY</span>}
          </Link>
          {!collapsed && <button onClick={toggleCollapsed} className="ml-auto h-7 w-7 rounded-lg text-texts hover:bg-surface2 hover:text-textp" title="Collapse sidebar" aria-label="Collapse sidebar">‹</button>}
        </div>
        {collapsed ? (
          <div className="px-3 pt-3"><button onClick={toggleCollapsed} className="grid h-10 w-full place-items-center rounded-xl border border-border bg-card text-texts hover:text-textp" title="Expand sidebar" aria-label="Expand sidebar">›</button></div>
        ) : activeLeague && (
          <div className="px-3 pt-3"><LeagueSwitcher leagues={myLeagues} active={activeLeague} onSwitch={switchLeague} /></div>
        )}
        <nav className={`flex-1 ${collapsed ? 'p-3 space-y-2' : 'p-3 space-y-1'} overflow-y-auto no-scrollbar`}>
          {items.map((it, i) => {
            const Ic = it.icon
            const active = isActive(it.href)
            const showSection = !collapsed && it.section && it.section !== items[i - 1]?.section
            const recapBadge = it.href === '/recap' && matchday?.recapReady
            const fixtureBadge = it.href === '/predictions' && (matchday?.missingPicks ?? 0) > 0
            return (
              <Fragment key={it.href}>
                {showSection && <div className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-faint">{it.section}</div>}
                <Link href={it.href} title={collapsed ? it.label : undefined} className={`w-full flex items-center ${collapsed ? 'justify-center h-10 px-2' : 'gap-3 h-11 px-3'} rounded-xl font-bold text-sm transition-all border ${active ? 'bg-accent/[0.10] border-accent/[0.22] text-accent' : 'text-texts hover:text-textp hover:bg-surface2 border-transparent'}`}>
                  <span className="relative"><Ic size={20} className={active ? 'text-accent' : ''} />{collapsed && (recapBadge || fixtureBadge) && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-gold ring-2 ring-surface" />}</span>
                  {!collapsed && <><span className="flex-1">{it.label}</span>{it.admin ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold">ADMIN</span> : recapBadge ? <span className="text-[9px] font-bold text-primary">NEW</span> : fixtureBadge ? <span className="grid min-w-5 h-5 place-items-center rounded-full bg-gold/15 px-1 text-[10px] text-gold">{matchday?.missingPicks}</span> : null}</>}
                </Link>
              </Fragment>
            )
          })}
        </nav>
        <div className="border-t border-border p-3 relative" ref={profileMenuRef}>
          {profileMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-border bg-card shadow-2xl overflow-hidden z-50">
              <div className="p-1.5 space-y-0.5">
                <Link href="/profile" className="flex h-9 items-center gap-3 rounded-lg px-3 text-xs font-bold text-textp hover:bg-surface2">
                  <UserIcon size={16} className="text-texts" />
                  Profile
                </Link>
                {visibleUtilityItems.filter((it) => it.href !== '/profile').map((it) => {
                  const Ic = it.icon
                  return (
                    <Link key={it.href} href={it.href} className="flex h-9 items-center gap-3 rounded-lg px-3 text-xs font-bold text-textp hover:bg-surface2">
                      <Ic size={16} className="text-texts" />
                      {it.label}
                    </Link>
                  )
                })}
                <button onClick={() => { setSidebarCustomizerOpen(true); setProfileMenuOpen(false) }} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-xs font-bold text-textp hover:bg-surface2">
                  <span className="grid h-4 w-4 place-items-center rounded border border-texts text-[10px] text-texts">⋯</span>
                  Customize sidebar
                </button>
              </div>
              <div className="border-t border-border p-1.5">
                <button onClick={logout} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-xs font-bold text-coral hover:bg-coral/10">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Log out
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => setProfileMenuOpen((v) => !v)}
            title={collapsed ? profile?.username ?? 'Account' : undefined}
            className={`w-full flex items-center ${collapsed ? 'justify-center p-2' : 'gap-3 p-2.5'} rounded-xl hover:bg-surface2 transition-colors ${profileMenuOpen ? 'bg-surface2' : ''}`}
          >
            <Avatar name={profile?.username ?? '?'} src={profile?.avatar_url} size={collapsed ? 32 : 36} />
            {!collapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-bold text-sm truncate">{profile?.username ?? 'Account'}</div>
                </div>
                <ChevDown size={14} className={`text-texts shrink-0 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-60'}`}>
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-bg/90 backdrop-blur-md">
          <div className="h-full max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <Logo size={26} />
              <span className="font-extrabold tracking-tight text-sm">MATCHDAY</span>
            </Link>
            <div className="hidden lg:flex items-center gap-3.5 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-texts whitespace-nowrap">World Cup 2026</span>
              {matchday?.gameweek && <span className="h-5 border-l border-border" />}
              {matchday?.gameweek && <span className="text-xs font-bold text-textp whitespace-nowrap">GW{matchday.gameweek}{matchday.liveMatches ? ` · ${matchday.liveMatches} live` : ''}</span>}
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5">
              <button onClick={openCommandPalette} className="hidden lg:flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-texts hover:text-textp hover:border-texts/40" aria-label="Open command palette"><span>⌕</span><kbd className="text-[10px]">⌘ K</kbd></button>
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
      <SidebarCustomizer
        open={sidebarCustomizerOpen}
        onClose={() => setSidebarCustomizerOpen(false)}
        items={customizableItems}
        hidden={hiddenSidebarItems}
        onSave={saveSidebarPreferences}
      />
      <Toaster position="bottom-center" richColors />
      <CommandPalette
        commands={[
          { id: 'action:predict', label: 'Make your next prediction', hint: 'Action', run: () => router.push('/predictions') },
          ...(matchday?.recapReady && matchday.gameweek ? [{ id: `action:recap:${matchday.gameweek}`, label: `Open GW${matchday.gameweek} recap`, hint: 'Action', run: () => router.push(`/recap?gw=${matchday.gameweek}`) }] : []),
          ...primaryItems.map((it) => ({ id: `nav:${it.href}`, label: it.label, hint: 'Page', run: () => router.push(it.href) })),
          ...utilityItems.map((it) => ({ id: `utility:${it.href}`, label: it.label, hint: 'Utility', run: () => router.push(it.href) })),
          ...myLeagues.map((l) => ({ id: `lg:${l.id}`, label: `Switch to ${l.name}`, hint: 'League', run: () => switchLeague(l.id) })),
        ]}
      />
    </div>
    </ActiveLeagueProvider>
    </MotionConfig>
  )
}

function SidebarCustomizer({
  open, onClose, items, hidden, onSave,
}: {
  open: boolean
  onClose: () => void
  items: Array<NavItem & { preferenceKey: SidebarPreferenceKey }>
  hidden: Set<SidebarPreferenceKey>
  onSave: (hidden: Set<SidebarPreferenceKey>) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<Set<SidebarPreferenceKey>>(new Set(hidden))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(new Set(hidden))
  }, [hidden, open])

  const toggle = (key: SidebarPreferenceKey, visible: boolean) => {
    setDraft((current) => {
      const next = new Set(current)
      if (visible) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const saved = await onSave(draft)
    setSaving(false)
    if (saved) {
      toast.success('Desktop sidebar saved')
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Customize desktop sidebar" maxWidth="max-w-md">
      <div className="space-y-4 p-5">
        <div>
          <p className="text-sm font-bold text-textp">Keep your matchday rail focused.</p>
          <p className="mt-1 text-xs leading-relaxed text-texts">This only changes the desktop sidebar. Home stays pinned, while mobile navigation and Jump to… always keep every page available.</p>
        </div>
        <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const Icon = item.icon
            const visible = !draft.has(item.preferenceKey)
            return (
              <label key={item.preferenceKey} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm transition hover:border-texts/35">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) => toggle(item.preferenceKey, event.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--primary))]"
                />
                <Icon size={17} className="text-texts" />
                <span className="flex-1 font-bold text-textp">{item.label}</span>
                <span className={`text-[10px] font-bold ${visible ? 'text-primary' : 'text-faint'}`}>{visible ? 'Shown' : 'Hidden'}</span>
              </label>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button size="sm" variant="ghost" onClick={() => setDraft(new Set())}>Show all</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save sidebar'}</Button>
        </div>
      </div>
    </Modal>
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
          <button type="button" aria-label="Close league switcher" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
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
