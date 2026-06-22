'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import {
  Card, Pill, Button, ScoreStepper, Avatar, Skeleton,
  LockIcon, Countdown, EmptyState, ChevDown,
} from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { type DBMatch } from '@/lib/match-ui'
import { POINTS, weightedMatchPoints, DEFAULT_WEIGHTS, type MatchBreakdown, type ScoringWeights } from '@/lib/scoring'
import { getActiveLeague } from '@/lib/league'
import { PlayerCardPicker, type PlayerForPicker } from '@/components/PlayerCardPicker'
import { fmtDateTime } from '@/lib/date-format'
import { AddMatchToCalendar } from '@/components/AddMatchToCalendar'
import { MatchLineups } from '@/components/MatchLineups'
import { LeagueRead } from '@/components/LeagueRead'
import { TeamLink } from '@/components/TeamLink'
import { MatchFacts, type StoredPlayerStats, type StoredTeamStats } from '@/components/MatchFacts'

interface OtherPred extends MatchBreakdown {
  user_id: string
  pred_home: number
  pred_away: number
  pred_first_goal_team: string | null
  pred_first_scorer_id: number | null
  pred_no_scorer: boolean | null
  pred_btts: boolean | null
  pred_total_goals: number | null
  pred_goal_diff: number | null
  points_awarded: number | null
  profiles: { username: string; avatar_url: string | null } | null
}

type SectionKey = 'lineups' | 'pulse' | 'stats' | 'picks'
type MobileTab = 'lineups' | 'pulse' | 'stats' | 'picks' | 'predict'

const SECTION_LABELS: Record<SectionKey, string> = {
  lineups: 'Match Centre',
  stats: 'Match Stats',
  pulse: 'League Pulse',
  picks: "Everyone's Picks",
}

// Ordered as displayed
const DESKTOP_SECTION_ORDER: SectionKey[] = ['lineups', 'stats', 'pulse', 'picks']

const SECTION_ICON_COLOR: Record<SectionKey, string> = {
  lineups: 'text-primary bg-primary/[0.12]',
  stats: 'text-gold bg-gold/[0.12]',
  pulse: 'text-blue bg-blue/[0.12]',
  picks: 'text-primary bg-primary/[0.12]',
}

const SECTION_ICONS: Record<SectionKey, React.ReactNode> = {
  lineups: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 9a3 3 0 0 0 0 6"/>
    </svg>
  ),
  stats: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="14" y="6" width="3" height="11"/>
    </svg>
  ),
  pulse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 4-5"/>
    </svg>
  ),
  picks: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
}

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial } catch { return initial }
  })
  const set = (v: T) => { setValue(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* noop */ } }
  return [value, set]
}

