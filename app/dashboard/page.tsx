'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import {
  Skeleton, BoltIcon, EmptyState, CalIcon,
  Pill, CountUp, Countdown, Avatar,
} from '@/components/ui'
import { type LBRow } from '@/components/football'
import RulesModal from '@/components/RulesModal'
import FlagChip from '@/components/FlagChip'
import { BarChart, RankLine, DonutChart } from '@/components/charts'
import PredictionModal from '@/components/PredictionModal'
import { aggregateLeaderboard, type ProfileLite, type ScoredGroupPred, type ScoredTournamentPred } from '@/lib/leaderboard'
import { getActiveLeague, isMoneyLeague } from '@/lib/league'
import { isKnockout, type DBMatch, type MyPred } from '@/lib/match-ui'
import { getTeam } from '@/lib/teams'
import { SCORING_RULES, weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { computePrizeSnapshot, formatPrize, prizeTone, GW_NAMES, GW_SHORT, GW_PRIZES, OVERALL_PRIZES } from '@/lib/prizes'
import { useAppBadge } from '@/lib/pwa'
import { fmtDateOnlyKey, fmtTime, getUserTimeZone } from '@/lib/date-format'

const SCORED_COLS = 'user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, matches(gw_number)'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }
interface ScoredPredRow {
  user_id: string; points_awarded: number
  pts_outcome: number | null; pts_exact: number | null; pts_goal_diff: number | null
  pts_total_goals: number | null; pts_team_goals: number | null; pts_btts: number | null
  pts_first_team: number | null; pts_first_scorer: number | null
  matches: { gw_number: number | null } | null
}
interface MatchGWRow { gw_number: number | null; real_home_score: number | null }
interface BannerItem { id: string; image_url: string; display_order: number }

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

