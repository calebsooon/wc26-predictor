'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { Card, StatCard, SectionHeader, Button, Skeleton, BoltIcon, EmptyState, CalIcon, Pill, CountUp, ScoreStepper, Countdown, ProgressBar, LeagueBadge, ConfettiBurst } from '@/components/ui'
import { NextPredictCard, LeaderboardTable, type LBRow } from '@/components/football'
import RulesModal from '@/components/RulesModal'
import { aggregateLeaderboard, type ProfileLite } from '@/lib/leaderboard'
import { getActiveLeague, isMoneyLeague, type LeagueLabel } from '@/lib/league'
import { toUIMatch, isKnockout, type DBMatch, type MyPred } from '@/lib/match-ui'
import { getTeam } from '@/lib/teams'
import { SCORING_RULES, weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { computePrizeSnapshot, formatPrize, prizeTone, GW_NAMES, GW_PRIZES, OVERALL_PRIZES } from '@/lib/prizes'

const SCORED_COLS = 'user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_btts, pts_first_team, pts_first_scorer, matches(gw_number)'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }
interface ScoredPredRow {
  user_id: string; points_awarded: number
  pts_outcome: number | null; pts_exact: number | null; pts_goal_diff: number | null
  pts_total_goals: number | null; pts_btts: number | null; pts_first_team: number | null; pts_first_scorer: number | null
  profiles: { username: string; avatar_url: string | null } | null
  matches: { gw_number: number | null } | null
}
interface MatchGWRow { gw_number: number | null; real_home_score: number | null }

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [lb, setLb] = useState<LBRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [hasTournamentPick, setHasTournamentPick] = useState(true)
  const [scoredPreds, setScoredPreds] = useState<ScoredPredRow[]>([])
  const [gwMatchRows, setGwMatchRows] = useState<MatchGWRow[]>([])
  const [prevRank, setPrevRank] = useState<number | null>(null)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [isMoney, setIsMoney] = useState(false)
  const [leagueName, setLeagueName] = useState('')
  const [leagueLabel, setLeagueLabel] = useState<LeagueLabel | null>(null)
  const [bracketEnabled, setBracketEnabled] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        setUserId(user.id)

        // Phase 1 — critical path: matches + my picks (shows hero card fast)
        const [{ data: roundData, error: roundErr }, { data: myData, error: myErr }] = await Promise.all([
          supabase
            .from('rounds')
            .select('id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)')
            .order('"order"')
            .order('match_date', { referencedTable: 'matches' }),
          supabase
            .from('predictions')
            .select('match_id, pred_home, pred_away, points_awarded, pts_exact, pts_outcome, pts_goal_diff, pts_total_goals, pts_btts, pts_first_team, pts_first_scorer, pred_first_goal_team, pred_first_scorer_id')
            .eq('user_id', user.id),
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

        // Show hero card immediately — phase 2 loads behind it
        setLoading(false)

        // Phase 2 — deferred: league, leaderboard, prize, rank snapshot (parallel)
        const { league, weights: w, memberIds, memberProfiles } = await getActiveLeague(supabase, user.id)
        setWeights(w)
        setIsMoney(isMoneyLeague(league))
        setLeagueName(league?.name ?? '')
        setLeagueLabel(league?.league_labels ?? null)
        setBracketEnabled(league?.bracket_enabled !== false)

        const ids = memberIds.length ? memberIds : [user.id]
        const [
          { data: scored },
          { data: gwMatches },
          { data: tp },
          snapResult,
        ] = await Promise.all([
          supabase.from('predictions').select(SCORED_COLS).not('points_awarded', 'is', null).in('user_id', ids),
          supabase.from('matches').select('gw_number, real_home_score').not('gw_number', 'is', null),
          supabase.from('tournament_predictions').select('user_id').eq('user_id', user.id).limit(1),
          league
            ? supabase.from('rank_snapshots').select('rank, snapshot_at').eq('user_id', user.id).eq('league_id', league.id).order('snapshot_at', { ascending: false }).limit(1).maybeSingle()
            : Promise.resolve({ data: null }),
        ])

        const allScored = (scored ?? []) as unknown as ScoredPredRow[]
        setScoredPreds(allScored)
        setLb(aggregateLeaderboard({ scoredPreds: allScored, profiles: memberProfiles as ProfileLite[], userId: user.id, weights: w }))
        setGwMatchRows((gwMatches ?? []) as unknown as MatchGWRow[])
        setHasTournamentPick(!!(tp && tp.length))
        setPrevRank((snapResult.data as { rank: number } | null)?.rank ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard')
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const myRank = useMemo(() => {
    const i = lb.findIndex((r) => r.id === userId)
    return i >= 0 ? i + 1 : null
  }, [lb, userId])
  const myPts = lb.find((r) => r.id === userId)?.pts ?? 0
  const exactCount = useMemo(() => Object.values(preds).filter((p) => (p.pts_exact ?? 0) > 0).length, [preds])
  const rankMove = prevRank != null && myRank != null ? prevRank - myRank : null

  // Celebrate a climb since the last snapshot (once per load)
  const [confetti, setConfetti] = useState(0)
  const celebratedRef = useRef(false)
  useEffect(() => {
    if (celebratedRef.current || loading) return
    if (rankMove != null && rankMove > 0 && myRank != null) {
      celebratedRef.current = true
      setConfetti((c) => c + 1)
      toast.success(`📈 You climbed ${rankMove} spot${rankMove !== 1 ? 's' : ''} to ${ordinal(myRank)}!`)
    }
  }, [rankMove, myRank, loading])

  const upcoming = useMemo(() => matches
    .filter((m) => m.real_home_score === null && new Date(m.match_date) > new Date())
    .sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date)), [matches])
  const missingCount = upcoming.filter((m) => !preds[m.id]).length
  const hero = upcoming[0] ?? null
  const next = upcoming.slice(1, 5)

  // My scored matches (most recent first) → powers form, accuracy, recent feed
  const myScored = useMemo(() => matches
    .filter((m) => m.real_home_score !== null && (preds[m.id]?.points_awarded ?? null) !== null)
    .sort((a, b) => +new Date(b.match_date) - +new Date(a.match_date)), [matches, preds])

  const prize = useMemo(() => {
    if (!userId || !isMoney || scoredPreds.length === 0) return null
    const gwMatchStatus = new Map<number, { total: number; scored: number }>()
    for (const m of gwMatchRows) {
      if (!m.gw_number) continue
      const cur = gwMatchStatus.get(m.gw_number) ?? { total: 0, scored: 0 }
      cur.total++
      if (m.real_home_score !== null) cur.scored++
      gwMatchStatus.set(m.gw_number, cur)
    }
    const predsForCalc = scoredPreds.map((r) => ({
      user_id: r.user_id,
      points_awarded: weightedMatchPoints(r, weights),
      pts_outcome: r.pts_outcome,
      gw_number: r.matches?.gw_number ?? null,
    }))
    return computePrizeSnapshot({ userId, allScoredPreds: predsForCalc, gwMatchStatus, overallRank: myRank })
  }, [userId, isMoney, scoredPreds, gwMatchRows, myRank, weights])

  async function savePred(matchId: string, side: 'h' | 'a', val: number) {
    if (!userId) return
    const cur = preds[matchId] ?? { pred_home: 0, pred_away: 0, points_awarded: null }
    const updated: MyPred = { ...cur, pred_home: side === 'h' ? val : cur.pred_home, pred_away: side === 'a' ? val : cur.pred_away }
    setPreds((p) => ({ ...p, [matchId]: updated }))
    await supabase.from('predictions').upsert(
      {
        user_id: userId, match_id: matchId,
        pred_home: updated.pred_home, pred_away: updated.pred_away,
        pred_first_goal_team: updated.pred_first_goal_team ?? null,
        pred_first_scorer_id: updated.pred_first_scorer_id ?? null,
      },
      { onConflict: 'user_id,match_id' },
    )
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <div className="pb-4 border-b border-border">
          <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
        </div>
        <EmptyState icon={<CalIcon size={22} />} title="Couldn't load dashboard" desc={error} />
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <ConfettiBurst trigger={confetti} />
      <div className="flex items-end justify-between flex-wrap gap-3 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">World Cup 2026</span>
            {leagueName && <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-textp">{leagueName}<LeagueBadge name={leagueLabel?.name} color={leagueLabel?.color} money={isMoney} /></span>}
          </div>
          <h1 className="text-2xl sm:text-[28px] font-black tracking-tight leading-none">Dashboard</h1>
          <p className="text-texts font-medium mt-2 text-sm">
            {myRank ? <>You&apos;re <span className="text-gold font-bold">{ordinal(myRank)}</span></> : 'Make your first picks'}
            {missingCount > 0 && <> · <span className="text-error font-bold">{missingCount} predictions missing</span></>}
          </p>
        </div>
        <Link href="/predictions"><Button variant="primary" icon={<BoltIcon size={16} />}>Make predictions</Button></Link>
      </div>

      {bracketEnabled && !hasTournamentPick && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gold/[0.07] border border-gold/20">
          <div>
            <p className="text-sm font-bold text-textp">Play the bracket game</p>
            <p className="text-xs text-texts mt-0.5">Call the champion, finalists and more — just for fun, no effect on points.</p>
          </div>
          <Link href="/bracket?tab=picks" className="shrink-0">
            <Pill tone="gold">Pick now →</Pill>
          </Link>
        </div>
      )}

      {/* Hero — soonest match to predict */}
      {hero && (
        <HeroMatch
          m={hero}
          pred={{ h: preds[hero.id]?.pred_home ?? null, a: preds[hero.id]?.pred_away ?? null }}
          onChange={(side, v) => savePred(hero.id, side, v)}
          onOpen={() => router.push(`/match/${hero.id}`)}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="My Rank"
          value={myRank ? <span className="inline-flex items-center gap-2">#<CountUp value={myRank} />{rankMove != null && rankMove !== 0 && <TrendArrow move={rankMove} />}</span> : '–'}
          sub={`of ${lb.length || 1} players`}
          accent="gold"
        />
        <StatCard label="Total Points" value={<CountUp value={myPts} />} accent="green" />
        <StatCard label="Exact Scores" value={<CountUp value={exactCount} />} accent="blue" />
        <StatCard label="Predictions" value={<CountUp value={Object.keys(preds).length} />} sub={`${missingCount} still to make`} />
      </div>

      {/* Prize card */}
      {prize && (
        <PrizeCard prize={prize} />
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <SectionHeader
            title="Next to predict"
            sub="Lock in before kickoff — predictions close the moment the whistle blows."
            action={<Link href="/predictions" className="text-sm font-bold text-primary hover:underline">All fixtures →</Link>}
          />
          {next.length === 0 ? (
            !hero && <EmptyState icon={<CalIcon size={22} />} title="No upcoming matches" desc="Fixtures will appear here as kickoff approaches." />
          ) : (
            <div className="grid xl:grid-cols-2 gap-3">
              {next.map((m) => (
                <NextPredictCard
                  key={m.id}
                  m={toUIMatch(m, preds[m.id])}
                  pred={{ h: preds[m.id]?.pred_home ?? null, a: preds[m.id]?.pred_away ?? null }}
                  onChange={(side, v) => savePred(m.id, side, v)}
                  onOpen={() => router.push(`/match/${m.id}`)}
                />
              ))}
            </div>
          )}

          {myScored.length > 0 && (
            <RecentResults items={myScored.slice(0, 5).map((m) => ({ m, pred: preds[m.id] }))} weights={weights} onOpen={(id) => router.push(`/match/${id}`)} />
          )}
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 h-12 border-b border-border">
              <h3 className="font-extrabold text-textp text-[15px]">Leaderboard</h3>
              <Link href="/leaderboard" className="text-xs font-bold text-primary hover:underline">Full table →</Link>
            </div>
            {lb.length === 0 ? (
              <p className="text-sm text-texts text-center py-8">No scored predictions yet.</p>
            ) : (
              <div className="px-1 py-1"><LeaderboardTable players={lb.slice(0, 5)} dense showMove={false} showMeta={false} onRow={() => router.push('/leaderboard')} /></div>
            )}
          </Card>

          {myScored.length > 0 && <FormAccuracy items={myScored.map((m) => preds[m.id])} weights={weights} />}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 h-12 border-b border-border">
              <h3 className="font-extrabold text-textp text-[15px]">Scoring</h3>
              <button onClick={() => setRulesOpen(true)} className="text-xs font-bold text-primary hover:underline">Full rules →</button>
            </div>
            <div className="divide-y divide-border/60">
              {SCORING_RULES.map((s) => (
                <div key={s.key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[13px] font-medium text-texts">{s.label}</span>
                  <span className="text-sm font-extrabold tabular-nums text-primary">+{weights[s.key as keyof ScoringWeights] ?? s.pts}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} weights={weights} showPrizePool={isMoney} />
    </div>
  )
}

function PrizeCard({ prize }: { prize: ReturnType<typeof computePrizeSnapshot> }) {
  const { settledNet, completedGWs, liveGWNumber, liveGWRank, liveGWPrize, projectedOverallPrize, rangeMin, rangeMax, projectedTotal } = prize

  const settledTone = prizeTone(settledNet)
  const projectedTone = prizeTone(projectedTotal)

  const rangeMinLabel = rangeMin > 0 ? `+$${rangeMin}` : rangeMin < 0 ? `-$${Math.abs(rangeMin)}` : '$0'
  const rangeMaxLabel = rangeMax > 0 ? `+$${rangeMax}` : `$${rangeMax}`

  const totalPossible = GW_PRIZES[0] * 8 + OVERALL_PRIZES[0]
  const barMin = -(GW_PRIZES[GW_PRIZES.length - 1] * 8 + Math.abs(OVERALL_PRIZES[OVERALL_PRIZES.length - 1]))
  const barMax = totalPossible
  const barSpan = barMax - barMin
  const projPct = Math.max(0, Math.min(100, ((projectedTotal - barMin) / barSpan) * 100))
  const minPct = Math.max(0, Math.min(100, ((rangeMin - barMin) / barSpan) * 100))
  const maxPct = Math.max(0, Math.min(100, ((rangeMax - barMin) / barSpan) * 100))

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-textp text-[15px]">Prize outlook</h3>
        {liveGWNumber && (
          <span className="text-[11px] font-bold text-texts">{GW_NAMES[liveGWNumber] ?? `GW${liveGWNumber}`} live</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center">
          <p className={`text-xl font-extrabold tabular-nums ${settledTone === 'green' ? 'text-success' : settledTone === 'red' ? 'text-error' : 'text-textp'}`}>
            {formatPrize(settledNet)}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts mt-0.5">Settled</p>
          <p className="text-[10px] text-texts">{completedGWs.length} GW{completedGWs.length !== 1 ? 's' : ''} locked</p>
        </div>

        <div className="text-center">
          <p className={`text-xl font-extrabold tabular-nums ${projectedTone === 'green' ? 'text-success' : projectedTone === 'red' ? 'text-error' : 'text-textp'}`}>
            {formatPrize(projectedTotal)}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts mt-0.5">Projected</p>
          {liveGWRank && (
            <p className="text-[10px] text-texts">GW rank #{liveGWRank} · {formatPrize(liveGWPrize)}</p>
          )}
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-0.5 flex-wrap">
            <span className="text-base font-extrabold tabular-nums text-error">{rangeMinLabel}</span>
            <span className="text-texts text-xs font-bold px-0.5">→</span>
            <span className="text-base font-extrabold tabular-nums text-success">{rangeMaxLabel}</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts mt-0.5">Range</p>
          <p className="text-[10px] text-texts">worst → best</p>
        </div>
      </div>

      {/* range bar */}
      <div className="relative h-2.5 rounded-full bg-surface overflow-hidden">
        <div
          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-error/40 to-success/40"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold border-2 border-card shadow"
          style={{ left: `calc(${projPct}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-texts font-bold">{rangeMinLabel}</span>
        <span className="text-[9px] text-texts font-bold">{rangeMaxLabel}</span>
      </div>

      {projectedOverallPrize !== 0 && (
        <p className="text-[11px] text-texts mt-2.5 text-center">
          Overall prize (current rank): <span className={`font-bold ${projectedOverallPrize > 0 ? 'text-success' : 'text-error'}`}>{formatPrize(projectedOverallPrize)}</span>
        </p>
      )}
    </Card>
  )
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function ptsColor(pts: number) {
  return pts >= 8 ? 'rgb(var(--primary))' : pts > 0 ? 'rgb(var(--gold))' : 'rgb(var(--error))'
}

function TrendArrow({ move }: { move: number }) {
  const up = move > 0
  return <span className={`text-xs font-bold tabular-nums ${up ? 'text-success' : 'text-error'}`}>{up ? '▲' : '▼'}{Math.abs(move)}</span>
}

/* Hero — the single soonest match to predict */
function HeroMatch({
  m, pred, onChange, onOpen,
}: { m: DBMatch; pred: { h: number | null; a: number | null }; onChange: (side: 'h' | 'a', v: number) => void; onOpen: () => void }) {
  const home = getTeam(m.home_team), away = getTeam(m.away_team)
  const missing = pred.h == null || pred.a == null
  const knockout = isKnockout(m)
  const stage = knockout ? (m.round_name ?? 'Knockout') : `Group ${m.group_name ?? ''}`.trim()
  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.10] via-transparent to-gold/[0.06] pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Pill tone={knockout ? 'gold' : 'green'}>{stage}</Pill>
            <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Next up</span>
          </div>
          {missing ? <Pill tone="red">● Missing</Pill> : <Pill tone="blue">✓ Submitted</Pill>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button onClick={onOpen} className="flex flex-col items-center gap-2 flex-1 min-w-0 group">
            <span className="text-[44px] sm:text-[54px] leading-none">{home.flag}</span>
            <span className="font-bold text-textp text-sm truncate max-w-full group-hover:text-primary transition-colors">{home.name}</span>
          </button>

          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <ScoreStepper value={pred.h} onChange={(v) => onChange('h', v)} />
              <span className="text-texts font-bold">:</span>
              <ScoreStepper value={pred.a} onChange={(v) => onChange('a', v)} />
            </div>
            <span className="text-[11px] flex items-center gap-1 font-semibold">
              <span className="text-texts">Locks in</span> <Countdown kickoff={m.match_date} className="text-[11px]" />
            </span>
          </div>

          <button onClick={onOpen} className="flex flex-col items-center gap-2 flex-1 min-w-0 group">
            <span className="text-[44px] sm:text-[54px] leading-none">{away.flag}</span>
            <span className="font-bold text-textp text-sm truncate max-w-full group-hover:text-primary transition-colors">{away.name}</span>
          </button>
        </div>

        <div className="flex justify-center mt-5">
          <Button variant="primary" size="sm" icon={<BoltIcon size={15} />} onClick={onOpen}>
            {missing ? 'Predict this match' : 'Edit prediction'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* Recent results — how the user's latest scored picks landed */
function RecentResults({ items, weights, onOpen }: { items: { m: DBMatch; pred?: MyPred }[]; weights: ScoringWeights; onOpen: (id: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center px-4 h-12 border-b border-border">
        <h3 className="font-extrabold text-textp text-[15px]">Recent results</h3>
      </div>
      <div className="divide-y divide-border/60">
        {items.map(({ m, pred }) => {
          const home = getTeam(m.home_team), away = getTeam(m.away_team)
          const pts = pred ? weightedMatchPoints(pred, weights) : 0
          return (
            <button key={m.id} onClick={() => onOpen(m.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface/60 transition-colors text-left">
              <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] font-bold text-textp">
                <span>{home.flag}</span><span className="tabular-nums">{m.real_home_score}</span>
                <span className="text-texts">–</span>
                <span className="tabular-nums">{m.real_away_score}</span><span>{away.flag}</span>
              </div>
              {pred && (
                <span className="text-[10px] text-texts font-semibold tabular-nums shrink-0">you {pred.pred_home}-{pred.pred_away}</span>
              )}
              <span className="text-sm font-extrabold tabular-nums shrink-0 w-9 text-right" style={{ color: ptsColor(pts) }}>+{pts}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* Form (last 5) + per-category accuracy */
function FormAccuracy({ items, weights }: { items: (MyPred | undefined)[]; weights: ScoringWeights }) {
  const scored = items.filter((p): p is MyPred => !!p)
  const form = scored.slice(0, 5)
  const total = scored.length
  const cats: { label: string; get: (p: MyPred) => number }[] = [
    { label: 'Outcome', get: (p) => p.pts_outcome ?? 0 },
    { label: 'Exact', get: (p) => p.pts_exact ?? 0 },
    { label: 'Goal diff', get: (p) => p.pts_goal_diff ?? 0 },
    { label: 'Total goals', get: (p) => p.pts_total_goals ?? 0 },
    { label: 'Both scored', get: (p) => p.pts_btts ?? 0 },
  ]
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border">
        <h3 className="font-extrabold text-textp text-[15px]">Form &amp; accuracy</h3>
        <span className="text-[11px] font-bold text-texts">{total} scored</span>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">Last {form.length}</p>
          <div className="flex items-center gap-1.5">
            {form.map((p, i) => {
              const pts = weightedMatchPoints(p, weights)
              return (
                <span key={i} title={`+${pts}`} className="w-6 h-6 grid place-items-center rounded-md text-[10px] font-extrabold tabular-nums text-white" style={{ background: ptsColor(pts) }}>{pts}</span>
              )
            })}
          </div>
        </div>
        <div className="space-y-2">
          {cats.map((c) => {
            const hits = scored.filter((p) => c.get(p) > 0).length
            const pct = total ? Math.round((hits / total) * 100) : 0
            return (
              <div key={c.label}>
                <div className="flex items-center justify-between text-[12px] font-semibold mb-1">
                  <span className="text-texts">{c.label}</span>
                  <span className="text-textp tabular-nums">{pct}%</span>
                </div>
                <ProgressBar pct={pct} height={5} />
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