export default function MatchDetailPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [match, setMatch] = useState<DBMatch | null>(null)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [allowGdManual, setAllowGdManual] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [h, setH] = useState<number | null>(null)
  const [a, setA] = useState<number | null>(null)
  const [firstTeam, setFirstTeam] = useState<string | null>(null)
  const [scorerId, setScorerId] = useState<number | 'none' | null>(null)
  const [predTotalGoals, setPredTotalGoals] = useState<number | null>(null)
  const [predGoalDiff, setPredGoalDiff] = useState<number | null>(null)
  const [predBtts, setPredBtts] = useState<boolean | null>(null)
  const [tgManual, setTgManual] = useState(false)
  const [gdManual, setGdManual] = useState(false)
  const [bttsManual, setBttsManual] = useState(false)
  const [players, setPlayers] = useState<PlayerForPicker[]>([])
  const [teamStats, setTeamStats] = useState<StoredTeamStats[]>([])
  const [playerStats, setPlayerStats] = useState<StoredPlayerStats[]>([])
  const [others, setOthers] = useState<OtherPred[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [revealPredictions, setRevealPredictions] = useState(false)
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const matchDate = match?.match_date ?? null

  // Collapsible open state — persisted per-session in localStorage
  const [open, setOpen] = useLocalStorage<Record<SectionKey, boolean>>('match-sections', {
    lineups: true,
    pulse: true,
    stats: true,
    picks: true,
  })

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<MobileTab>('lineups')
  const tabBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!matchDate) return
    const update = () => setSecsLeft(Math.max(0, (new Date(matchDate).getTime() - Date.now()) / 1000))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [matchDate])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        setUserId(user.id)

        const { data: m } = await supabase
          .from('matches')
          .select('*, rounds(name)')
          .eq('id', id)
          .single()
        if (!m) { setLoading(false); return }
        const dbm: DBMatch = { ...(m as DBMatch), round_name: (m as { rounds?: { name: string } }).rounds?.name ?? null }
        setMatch(dbm)

        const home = getTeam(dbm.home_team), away = getTeam(dbm.away_team)
        const [{ data: pl }, { data: matchTeamStats }, { data: matchPlayerStats }] = await Promise.all([
          supabase.from('players')
            .select('id, name, team_name, jersey_number, position')
            .in('team_name', [home.playerKey, away.playerKey])
            .order('jersey_number', { ascending: true, nullsFirst: false }),
          supabase.from('match_team_stats').select('team_code, stats').eq('match_id', id),
          supabase.from('match_player_stats').select('player_id, team_code, stats').eq('match_id', id),
        ])
        type PlRow = { id: number; name: string; team_name: string; jersey_number: number | null; position: string | null }
        setPlayers((pl ?? []).map((p) => {
          const { id, name, team_name, jersey_number, position } = p as PlRow
          return { id, name, jersey_number, position: position ?? null, team_code: team_name === home.playerKey ? dbm.home_team : dbm.away_team }
        }))
        setTeamStats((matchTeamStats ?? []) as unknown as StoredTeamStats[])
        setPlayerStats((matchPlayerStats ?? []) as unknown as StoredPlayerStats[])

        const { data: mine } = await supabase
          .from('predictions')
          .select('pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer')
          .eq('user_id', user.id).eq('match_id', id).maybeSingle()
        if (mine) {
          const p = mine as Record<string, unknown>
          setH(p.pred_home as number); setA(p.pred_away as number)
          setFirstTeam((p.pred_first_goal_team as string) ?? null)
          setScorerId(p.pred_no_scorer ? 'none' : ((p.pred_first_scorer_id as number) ?? null))
          if (p.pred_total_goals != null) { setPredTotalGoals(p.pred_total_goals as number); setTgManual(true) }
          if (p.pred_goal_diff != null) { setPredGoalDiff(p.pred_goal_diff as number); setGdManual(true) }
          if (p.pred_btts != null) { setPredBtts(p.pred_btts as boolean); setBttsManual(true) }
        }

        const { league, weights: leagueWeights, allowGdManual: gdManualAllowed, memberIds } = await getActiveLeague(supabase, user.id)
        setWeights(leagueWeights)
        setAllowGdManual(gdManualAllowed)
        setRevealPredictions(league?.reveal_predictions === true)

        const predSelect = 'user_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_no_scorer, pred_btts, pred_total_goals, pred_goal_diff, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'
        const predBase = supabase.from('predictions').select(predSelect).eq('match_id', id)
        const { data: predRows } = await (memberIds.length ? predBase.in('user_id', memberIds) : predBase)

        const predUserIds = (predRows ?? []).map((p) => (p as { user_id: string }).user_id)
        const profileMap = new Map<string, { username: string; avatar_url: string | null }>()
        if (predUserIds.length) {
          const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', predUserIds)
          for (const pr of profs ?? []) {
            const row = pr as { id: string; username: string; avatar_url: string | null }
            profileMap.set(row.id, { username: row.username, avatar_url: row.avatar_url })
          }
        }

        setOthers((predRows ?? []).map((p) => ({
          ...p,
          profiles: profileMap.get((p as { user_id: string }).user_id) ?? null,
        })) as unknown as OtherPred[])
        setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load match')
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!tgManual && h != null && a != null) setPredTotalGoals(h + a)
  }, [h, a, tgManual])

  useEffect(() => {
    if (!gdManual && h != null && a != null) setPredGoalDiff(h - a)
  }, [h, a, gdManual])

  useEffect(() => {
    if (!bttsManual && h != null && a != null) setPredBtts(h > 0 && a > 0)
  }, [h, a, bttsManual])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (error) return <EmptyState title="Couldn't load match" desc={error} />
  if (!match) return <EmptyState title="Match not found" desc="This fixture doesn't exist." />

  const home = getTeam(match.home_team), away = getTeam(match.away_team)
  const scored = match.real_home_score !== null && match.real_away_score !== null
  const fifaMeta = (match as { fifa_metadata?: Record<string, unknown> }).fifa_metadata
  const fifaScore = fifaMeta?.score as { home?: number | null; away?: number | null } | undefined
  const displayHomeScore = match.real_home_score ?? fifaScore?.home ?? null
  const displayAwayScore = match.real_away_score ?? fifaScore?.away ?? null
  const hasLiveScore = displayHomeScore !== null && displayAwayScore !== null
  const penaltyHome = fifaMeta?.penaltyHome != null ? Number(fifaMeta.penaltyHome) : null
  const penaltyAway = fifaMeta?.penaltyAway != null ? Number(fifaMeta.penaltyAway) : null
  const hasPenalties = penaltyHome != null && penaltyAway != null
  const homeFormation = (match as { home_formation?: string | null }).home_formation ?? null
  const awayFormation = (match as { away_formation?: string | null }).away_formation ?? null
  const locked = scored || match.is_locked || (secsLeft !== null ? secsLeft <= 0 : new Date(match.match_date) <= new Date())
  const knockout = !match.group_name
  const canSubmit = h != null && a != null && !locked
  const showPulse = (locked || revealPredictions) && others.length > 0
  const showPicks = locked && others.length > 0

  async function submit() {
    if (!userId || h == null || a == null) return
    setSaving(true)
    setJustSaved(true)
    const { error } = await supabase.from('predictions').upsert({
      user_id: userId, match_id: id,
      pred_home: h, pred_away: a,
      pred_first_goal_team: firstTeam,
      pred_first_scorer_id: typeof scorerId === 'number' && scorerId !== -1 ? scorerId : null,
      pred_no_scorer: scorerId === 'none',
      pred_total_goals: predTotalGoals,
      pred_goal_diff: allowGdManual ? predGoalDiff : null,
      pred_btts: bttsManual ? predBtts : null,
    }, { onConflict: 'user_id,match_id' })
    setSaving(false)
    if (error) {
      setJustSaved(false)
      toast.error(`Couldn't save: ${error.message}`)
      return
    }
    toast.success(`Prediction locked in — ${home.code} ${h}–${a} ${away.code}`)
    setTimeout(() => setJustSaved(false), 2000)
  }

  function toggleSection(key: SectionKey) {
    setOpen({ ...open, [key]: !open[key] })
  }

  function collapseAll() {
    const allOpen = Object.values(open).every(Boolean)
    const next = { lineups: !allOpen, pulse: !allOpen, stats: !allOpen, picks: !allOpen }
    setOpen(next)
  }

  const allOpen = Object.values(open).every(Boolean)

  const stageLabel = knockout ? (match.round_name ?? 'Knockout') : `Group ${match.group_name ?? ''}`.trim()
  const venueCity = [fifaMeta?.city, fifaMeta?.country].filter(Boolean).join(', ')
  const venue = fifaMeta?.venue as string | undefined

  // Mobile tabs — only show Predict when unlocked, Picks/Pulse when available
  const mobileTabs: { key: MobileTab; label: string }[] = [
    { key: 'lineups', label: 'Lineups' },
    { key: 'stats', label: 'Stats' },
    ...(showPulse ? [{ key: 'pulse' as MobileTab, label: 'Pulse' }] : []),
    ...(showPicks ? [{ key: 'picks' as MobileTab, label: 'Picks' }] : []),
    ...(!locked ? [{ key: 'predict' as MobileTab, label: 'Predict' }] : []),
  ]

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Back button ── */}
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm font-bold text-texts hover:text-textp flex items-center gap-1 transition-colors"
      >
        ← Back
      </button>

      {/* ════════════════════════════════════════
          SCORE HERO
          ════════════════════════════════════════ */}
      <div
        className="rounded-2xl overflow-hidden border border-border mb-4"
        style={{ background: 'linear-gradient(180deg, rgba(var(--primary),0.06), transparent 60%), rgb(var(--card))' }}
      >
        {/* Stage + status row */}
        <div className="flex items-center justify-center gap-2 px-5 pt-4 pb-0">
          <Pill tone={knockout ? 'gold' : 'default'}>{stageLabel}</Pill>
          {scored && <Pill tone="green">Full time</Pill>}
          {!scored && hasLiveScore && <Pill tone="gold">Live</Pill>}
        </div>

        {/* Main score row */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 gap-3 sm:gap-6">
          {/* Home team */}
          <TeamLink code={match.home_team} className="flex-1 flex flex-col items-center gap-2 min-w-0 hover:opacity-75 transition-opacity">
            <FlagChip code={match.home_team} w={56} h={38} r={7} />
            <span className="font-extrabold text-textp text-center leading-tight text-sm sm:text-base">{home.name}</span>
          </TeamLink>

          {/* Score center */}
          <div className="flex flex-col items-center shrink-0">
            {hasLiveScore ? (
              <>
                <div className="flex items-center gap-2 sm:gap-4">
                  <span
                    className="tabular-nums font-black leading-none"
                    style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontFamily: 'Schibsted Grotesk, sans-serif', letterSpacing: '-0.03em' }}
                  >
                    {displayHomeScore}
                  </span>
                  <span className="text-faint font-semibold text-2xl sm:text-4xl">–</span>
                  <span
                    className="tabular-nums font-black leading-none"
                    style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontFamily: 'Schibsted Grotesk, sans-serif', letterSpacing: '-0.03em' }}
                  >
                    {displayAwayScore}
                  </span>
                </div>
                {hasPenalties && (
                  <div className="text-[11px] text-texts font-bold mt-0.5">
                    ({penaltyHome}–{penaltyAway} pens)
                  </div>
                )}
              </>
            ) : (
              <div
                className="font-black text-texts"
                style={{ fontSize: 'clamp(2rem, 7vw, 3.5rem)', fontFamily: 'Schibsted Grotesk, sans-serif' }}
              >
                VS
              </div>
            )}
            <div className="text-[11px] text-texts font-semibold mt-1.5 text-center">{fmtDateTime(match.match_date)}</div>
            {(homeFormation || awayFormation) && (
              <div className="text-[10px] text-faint font-bold mt-0.5 tabular-nums">
                {homeFormation ?? '?'} · {awayFormation ?? '?'}
              </div>
            )}
          </div>

          {/* Away team */}
          <TeamLink code={match.away_team} className="flex-1 flex flex-col items-center gap-2 min-w-0 hover:opacity-75 transition-opacity">
            <FlagChip code={match.away_team} w={56} h={38} r={7} />
            <span className="font-extrabold text-textp text-center leading-tight text-sm sm:text-base">{away.name}</span>
          </TeamLink>
        </div>

        {/* Venue + lock status */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 pb-4 pt-2 text-[11px] font-semibold text-texts border-t border-border/60 mt-2">
          {venue && <span>{venue}{venueCity ? ` · ${venueCity}` : ''}</span>}
          {locked
            ? <span className="flex items-center gap-1 text-error font-bold"><LockIcon size={12} /> Predictions locked</span>
            : <span className="flex items-center gap-1"><LockIcon size={12} className="text-gold" /> Locks in <Countdown kickoff={match.match_date} /></span>}
          {!scored && (
            <AddMatchToCalendar
              title={`${home.name} vs ${away.name}`}
              match={{
                id: match.id,
                match_date: match.match_date,
                home_team: match.home_team,
                away_team: match.away_team,
                group_name: match.group_name,
                gw_number: null,
                round_name: match.round_name ?? null,
              }}
            />
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════
          MOBILE: Horizontal tab bar
          ════════════════════════════════════════ */}
      <div className="sm:hidden">
        <div
          ref={tabBarRef}
          role="tablist"
          aria-label="Match details"
          className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-3"
        >
          {mobileTabs.map((t) => (
            <button
              key={t.key}
              id={`match-tab-${t.key}`}
              role="tab"
              aria-selected={mobileTab === t.key}
              aria-controls={`match-panel-${t.key}`}
              onClick={() => setMobileTab(t.key)}
              className={`shrink-0 h-8 px-4 rounded-full text-[12.5px] font-bold border transition-all ${
                mobileTab === t.key
                  ? 'bg-textp text-bg border-textp'
                  : 'bg-card border-border text-texts'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mobile tab content */}
        <div id={`match-panel-${mobileTab}`} role="tabpanel" aria-labelledby={`match-tab-${mobileTab}`} className="space-y-4">
          {mobileTab === 'lineups' && (
            <MatchLineups
              matchId={match.id}
              homeCode={match.home_team}
              awayCode={match.away_team}
              homeFormation={homeFormation}
              awayFormation={awayFormation}
              homeScore={displayHomeScore}
              awayScore={displayAwayScore}
            />
          )}
          {mobileTab === 'stats' && (
            <MatchFacts
              homeCode={match.home_team}
              awayCode={match.away_team}
              metadata={(match as { fifa_metadata?: unknown }).fifa_metadata}
              teamStats={teamStats}
              playerStats={playerStats}
              playerNames={new Map(players.map((p) => [p.id, p.name]))}
            />
          )}
          {mobileTab === 'pulse' && showPulse && (
            <LeagueRead
              homeName={home.name} awayName={away.name} homeCode={match.home_team} awayCode={match.away_team}
              picks={others} userId={userId}
              playerNames={new Map(players.map((p) => [p.id, p.name]))}
              actual={{ home: match.real_home_score, away: match.real_away_score, firstScorerId: (match as { first_goal_player_id?: number | null }).first_goal_player_id ?? null }}
            />
          )}
          {mobileTab === 'picks' && showPicks && (
            <PicksWall
              others={others} userId={userId} players={players} match={match}
              weights={weights}
            />
          )}
          {mobileTab === 'predict' && !locked && (
            <PredictForm
              match={match} home={home} away={away} locked={locked}
              h={h} setH={setH} a={a} setA={setA}
              firstTeam={firstTeam} setFirstTeam={setFirstTeam}
              scorerId={scorerId} setScorerId={setScorerId}
              predTotalGoals={predTotalGoals} setPredTotalGoals={setPredTotalGoals}
              predGoalDiff={predGoalDiff} setPredGoalDiff={setPredGoalDiff}
              predBtts={predBtts} setPredBtts={setPredBtts}
              tgManual={tgManual} setTgManual={setTgManual}
              gdManual={gdManual} setGdManual={setGdManual}
              bttsManual={bttsManual} setBttsManual={setBttsManual}
              allowGdManual={allowGdManual}
              players={players}
              saving={saving} justSaved={justSaved} canSubmit={canSubmit}
              onSubmit={submit}
            />
          )}
          {mobileTab === 'picks' && !showPicks && (
            <LockedPicksPlaceholder />
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════
          DESKTOP: Section tabs nav + collapsible cards
          ════════════════════════════════════════ */}
      <div className="hidden sm:block">
        {/* Section nav — clicking a label toggles that section */}
        <div className="flex items-center gap-0.5 border-b border-border mb-4">
          {DESKTOP_SECTION_ORDER
            .filter((k) => k !== 'pulse' || showPulse)
            .filter((k) => k !== 'picks' || showPicks || !locked)
            .map((k) => (
              <button
                key={k}
                onClick={() => toggleSection(k)}
                className={`px-3.5 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
                  open[k]
                    ? 'text-textp border-primary'
                    : 'text-faint border-transparent hover:text-texts'
                }`}
              >
                {SECTION_LABELS[k]}
              </button>
            ))}
          <div className="ml-auto pb-1">
            <button
              onClick={collapseAll}
              className="h-7 px-3 rounded-lg border border-border bg-surface text-[11.5px] font-semibold text-texts hover:text-textp transition-colors"
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        </div>

        {/* Collapsible sections — ordered: lineups → stats → pulse → picks */}
        <div className="space-y-3">
          {/* Match Centre (Lineups) */}
          <CollapsibleSection
            sectionKey="lineups"
            open={open.lineups}
            onToggle={() => toggleSection('lineups')}
            title="Match Centre"
            sub={homeFormation && awayFormation ? `${home.code} ${homeFormation} · ${away.code} ${awayFormation} · lineups & substitutes` : 'Lineups & substitutes'}
          >
            <MatchLineups
              matchId={match.id}
              homeCode={match.home_team}
              awayCode={match.away_team}
              homeFormation={homeFormation}
              awayFormation={awayFormation}
              homeScore={displayHomeScore}
              awayScore={displayAwayScore}
            />
          </CollapsibleSection>

          {/* Match Stats */}
          <CollapsibleSection
            sectionKey="stats"
            open={open.stats}
            onToggle={() => toggleSection('stats')}
            title="Match Stats"
            sub="Goals, shots, xG, possession and more"
          >
            <MatchFacts
              homeCode={match.home_team}
              awayCode={match.away_team}
              metadata={(match as { fifa_metadata?: unknown }).fifa_metadata}
              teamStats={teamStats}
              playerStats={playerStats}
              playerNames={new Map(players.map((p) => [p.id, p.name]))}
            />
          </CollapsibleSection>

          {/* League Pulse */}
          {showPulse && (
            <CollapsibleSection
              sectionKey="pulse"
              open={open.pulse}
              onToggle={() => toggleSection('pulse')}
              title="League Pulse"
              sub={`How ${others.length} league pick${others.length !== 1 ? 's' : ''} are shaping up`}
            >
              <LeagueRead
                homeName={home.name} awayName={away.name} homeCode={match.home_team} awayCode={match.away_team}
                picks={others} userId={userId}
                playerNames={new Map(players.map((p) => [p.id, p.name]))}
                actual={{ home: match.real_home_score, away: match.real_away_score, firstScorerId: (match as { first_goal_player_id?: number | null }).first_goal_player_id ?? null }}
              />
            </CollapsibleSection>
          )}

          {/* Prediction form — only pre-kickoff */}
          {!locked && (
            <CollapsibleSection
              sectionKey="picks"
              open={open.picks}
              onToggle={() => toggleSection('picks')}
              title="Your prediction"
              sub="Set the exact scoreline. Bonus points for first goal & scorer."
            >
              <PredictForm
                match={match} home={home} away={away} locked={locked}
                h={h} setH={setH} a={a} setA={setA}
                firstTeam={firstTeam} setFirstTeam={setFirstTeam}
                scorerId={scorerId} setScorerId={setScorerId}
                predTotalGoals={predTotalGoals} setPredTotalGoals={setPredTotalGoals}
                predGoalDiff={predGoalDiff} setPredGoalDiff={setPredGoalDiff}
                predBtts={predBtts} setPredBtts={setPredBtts}
                tgManual={tgManual} setTgManual={setTgManual}
                gdManual={gdManual} setGdManual={setGdManual}
                bttsManual={bttsManual} setBttsManual={setBttsManual}
                allowGdManual={allowGdManual}
                players={players}
                saving={saving} justSaved={justSaved} canSubmit={canSubmit}
                onSubmit={submit}
                inCard={false}
              />
            </CollapsibleSection>
          )}

          {/* Everyone's picks — post-kickoff */}
          {showPicks ? (
            <CollapsibleSection
              sectionKey="picks"
              open={open.picks}
              onToggle={() => toggleSection('picks')}
              title="Everyone's picks"
              sub={`${others.length} league member${others.length !== 1 ? 's' : ''} predicted this match`}
            >
              <PicksWall
                others={others} userId={userId} players={players} match={match}
                weights={weights}
              />
            </CollapsibleSection>
          ) : locked ? null : (
            <CollapsibleSection
              sectionKey="picks"
              open={open.picks}
              onToggle={() => toggleSection('picks')}
              title="League predictions"
              sub="Hidden until kickoff to keep it fair."
            >
              <LockedPicksPlaceholder />
            </CollapsibleSection>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Collapsible section wrapper ─────────────────────────────────────── */
function CollapsibleSection({
  sectionKey, open, onToggle, title, sub, children,
}: {
  sectionKey: SectionKey
  open: boolean
  onToggle: () => void
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface/40 transition-colors text-left"
        aria-expanded={open}
      >
        {/* Icon */}
        <span className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${SECTION_ICON_COLOR[sectionKey]}`}>
          {SECTION_ICONS[sectionKey]}
        </span>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-textp text-[15px]" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>
            {title}
          </div>
          {sub && <div className="text-[11.5px] text-faint font-medium mt-0.5">{sub}</div>}
        </div>

        {/* Chevron */}
        <span
          className="text-faint transition-transform duration-200 shrink-0 inline-flex"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <ChevDown size={18} />
        </span>
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 sm:p-5">
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Prediction form (extracted) ─────────────────────────────────────── */
function PredictForm({
  match, home, away,
  h, setH, a, setA,
  firstTeam, setFirstTeam,
  scorerId, setScorerId,
  predTotalGoals, setPredTotalGoals,
  predGoalDiff, setPredGoalDiff,
  predBtts, setPredBtts,
  tgManual, setTgManual,
  gdManual, setGdManual,
  bttsManual, setBttsManual,
  allowGdManual,
  players,
  saving, justSaved, canSubmit,
  onSubmit,
  inCard = true,
}: {
  match: DBMatch
  home: ReturnType<typeof getTeam>
  away: ReturnType<typeof getTeam>
  locked: boolean
  h: number | null; setH: (v: number | null) => void
  a: number | null; setA: (v: number | null) => void
  firstTeam: string | null; setFirstTeam: (v: string | null) => void
  scorerId: number | 'none' | null; setScorerId: (v: number | 'none' | null) => void
  predTotalGoals: number | null; setPredTotalGoals: (v: number | null) => void
  predGoalDiff: number | null; setPredGoalDiff: (v: number | null) => void
  predBtts: boolean | null; setPredBtts: (v: boolean | null) => void
  tgManual: boolean; setTgManual: (v: boolean) => void
  gdManual: boolean; setGdManual: (v: boolean) => void
  bttsManual: boolean; setBttsManual: (v: boolean) => void
  allowGdManual: boolean
  players: PlayerForPicker[]
  saving: boolean; justSaved: boolean; canSubmit: boolean
  onSubmit: () => void
  inCard?: boolean
}) {
  const content = (
    <>
      <div className="flex items-center justify-center gap-4 sm:gap-7 py-3">
        <div className="flex flex-col items-center gap-2">
          <FlagChip code={match.home_team} w={40} h={27} r={6} />
          <ScoreStepper value={h} onChange={setH} />
        </div>
        <span className="text-2xl font-black text-texts mt-7">:</span>
        <div className="flex flex-col items-center gap-2">
          <FlagChip code={match.away_team} w={40} h={27} r={6} />
          <ScoreStepper value={a} onChange={setA} />
        </div>
      </div>

      {h != null && a != null && (
        <div className="mt-4 space-y-2">
          <div className={`grid gap-2 ${allowGdManual ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border/60">
              <p className="text-[9px] font-bold uppercase tracking-wider text-texts">Total goals</p>
              <ScoreStepper
                value={predTotalGoals}
                onChange={(v) => { setPredTotalGoals(v); setTgManual(v !== h + a) }}
                compact min={0} max={30}
              />
              {tgManual && predTotalGoals !== h + a ? (
                <button onClick={() => { setTgManual(false); setPredTotalGoals(h + a) }} className="text-[9px] text-primary">↺ Auto</button>
              ) : (
                <p className="text-[9px] text-texts">+{POINTS.totalGoals} if correct</p>
              )}
            </div>
            <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border/60">
              <p className="text-[9px] font-bold uppercase tracking-wider text-texts">Both score</p>
              {(() => {
                const derived = h > 0 && a > 0
                const eff = bttsManual ? predBtts : derived
                return (
                  <>
                    <div className="flex gap-1">
                      {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map((o) => (
                        <button
                          key={o.l}
                          onClick={() => { setPredBtts(o.v); setBttsManual(o.v !== derived) }}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all ${eff === o.v ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-card text-texts'}`}
                        >{o.l}</button>
                      ))}
                    </div>
                    {bttsManual && predBtts !== derived ? (
                      <button onClick={() => { setBttsManual(false); setPredBtts(derived) }} className="text-[9px] text-primary">↺ Auto</button>
                    ) : (
                      <p className="text-[9px] text-texts">+{POINTS.btts} if correct</p>
                    )}
                  </>
                )
              })()}
            </div>
            {allowGdManual && (
              <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border/60">
                <p className="text-[9px] font-bold uppercase tracking-wider text-texts">Goal diff</p>
                <ScoreStepper
                  value={predGoalDiff}
                  onChange={(v) => { setPredGoalDiff(v); setGdManual(v !== h - a) }}
                  compact min={-20} max={20}
                />
                {gdManual && predGoalDiff !== h - a ? (
                  <button onClick={() => { setGdManual(false); setPredGoalDiff(h - a) }} className="text-[9px] text-primary">↺ Auto</button>
                ) : (
                  <p className="text-[9px] text-texts">+{POINTS.goalDiff} if correct</p>
                )}
              </div>
            )}
          </div>
          {((tgManual && predTotalGoals !== h + a) || (gdManual && predGoalDiff !== h - a) || (bttsManual && predBtts !== (h > 0 && a > 0))) && (
            <p className="text-[10px] text-gold text-center font-medium">Custom overrides active — earn pts even if your score is wrong</p>
          )}
        </div>
      )}

      <div className="mt-5">
        <label className="text-xs font-bold uppercase tracking-wider text-texts">
          First goal <span className="text-primary normal-case">+{POINTS.firstTeam}</span>
        </label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[{ k: match.home_team, l: home.code }, { k: 'NONE', l: 'No goal' }, { k: match.away_team, l: away.code }].map((o) => (
            <button
              key={o.k}
              onClick={() => setFirstTeam(firstTeam === o.k ? null : o.k)}
              className={`h-11 rounded-xl border font-bold text-sm transition-all ${firstTeam === o.k ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-surface text-texts hover:text-textp'}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <PlayerCardPicker
          players={players}
          value={scorerId}
          onChange={setScorerId}
          pts={POINTS.firstScorer}
        />
      </div>

      <Button
        variant={justSaved ? 'gold' : 'primary'}
        size="lg"
        className="w-full mt-6"
        disabled={!canSubmit || saving}
        onClick={onSubmit}
      >
        {justSaved ? '✓ Prediction saved!' : saving ? 'Saving…' : h != null && a != null ? `Lock in ${home.code} ${h}–${a} ${away.code}` : 'Set a scoreline first'}
      </Button>
    </>
  )

  if (!inCard) return content
  return <Card className="p-5 sm:p-6">{content}</Card>
}

/* ── Everyone's Picks wall ────────────────────────────────────────────── */
function PicksWall({
  others, userId, players, match, weights,
}: {
  others: OtherPred[]
  userId: string | null
  players: PlayerForPicker[]
  match: DBMatch
  weights: ScoringWeights
}) {
  const sorted = [...others].sort((a, b) => (b.points_awarded ?? -1) - (a.points_awarded ?? -1))

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {sorted.map((o) => {
        const isMe = o.user_id === userId
        const scoredPred = o.points_awarded != null
        const displayPts = scoredPred ? weightedMatchPoints(o, weights) : null
        const ptColor = displayPts != null
          ? displayPts >= 8 ? 'text-primary' : displayPts > 0 ? 'text-gold' : 'text-error'
          : 'text-texts'
        const firstGoalTeam = o.pred_first_goal_team
          ? (o.pred_first_goal_team === 'NONE' ? 'No goal' : getTeam(o.pred_first_goal_team)?.name ?? o.pred_first_goal_team)
          : null
        const firstScorerName = o.pred_no_scorer
          ? 'No scorer'
          : o.pred_first_scorer_id === -1
            ? 'Own goal'
            : o.pred_first_scorer_id
              ? (players.find((p) => p.id === o.pred_first_scorer_id)?.name ?? `#${o.pred_first_scorer_id}`)
              : null

        return (
          <div
            key={o.user_id}
            className={`p-4 rounded-2xl border transition-colors ${
              isMe
                ? 'border-primary/40 bg-primary/[0.05] ring-1 ring-primary/20'
                : 'border-border bg-surface'
            }`}
          >
            {/* Top row: avatar + name + points */}
            <div className="flex items-center gap-2.5 mb-3">
              <Avatar name={o.profiles?.username ?? '?'} src={o.profiles?.avatar_url} size={32} you={isMe} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13px] text-textp truncate">
                  {o.profiles?.username ?? '?'}
                  {isMe && (
                    <span className="ml-1.5 text-[9px] font-bold px-1.5 py-px rounded-full border border-primary/20 bg-primary/10 text-primary uppercase tracking-wide">
                      you
                    </span>
                  )}
                </div>
              </div>
              {scoredPred ? (
                <span className={`text-[15px] font-extrabold tabular-nums shrink-0 ${ptColor}`}
                  style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>
                  {displayPts != null && displayPts > 0 ? '+' : ''}{displayPts}
                </span>
              ) : (
                <span className="text-[11px] text-texts font-medium shrink-0">pending</span>
              )}
            </div>

            {/* Score row with flags */}
            {o.pred_home != null && o.pred_away != null ? (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  <FlagChip code={match.home_team} w={20} h={14} r={3} />
                  <span className="text-[17px] font-extrabold tabular-nums text-textp" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>
                    {o.pred_home}–{o.pred_away}
                  </span>
                  <FlagChip code={match.away_team} w={20} h={14} r={3} />
                </div>

                {/* Secondary details — all on one flex-wrap row */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {firstGoalTeam && (
                    <span className="text-[11px] text-texts font-medium">
                      1st: <span className="text-textp font-bold">{firstGoalTeam}</span>
                    </span>
                  )}
                  {o.pred_no_scorer ? (
                    <span className="text-[11px] text-faint font-medium italic">No scorer</span>
                  ) : firstScorerName && (
                    <span className="text-[11px] text-texts font-medium">
                      Scorer: <span className="text-textp font-semibold">{firstScorerName}</span>
                    </span>
                  )}
                  {o.pred_total_goals != null && (
                    <span className="text-[11px] text-texts font-medium">
                      Total: <span className="text-textp font-semibold">{o.pred_total_goals}</span>
                    </span>
                  )}
                  {o.pred_home != null && o.pred_away != null && (
                    <span className="text-[11px] text-texts font-medium">
                      BTTS: <span className="text-textp font-semibold">
                        {(o.pred_btts ?? (o.pred_home > 0 && o.pred_away > 0)) ? 'Yes' : 'No'}
                      </span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-[11px] text-texts italic">No prediction submitted</span>
            )}

            {/* Points breakdown */}
            {scoredPred && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/60">
                {[
                  { label: 'Outcome', val: o.pts_outcome, w: weights.outcome },
                  { label: 'Exact', val: o.pts_exact, w: weights.exact },
                  { label: 'GD', val: o.pts_goal_diff, w: weights.goalDiff },
                  { label: 'Goals', val: o.pts_total_goals, w: weights.totalGoals },
                  { label: 'Team goals', val: o.pts_team_goals, w: weights.teamGoals },
                  { label: 'BTTS', val: o.pts_btts, w: weights.btts },
                  { label: '1st team', val: o.pts_first_team, w: weights.firstTeam },
                  { label: '1st scorer', val: o.pts_first_scorer, w: weights.firstScorer },
                ].filter((r) => (r.val ?? 0) > 0 && r.w > 0).map((r) => (
                  <span
                    key={r.label}
                    className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20"
                  >
                    +{r.w} {r.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Locked picks placeholder ─────────────────────────────────────────── */
function LockedPicksPlaceholder() {
  return (
    <div className="relative">
      <div className="grid sm:grid-cols-2 gap-2 blur-sm select-none pointer-events-none opacity-60">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-surface border border-border">
            <Avatar name="?" size={28} />
            <span className="font-bold text-sm flex-1">Player {i + 1}</span>
            <span className="font-extrabold tabular-nums">2–1</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <Pill tone="default" icon={<LockIcon size={12} />}>Unlocks at kickoff</Pill>
      </div>
    </div>
  )
}