interface RankSnapshot { rank: number; snapshot_at: string; gw_number: number | null }

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [lb, setLb] = useState<LBRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [hasTournamentPick, setHasTournamentPick] = useState(true)
  const [scoredPreds, setScoredPreds] = useState<ScoredPredRow[]>([])
  const [gwMatchRows, setGwMatchRows] = useState<MatchGWRow[]>([])
  const [prevRank, setPrevRank] = useState<number | null>(null)
  const [rankSnapshots, setRankSnapshots] = useState<RankSnapshot[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [isMoney, setIsMoney] = useState(false)
  const [leagueName, setLeagueName] = useState('')
  const [bracketEnabled, setBracketEnabled] = useState(true)
  const [bannersEnabled, setBannersEnabled] = useState(false)
  const [banners, setBanners] = useState<BannerItem[]>([])
  const [rulesOpen, setRulesOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Modal
  const [modalMatchId, setModalMatchId] = useState<string | null>(null)
  // Trajectory toggle
  const [trajMode, setTrajMode] = useState<'points' | 'rank'>('points')
  const [timeZone, setTimeZone] = useState('Asia/Singapore')

  // Refs so Realtime callbacks can refetch without stale closures
  const memberIdsRef = useRef<string[]>([])
  const memberProfilesRef = useRef<ProfileLite[]>([])
  const userIdRef = useRef<string | null>(null)
  const groupRowsRef = useRef<ScoredGroupPred[]>([])
  const tournRowsRef = useRef<ScoredTournamentPred[]>([])
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTimeZone(getUserTimeZone())
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        setUserId(user.id)

        const [{ data: roundData, error: roundErr }, { data: myData, error: myErr }] = await Promise.all([
          supabase.from('rounds').select('id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)').order('"order"').order('match_date', { referencedTable: 'matches' }),
          supabase.from('predictions').select('match_id, pred_home, pred_away, points_awarded, pts_exact, pts_outcome, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, pred_first_goal_team, pred_first_scorer_id').eq('user_id', user.id),
        ])
        if (roundErr) throw roundErr
        if (myErr) throw myErr

        const flat: DBMatch[] = []
        for (const r of (roundData ?? []) as unknown as RoundRow[]) {
          for (const m of r.matches ?? []) flat.push({ ...m, round_name: r.name })
        }
        setMatches(flat)

        const map: Record<string, MyPred> = {}
        for (const p of myData ?? []) map[(p as { match_id: string }).match_id] = p as unknown as MyPred
        setPreds(map)
        setLoading(false)

        const { league, weights: w, memberIds, memberProfiles } = await getActiveLeague(supabase, user.id)
        setWeights(w)
        setIsMoney(isMoneyLeague(league))
        setLeagueName(league?.name ?? '')
        setBracketEnabled(league?.bracket_enabled !== false)
        setBannersEnabled(league?.banners_enabled === true)

        const ids = memberIds.length ? memberIds : [user.id]
        memberIdsRef.current = ids
        memberProfilesRef.current = memberProfiles as ProfileLite[]
        userIdRef.current = user.id

        const [{ data: scored }, { data: gwMatches }, { data: groupP }, { data: tournP }, snapResult, bannerResult] = await Promise.all([
          supabase.from('predictions').select(SCORED_COLS).not('points_awarded', 'is', null).in('user_id', ids),
          supabase.from('matches').select('gw_number, real_home_score').not('gw_number', 'is', null),
          supabase.from('group_predictions').select('user_id, points_awarded').not('points_awarded', 'is', null).in('user_id', ids),
          supabase.from('tournament_predictions').select('user_id, pts_champion, pts_runner_up, pts_semi, pts_quarter').in('user_id', ids),
          league ? supabase.from('rank_snapshots').select('rank, snapshot_at, gw_number').eq('user_id', user.id).eq('league_id', league.id).order('snapshot_at', { ascending: true }) : Promise.resolve({ data: [] }),
          league?.banners_enabled ? supabase.from('league_banners').select('id, image_url, display_order').eq('league_id', league.id).order('display_order') : Promise.resolve({ data: [] }),
        ])

        const allScored = (scored ?? []) as unknown as ScoredPredRow[]
        const groupRows = (groupP ?? []) as ScoredGroupPred[]
        const tournRows = (tournP ?? []) as ScoredTournamentPred[]
        groupRowsRef.current = groupRows
        tournRowsRef.current = tournRows
        setScoredPreds(allScored)
        setLb(aggregateLeaderboard({ scoredPreds: allScored, profiles: memberProfiles as ProfileLite[], userId: user.id, weights: w, groupPreds: groupRows, tournamentPreds: tournRows }))
        setGwMatchRows((gwMatches ?? []) as unknown as MatchGWRow[])
        setHasTournamentPick(tournRows.some((r) => r.user_id === user.id))
        const snaps = (snapResult.data ?? []) as RankSnapshot[]
        setRankSnapshots(snaps)
        setPrevRank(snaps.length >= 2 ? snaps[snaps.length - 2].rank : null)
        setBanners((bannerResult.data ?? []) as BannerItem[])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard')
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: re-fetch scored predictions + GW match status when scores are saved
  useEffect(() => {
    async function refreshScored() {
      const ids = memberIdsRef.current
      const uid = userIdRef.current
      if (!ids.length || !uid) return
      const [{ data: scored }, { data: gwMatches }] = await Promise.all([
        supabase.from('predictions').select(SCORED_COLS).not('points_awarded', 'is', null).in('user_id', ids),
        supabase.from('matches').select('gw_number, real_home_score').not('gw_number', 'is', null),
      ])
      const allScored = (scored ?? []) as unknown as ScoredPredRow[]
      setScoredPreds(allScored)
      setLb(aggregateLeaderboard({ scoredPreds: allScored, profiles: memberProfilesRef.current, userId: uid, weights: weights, groupPreds: groupRowsRef.current, tournamentPreds: tournRowsRef.current }))
      setGwMatchRows((gwMatches ?? []) as unknown as MatchGWRow[])
    }

    function scheduleRefresh() {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(refreshScored, 800)
    }

    const channel = supabase
      .channel('dashboard-scored-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions', filter: 'points_awarded=not.is.null' }, scheduleRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        const updated = payload.new as Partial<DBMatch> & { id: string }
        setMatches((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m))
        scheduleRefresh()
      })
      .subscribe()

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights])

  const myRank = useMemo(() => {
    const i = lb.findIndex((r) => r.id === userId)
    return i >= 0 ? i + 1 : null
  }, [lb, userId])
  const myPts = lb.find((r) => r.id === userId)?.pts ?? 0
  const exactCount = useMemo(() => Object.values(preds).filter((p) => (p.pts_exact ?? 0) > 0).length, [preds])
  const rankMove = prevRank != null && myRank != null ? prevRank - myRank : null

  const celebratedRef = useRef(false)
  useEffect(() => {
    if (celebratedRef.current || loading) return
    if (rankMove != null && rankMove > 0 && myRank != null) {
      celebratedRef.current = true
      toast.success(`You climbed ${rankMove} spot${rankMove !== 1 ? 's' : ''} to ${ordinal(myRank)}`)
    }
  }, [rankMove, myRank, loading])

  const upcoming = useMemo(() => matches
    .filter((m) => m.real_home_score === null && new Date(m.match_date) > new Date())
    .sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date)), [matches])
  const missingCount = upcoming.filter((m) => !preds[m.id]).length
  useAppBadge(missingCount)
  const hero = upcoming[0] ?? null
  const alsoToday = useMemo(() => {
    if (!hero) return []
    const heroDate = fmtDateOnlyKey(hero.match_date, timeZone)
    return upcoming.slice(1).filter((m) => fmtDateOnlyKey(m.match_date, timeZone) === heroDate).slice(0, 4)
  }, [hero, upcoming, timeZone])

  const myScored = useMemo(() => matches
    .filter((m) => m.real_home_score !== null && (preds[m.id]?.points_awarded ?? null) !== null)
    .sort((a, b) => +new Date(b.match_date) - +new Date(a.match_date)), [matches, preds])

  const prize = useMemo(() => {
    if (!userId || !isMoney || scoredPreds.length === 0) return null
    const gwMatchStatus = new Map<number, { total: number; scored: number }>()
    for (const m of gwMatchRows) {
      if (!m.gw_number) continue
      const cur = gwMatchStatus.get(m.gw_number) ?? { total: 0, scored: 0 }
      cur.total++; if (m.real_home_score !== null) cur.scored++
      gwMatchStatus.set(m.gw_number, cur)
    }
    const predsForCalc = scoredPreds.map((r) => ({
      user_id: r.user_id, points_awarded: weightedMatchPoints(r, weights),
      pts_outcome: r.pts_outcome, gw_number: r.matches?.gw_number ?? null,
    }))
    return computePrizeSnapshot({ userId, allScoredPreds: predsForCalc, gwMatchStatus, overallRank: myRank })
  }, [userId, isMoney, scoredPreds, gwMatchRows, myRank, weights])

  // Trajectory data (points per GW + rank per snapshot)
  const scoredByGW = useMemo(() => {
    const myPredRows = scoredPreds.filter((r) => r.user_id === userId)
    const byGW: Record<number, number> = {}
    for (const r of myPredRows) {
      const gw = r.matches?.gw_number
      if (gw) byGW[gw] = (byGW[gw] ?? 0) + weightedMatchPoints(r, weights)
    }
    return byGW
  }, [scoredPreds, userId, weights])

  const gwNumbers = Object.keys(scoredByGW).map(Number).sort((a, b) => a - b)
  const gwSeries = gwNumbers.map((gw) => scoredByGW[gw])
  const gwLabels = gwNumbers.map((gw) => GW_SHORT[gw] ?? `GW${gw}`)

  // Rank trajectory from real snapshots
  const rankSeries = rankSnapshots.map((s) => s.rank)
  const rankLabels = rankSnapshots.map((s) => {
    const d = new Date(s.snapshot_at)
    return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  })

  // Current GW pts: pts from the most recent GW that has scored predictions
  const currentGWPts = useMemo(() => {
    if (gwNumbers.length === 0) return null
    const lastGW = gwNumbers[gwNumbers.length - 1]
    return scoredByGW[lastGW] ?? null
  }, [gwNumbers, scoredByGW])

  // Tournament progress
  const totalMatches = 104
  const playedMatches = useMemo(() => gwMatchRows.filter((m) => m.real_home_score !== null).length, [gwMatchRows])
  const currentGW = useMemo(() => {
    const gwsWithScored = gwMatchRows.filter((m) => m.real_home_score !== null && m.gw_number != null).map((m) => m.gw_number!)
    return gwsWithScored.length > 0 ? Math.max(...gwsWithScored) : null
  }, [gwMatchRows])
  const progressPct = Math.round((playedMatches / totalMatches) * 100)

  const gwBoundaries = useMemo(() => {
    const countByGW = new Map<number, number>()
    for (const m of gwMatchRows) {
      if (m.gw_number) countByGW.set(m.gw_number, (countByGW.get(m.gw_number) ?? 0) + 1)
    }
    let cum = 0
    const all = [1,2,3,4,5,6,7,8].map((gw) => {
      cum += countByGW.get(gw) ?? 0
      return { gw, pct: totalMatches > 0 ? (cum / totalMatches) * 100 : (gw / 8) * 100 }
    })
    // Show labels at least 12% apart; always include GW1 and the last GW (Final).
    // Second pass removes any label too close to its successor (handles forced-last overlap).
    const visible: typeof all = []
    for (const b of all) {
      const prev = visible[visible.length - 1]
      if (b.gw === 1 || b.gw === 8 || !prev || b.pct - prev.pct >= 12) {
        visible.push(b)
      }
    }
    return visible.filter((b, i, arr) =>
      i === arr.length - 1 || arr[i + 1].pct - b.pct >= 8
    )
  }, [gwMatchRows, totalMatches])

  // Best / worst GW
  const { bestGW, worstGW } = useMemo(() => {
    if (gwNumbers.length === 0) return { bestGW: null, worstGW: null }
    let best = gwNumbers[0], worst = gwNumbers[0]
    for (const gw of gwNumbers) {
      if (scoredByGW[gw] > scoredByGW[best]) best = gw
      if (scoredByGW[gw] < scoredByGW[worst]) worst = gw
    }
    return { bestGW: { gw: best, pts: scoredByGW[best] }, worstGW: { gw: worst, pts: scoredByGW[worst] } }
  }, [gwNumbers, scoredByGW])

  // Accuracy
  const totalScored = myScored.length
  const exactHits = myScored.filter((m) => (preds[m.id]?.pts_exact ?? 0) > 0).length
  const outcomeHits = myScored.filter((m) => (preds[m.id]?.pts_outcome ?? 0) > 0).length
  const missedHits = totalScored - outcomeHits

  const accSegments = totalScored > 0 ? [
    { value: exactHits, color: 'rgb(var(--blue))' },
    { value: outcomeHits - exactHits, color: 'rgb(var(--primary))' },
    { value: missedHits, color: 'rgb(var(--surface3))' },
  ] : [{ value: 1, color: 'rgb(var(--surface3))' }]
  const hitRate = totalScored > 0 ? Math.round((outcomeHits / totalScored) * 100) : 0

  // Category accuracy bars
  const cats = [
    { label: 'Outcome', get: (p: MyPred) => (p.pts_outcome ?? 0) > 0 },
    { label: 'Both teams score', get: (p: MyPred) => (p.pts_btts ?? 0) > 0 },
    { label: 'Total goals', get: (p: MyPred) => (p.pts_total_goals ?? 0) > 0 },
    { label: 'First goal', get: (p: MyPred) => (p.pts_first_team ?? 0) > 0 },
    { label: 'Goal difference', get: (p: MyPred) => (p.pts_goal_diff ?? 0) > 0 },
    { label: 'Exact score', get: (p: MyPred) => (p.pts_exact ?? 0) > 0 },
  ]

  function catColor(pct: number) {
    return pct >= 60 ? 'rgb(var(--primary))' : pct >= 40 ? 'rgb(var(--blue))' : 'rgb(var(--coral))'
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36 rounded-[20px]" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[16px]" />)}</div>
        <Skeleton className="h-52 rounded-[18px]" />
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={<CalIcon size={22} />} title="Couldn't load dashboard" desc={error} />
  }

  const profileName = lb.find((r) => r.id === userId)?.name ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5">
      {/* ── Banner ─────────────────────────────────────────────── */}
      <div
        className="relative rounded-[20px] overflow-hidden p-[26px] min-h-[148px] flex items-center justify-between gap-6"
        style={{
          background: 'linear-gradient(115deg, rgb(var(--heroFrom)), rgb(var(--heroTo)) 70%)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 84% 18%, rgba(255,255,255,0.16), transparent 42%)' }} />
        <div className="absolute right-[-30px] bottom-[-50px] opacity-[0.12] text-white pointer-events-none">
          <svg width="220" height="220" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-4Z" /></svg>
        </div>
        <div className="relative">
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.8)' }}>FIFA World Cup 2026 · Group Stage</div>
          <h1 className="text-[27px] font-extrabold leading-[1.05] text-white mt-1.5 font-display">{greeting}, {profileName.split(' ')[0]}</h1>
          <p className="text-[13px] font-medium mt-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {leagueName && <><span className="font-bold text-white">{leagueName}</span> · </>}
            {missingCount > 0
              ? <><span className="font-bold text-white">{missingCount} prediction{missingCount !== 1 ? 's' : ''}</span> still open</>
              : 'All predictions submitted'}
          </p>
          <div className="flex gap-2.5 mt-4">
            <Link
              href="/predictions"
              className="h-10 px-[18px] rounded-[11px] bg-white text-[rgb(4,38,20)] text-[13.5px] font-bold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
              style={{ boxShadow: '0 4px 14px -4px rgba(0,0,0,0.2)' }}
            >
              <BoltIcon size={14} />
              Predict now
            </Link>
            {bracketEnabled && (
              <Link
                href="/bracket"
                className="h-10 px-[18px] rounded-[11px] text-white text-[13.5px] font-semibold flex items-center border hover:bg-white/20 transition-colors"
                style={{ background: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.25)' }}
              >
                View bracket
              </Link>
            )}
          </div>
        </div>
        {myRank && (
          <div className="relative hidden sm:flex gap-3 shrink-0">
            <div className="text-center px-[18px] py-3.5 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <div className="text-[26px] font-extrabold text-white tabular-nums font-display leading-none">{ordinal(myRank)}</div>
              <div className="eyebrow mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>Your rank</div>
            </div>
            {isMoney && (
              <div className="text-center px-[18px] py-3.5 rounded-[14px]" style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div className="text-[26px] font-extrabold text-white tabular-nums font-display leading-none">{prize ? formatPrize(prize.projectedTotal) : '—'}</div>
                <div className="eyebrow mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>Net pool</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bracket reminder ─────────────────────────────────── */}
      {bracketEnabled && !hasTournamentPick && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gold/[0.07] border border-gold/20">
          <div>
            <p className="text-sm font-bold text-textp">Play the bracket game</p>
            <p className="text-xs text-texts mt-0.5">Call the champion, finalists and more — just for fun, no effect on points.</p>
          </div>
          <Link href="/bracket?tab=picks" className="shrink-0"><Pill tone="gold">Pick now →</Pill></Link>
        </div>
      )}

      {/* ── Up next ──────────────────────────────────────────── */}
      {hero && (
        <div>
          <div className="flex items-center justify-between mb-3 mx-0.5">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-coral" style={{ boxShadow: '0 0 0 4px rgba(var(--coral),0.18)' }} />
              <span className="font-bold text-[16px] font-display">Up next — your pick is open</span>
            </div>
            <Link href="/predictions" className="flex items-center gap-1 text-[12.5px] text-primary font-semibold">
              All fixtures <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
            </Link>
          </div>
          <div className={`grid gap-4 ${alsoToday.length > 0 ? 'grid-cols-1 lg:grid-cols-[1fr_300px]' : ''}`}>
            {/* Hero card */}
            <HeroMatchCard
              m={hero}
              hasPred={!!(preds[hero.id]?.pred_home != null && preds[hero.id]?.pred_away != null)}
              onOpen={() => setModalMatchId(hero.id)}
            />
            {/* Also today list */}
            {alsoToday.length > 0 && (
              <div className="bg-card border border-border rounded-[18px] overflow-hidden">
                <div className="px-4 py-3.5 border-b border-border">
                  <span className="font-bold text-[14px] font-display">Also today</span>
                </div>
                <div>
                  {alsoToday.map((m) => {
                    const hTeam = getTeam(m.home_team), aTeam = getTeam(m.away_team)
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModalMatchId(m.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-surface2/60 transition-colors"
                        style={{ borderTop: '1px solid rgba(var(--border),0.55)' }}
                      >
                        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <FlagChip code={m.home_team} w={22} h={15} r={3} />
                            <span className="font-semibold text-[12.5px]">{hTeam.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FlagChip code={m.away_team} w={22} h={15} r={3} />
                            <span className="font-semibold text-[12.5px]">{aTeam.name}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="tabular-nums text-[11.5px] font-bold text-texts">
                            {fmtTime(m.match_date, timeZone)}
                          </div>
                          <div className="text-[10.5px] font-semibold mt-0.5" style={{ color: preds[m.id]?.pred_home != null ? 'rgb(var(--primary))' : 'rgb(var(--coral))' }}>
                            {preds[m.id]?.pred_home != null ? '✓ Predicted' : 'Predict'}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stat row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <AccentStatCard
          label="My rank"
          value={myRank ? ordinal(myRank) : '–'}
          sub={`of ${lb.length || 1} players`}
          accentColor="rgb(var(--gold))"
          badge={rankMove != null && rankMove !== 0 ? (
            <span className={`text-[13px] font-bold ${rankMove > 0 ? 'text-success' : 'text-error'}`}>
              {rankMove > 0 ? '▲' : '▼'}{Math.abs(rankMove)}
            </span>
          ) : undefined}
        />
        <AccentStatCard
          label="Total points"
          value={<CountUp value={myPts} />}
          sub={currentGWPts != null ? `pts this gameweek: +${currentGWPts}` : 'across all matches'}
          accentColor="rgb(var(--primary))"
        />
        <AccentStatCard
          label="Exact scores"
          value={<CountUp value={exactCount} />}
          sub={totalScored > 0 ? `${Math.round((exactCount / totalScored) * 100)}% of all picks` : 'no scored picks yet'}
          accentColor="rgb(var(--blue))"
        />
        <AccentStatCard
          label="Predictions"
          value={<CountUp value={Object.keys(preds).length} />}
          sub={missingCount > 0 ? `${missingCount} still to make` : 'all submitted'}
          subColor={missingCount > 0 ? 'rgb(var(--coral))' : undefined}
        />
      </div>

      {/* ── Tournament progress + Best/Worst GW ─────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3.5">
        {/* Progress bar */}
        <div className="bg-card border border-border rounded-[18px] px-[22px] py-[16px]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[13px] font-bold text-textp">
                {playedMatches === 0 ? 'Tournament not started' : playedMatches === totalMatches ? 'Tournament complete' : currentGW ? `${GW_SHORT[currentGW] ?? `GW${currentGW}`} underway` : 'Group stage'}
              </p>
              <p className="text-[11.5px] text-texts mt-0.5">{playedMatches} of {totalMatches} matches played</p>
            </div>
            <span className="text-[22px] font-extrabold tabular-nums font-display text-primary">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="relative mt-1.5 overflow-hidden" style={{ height: 14 }}>
            {gwBoundaries.map(({ gw, pct }) => {
              // Clamp so first label doesn't overflow left, last doesn't overflow right
              const clamped = gw === 1 ? Math.max(pct, 2) : gw === 8 ? Math.min(pct, 98) : pct
              return (
                <span
                  key={gw}
                  className={`absolute text-[9px] font-semibold -translate-x-1/2 ${(currentGW ?? 0) >= gw ? 'text-primary' : 'text-texts/40'}`}
                  style={{ left: `${clamped}%` }}
                >
                  {GW_SHORT[gw] ?? `GW${gw}`}
                </span>
              )
            })}
          </div>
        </div>
        {/* Best / Worst GW */}
        {bestGW && worstGW && gwNumbers.length >= 2 && (
          <div className="bg-card border border-border rounded-[18px] px-[22px] py-[16px] flex gap-6 items-center">
            <div className="text-center">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-texts mb-0.5">Best GW</p>
              <p className="text-[24px] font-extrabold font-display text-success leading-none">{bestGW.pts}</p>
              <p className="text-[11px] text-texts mt-0.5">{GW_SHORT[bestGW.gw] ?? `GW${bestGW.gw}`}</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="text-center">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-texts mb-0.5">Worst GW</p>
              <p className="text-[24px] font-extrabold font-display text-coral leading-none">{worstGW.pts}</p>
              <p className="text-[11px] text-texts mt-0.5">{GW_SHORT[worstGW.gw] ?? `GW${worstGW.gw}`}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Analytics band ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Trajectory */}
        <div className="bg-card border border-border rounded-[18px] px-[22px] py-[20px]">
          <div className="flex items-start justify-between mb-1.5">
            <div>
              <h3 className="text-[16px] font-bold font-display">Season trajectory</h3>
              <p className="text-[12px] text-texts mt-0.5">
                {trajMode === 'points' ? `${myPts} pts total` : myRank ? `Currently ${ordinal(myRank)}` : 'No data yet'}
              </p>
            </div>
            <div className="flex gap-0.5 bg-surface2 border border-border rounded-[10px] p-[3px]">
              {(['points', 'rank'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTrajMode(mode)}
                  className="text-[11.5px] font-semibold px-3 py-1.5 rounded-[7px] transition-all capitalize"
                  style={{
                    background: trajMode === mode ? 'rgb(var(--card))' : 'transparent',
                    color: trajMode === mode ? 'rgb(var(--textp))' : 'rgb(var(--texts))',
                    boxShadow: trajMode === mode ? 'var(--card-shadow)' : undefined,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5 mb-4">
            <span className="text-[34px] font-extrabold leading-none tabular-nums font-display">
              {trajMode === 'points' ? myPts : myRank ? ordinal(myRank) : '–'}
            </span>
            {rankMove != null && rankMove !== 0 && (
              <span className={`text-[13px] font-bold tabular-nums ${rankMove > 0 ? 'text-success' : 'text-error'}`}>
                {rankMove > 0 ? `▲${rankMove}` : `▼${Math.abs(rankMove)}`}
              </span>
            )}
          </div>
          {trajMode === 'points' ? (
            gwSeries.length > 0
              ? <BarChart series={gwSeries} labels={gwLabels} />
              : <div className="h-28 flex items-center justify-center text-texts text-sm">No scored matches yet</div>
          ) : (
            rankSeries.length > 1
              ? <RankLine ranks={rankSeries} total={lb.length || 7} labels={rankLabels} />
              : <div className="h-28 flex items-center justify-center text-texts text-sm">{rankSeries.length === 1 ? 'Need more snapshots for rank trend' : 'No rank history yet'}</div>
          )}
        </div>

        {/* Accuracy donut */}
        <div className="bg-card border border-border rounded-[18px] px-[22px] py-[20px] flex flex-col">
          <h3 className="text-[16px] font-bold font-display mb-0.5">Accuracy</h3>
          <p className="text-[12px] text-texts">{totalScored} predictions scored</p>
          <div className="flex justify-center my-4">
            <DonutChart
              segments={accSegments}
              total={totalScored || 1}
              centerValue={totalScored > 0 ? `${hitRate}%` : '–'}
              centerLabel="hit rate"
              size={160}
              thickness={17}
            />
          </div>
          <div className="flex flex-col gap-2.5 mt-auto">
            {[
              { color: 'rgb(var(--blue))', label: 'Exact scorelines', count: exactHits },
              { color: 'rgb(var(--primary))', label: 'Right outcome', count: outcomeHits - exactHits },
              { color: 'rgb(var(--surface3))', label: 'Missed', count: missedHits, faint: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: item.color }} />
                <span className="flex-1 text-[12.5px] font-medium text-texts">{item.label}</span>
                <span className={`text-[13px] font-bold tabular-nums ${item.faint ? 'text-faint' : ''}`}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Prize outlook ─────────────────────────────────────── */}
      {isMoney && <PrizeSection prize={prize} isMoney={isMoney} />}

      {/* ── Lower grid ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Mini leaderboard */}
        <div className="bg-card border border-border rounded-[18px] overflow-hidden">
          <div className="flex items-center justify-between px-4 h-12 border-b border-border">
            <h3 className="font-bold text-[14.5px] font-display">Leaderboard</h3>
            <Link href="/leaderboard" className="text-[11.5px] text-primary font-semibold">Full table →</Link>
          </div>
          {lb.length === 0 ? (
            <p className="text-sm text-texts text-center py-8">No scored predictions yet.</p>
          ) : (
            <div className="p-[5px]">
              {lb.slice(0, 5).map((row, i) => {
                const isYou = row.id === userId
                const posColor = i === 0 ? 'rgb(var(--gold))' : isYou ? 'rgb(var(--primary))' : 'rgb(var(--texts))'
                return (
                  <div key={row.id} className="flex items-center gap-[11px] px-[11px] py-[9px] rounded-[11px]" style={{ background: isYou ? 'rgba(var(--primary),0.10)' : 'transparent' }}>
                    <span className="w-4 text-center text-[13px] font-bold tabular-nums" style={{ color: posColor }}>{i + 1}</span>
                    <Avatar name={row.name} src={row.avatar ?? null} size={30} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-semibold flex items-center gap-1.5">
                        {row.name}
                        {isYou && <span className="text-[8.5px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">YOU</span>}
                      </span>
                    </div>
                    <span className="text-[13.5px] font-bold tabular-nums font-display" style={{ color: i === 0 ? 'rgb(var(--gold))' : 'rgb(var(--textp))' }}>{row.pts}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Accuracy by category */}
        <div className="bg-card border border-border rounded-[18px] p-4">
          <h3 className="font-bold text-[14.5px] font-display mb-3.5">Accuracy by category</h3>
          <div className="flex flex-col gap-[11px]">
            {cats.map((c) => {
              const scored = myScored.map((m) => preds[m.id]).filter(Boolean) as MyPred[]
              const hits = scored.filter((p) => c.get(p)).length
              const pct = scored.length > 0 ? Math.round((hits / scored.length) * 100) : 0
              const color = catColor(pct)
              return (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold">{c.label}</span>
                    <span className="text-[11.5px] font-bold tabular-nums font-display" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="h-[7px] rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Scoring */}
        <div className="bg-card border border-border rounded-[18px] overflow-hidden">
          <div className="flex items-center justify-between px-4 h-12 border-b border-border">
            <h3 className="font-bold text-[14.5px] font-display">Scoring</h3>
            <button onClick={() => setRulesOpen(true)} className="text-[11.5px] text-primary font-semibold">Full rules →</button>
          </div>
          <div>
            {SCORING_RULES.filter((s) => (weights[s.key as keyof ScoringWeights] ?? s.pts) > 0).map((s, i) => (
              <div key={s.key} className="flex items-center justify-between px-4 py-[9.5px]" style={{ borderTop: i > 0 ? '1px solid rgba(var(--border),0.6)' : undefined }}>
                <span className="text-[12.5px] text-texts font-medium">{s.label}</span>
                <span className="text-[13px] font-bold text-primary tabular-nums">+{weights[s.key as keyof ScoringWeights] ?? s.pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {bannersEnabled && banners.length > 0 && (
        <BannerPreview banners={banners} leagueName={leagueName} />
      )}

      {/* Prediction Modal */}
      {modalMatchId && (
        <PredictionModal
          matchId={modalMatchId}
          onClose={() => setModalMatchId(null)}
        />
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} weights={weights} showPrizePool={isMoney} />
    </div>
  )
}

/* ─── AccentStatCard ─────────────────────────────────────────────── */
function AccentStatCard({
  label, value, sub, accentColor, badge, subColor,
}: {
  label: string; value: React.ReactNode; sub?: string; accentColor?: string
  badge?: React.ReactNode; subColor?: string
}) {
  return (
    <div className="bg-card border border-border rounded-[16px] shadow-card p-[16px] relative overflow-hidden pl-[18px]">
      {accentColor && (
        <>
          <div className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-r-full" style={{ background: accentColor }} />
          <div className="absolute -right-8 -top-10 w-28 h-28 rounded-full blur-2xl opacity-[0.07] pointer-events-none" style={{ background: accentColor }} />
        </>
      )}
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex items-baseline gap-[7px]">
        <span
          className="text-[28px] font-extrabold tabular-nums leading-none font-display"
          style={{ color: accentColor ?? 'rgb(var(--textp))' }}
        >
          {value}
        </span>
        {badge}
      </div>
      {sub && <div className="mt-1 text-[11.5px] font-medium" style={{ color: subColor ?? 'rgb(var(--texts))' }}>{sub}</div>}
    </div>
  )
}

/* ─── HeroMatchCard ─────────────────────────────────────────────── */
function HeroMatchCard({ m, hasPred, onOpen }: { m: DBMatch; hasPred: boolean; onOpen: () => void }) {
  const home = getTeam(m.home_team), away = getTeam(m.away_team)
  const knockout = isKnockout(m)
  const stage = knockout ? (m.round_name ?? 'Knockout') : `Group ${m.group_name ?? ''}`.trim()
  return (
    <div className="bg-card border rounded-[18px] shadow-card p-[22px] relative overflow-hidden" style={{ borderColor: 'rgba(var(--primary),0.32)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="eyebrow text-blue bg-blue/12 px-2 py-1 rounded-[7px] tabular-nums">{stage}</span>
            <span className="eyebrow">Today</span>
          </div>
          <span className="tabular-nums text-[12px] font-bold text-amber">
            <Countdown kickoff={m.match_date} />
          </span>
        </div>

        <div className="flex items-center justify-center gap-[22px]">
          <div className="flex flex-col items-center gap-2.5 w-[104px]">
            <FlagChip code={m.home_team} w={60} h={40} r={8} />
            <span className="font-bold text-[15px] font-display text-center">{home.name}</span>
          </div>
          <div className="flex flex-col items-center gap-0 shrink-0">
            <span className="font-bold text-[26px] text-faint font-display">vs</span>
          </div>
          <div className="flex flex-col items-center gap-2.5 w-[104px]">
            <FlagChip code={m.away_team} w={60} h={40} r={8} />
            <span className="font-bold text-[15px] font-display text-center">{away.name}</span>
          </div>
        </div>

        <div className="flex justify-center mt-5">
          <button
            onClick={onOpen}
            className="h-[42px] px-[22px] rounded-[11px] bg-primary text-[rgb(4,38,20)] text-[13px] font-bold hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {hasPred ? 'Edit prediction' : 'Submit prediction'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── PrizeSection ──────────────────────────────────────────────── */
function PrizeSection({ prize }: { prize: ReturnType<typeof computePrizeSnapshot> | null; isMoney: boolean }) {
  if (!prize) return null
  const { settledNet, completedGWs, liveGWNumber, liveGWRank, liveGWPrize, projectedOverallPrize, rangeMin, rangeMax, projectedTotal } = prize

  const totalPossible = GW_PRIZES[0] * 8 + OVERALL_PRIZES[0]
  const barMin = -(GW_PRIZES[GW_PRIZES.length - 1] * 8 + Math.abs(OVERALL_PRIZES[OVERALL_PRIZES.length - 1]))
  const barMax = totalPossible
  const barSpan = barMax - barMin
  const projPct = Math.max(0, Math.min(100, ((projectedTotal - barMin) / barSpan) * 100))
  const minPct = Math.max(0, Math.min(100, ((rangeMin - barMin) / barSpan) * 100))
  const maxPct = Math.max(0, Math.min(100, ((rangeMax - barMin) / barSpan) * 100))

  const settledTone = prizeTone(settledNet)
  const projectedTone = prizeTone(projectedTotal)

  return (
    <div className="bg-card border border-border rounded-[18px] px-[22px] py-[20px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[16px] font-display">Prize outlook</h3>
        {liveGWNumber && (
          <span className="tabular-nums text-[11.5px] font-semibold text-amber bg-amber/12 px-2.5 py-1 rounded-full">
            {GW_NAMES[liveGWNumber] ?? `GW${liveGWNumber}`} settling
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mb-5">
        <div className="bg-surface2 border border-border rounded-[13px] px-[15px] py-[13px]">
          <div className={`text-[23px] font-extrabold tabular-nums font-display ${settledTone === 'green' ? 'text-success' : settledTone === 'red' ? 'text-error' : 'text-textp'}`}>{formatPrize(settledNet)}</div>
          <div className="eyebrow mt-0.5">Settled</div>
          <div className="text-[11px] text-texts mt-0.5">{completedGWs.length} GW{completedGWs.length !== 1 ? 's' : ''} locked</div>
        </div>
        <div className="bg-surface2 border border-border rounded-[13px] px-[15px] py-[13px]">
          <div className={`text-[23px] font-extrabold tabular-nums font-display ${projectedTone === 'green' ? 'text-success' : projectedTone === 'red' ? 'text-error' : 'text-textp'}`}>{formatPrize(projectedTotal)}</div>
          <div className="eyebrow mt-0.5">Projected</div>
          {liveGWRank && <div className="text-[11px] text-texts mt-0.5">GW rank #{liveGWRank} · {formatPrize(liveGWPrize)}</div>}
        </div>
        <div className="bg-surface2 border border-border rounded-[13px] px-[15px] py-[13px]">
          <div className="text-[23px] font-extrabold tabular-nums font-display">
            <span className={prizeTone(rangeMin) === 'green' ? 'text-success' : prizeTone(rangeMin) === 'red' ? 'text-error' : 'text-textp'}>{formatPrize(rangeMin)}</span>
            <span className="text-faint font-semibold text-[15px] mx-1">→</span>
            <span className={prizeTone(rangeMax) === 'green' ? 'text-success' : prizeTone(rangeMax) === 'red' ? 'text-error' : 'text-textp'}>{formatPrize(rangeMax)}</span>
          </div>
          <div className="eyebrow mt-0.5">Range</div>
          <div className="text-[11px] text-texts mt-0.5">worst → best case</div>
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-surface2 overflow-visible">
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%`, background: 'linear-gradient(90deg,rgba(var(--coral),0.55),rgba(var(--primary),0.55))' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-[3px] border-card shadow"
          style={{ left: `calc(${projPct}% - 8px)`, background: 'rgb(var(--gold))' }}
        />
        <div className="absolute top-1/2 left-1/2 w-px h-5 -translate-x-1/2 -translate-y-1/2 bg-border" />
      </div>
      <div className="flex justify-between mt-2.5 text-[10.5px] font-semibold text-faint">
        <span>−${Math.abs(barMin)}</span><span>$0</span><span>+${barMax}</span>
      </div>
      {projectedOverallPrize !== 0 && (
        <p className="text-[11px] text-texts mt-2.5 text-center">
          Overall prize (current rank): <span className={`font-bold ${projectedOverallPrize > 0 ? 'text-success' : 'text-error'}`}>{formatPrize(projectedOverallPrize)}</span>
        </p>
      )}
    </div>
  )
}

function BannerPreview({ banners, leagueName }: { banners: BannerItem[]; leagueName: string }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (banners.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % banners.length)
    }, 4500)
    return () => window.clearInterval(id)
  }, [banners.length])

  const active = banners[index] ?? banners[0]
  if (!active) return null

  return (
    <div className="bg-card border border-border rounded-[18px] px-[22px] py-[20px]">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <div className="text-[16px] font-bold font-display text-textp">Latest from {leagueName || 'your league'}</div>
        </div>
        {banners.length > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                onClick={() => setIndex(i)}
                aria-label={`Show banner ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-primary' : 'w-2 bg-border hover:bg-texts/40'}`}
              />
            ))}
          </div>
        )}
      </div>
      <div className="relative overflow-hidden rounded-[16px] border border-border bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.image_url}
          alt={`${leagueName || 'League'} banner ${index + 1}`}
          className="block w-full h-auto object-cover"
          style={{ aspectRatio: '16 / 7' }}
        />
      </div>
    </div>
  )
}
