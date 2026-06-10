'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Card, StatCard, SectionHeader, Button, Skeleton, BoltIcon, EmptyState, CalIcon, Pill } from '@/components/ui'
import { NextPredictCard, LeaderboardTable, type LBRow } from '@/components/football'
import { toUIMatch, type DBMatch, type MyPred } from '@/lib/match-ui'
import { SCORING_RULES } from '@/lib/scoring'
import { computePrizeSnapshot, formatPrize, prizeTone, GW_NAMES, GW_PRIZES, OVERALL_PRIZES } from '@/lib/prizes'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }
interface ScoredPredRow {
  user_id: string; points_awarded: number; pts_outcome: number | null
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)')
        .order('"order"')
        .order('match_date', { referencedTable: 'matches' })

      const flat: DBMatch[] = []
      for (const r of (roundData ?? []) as unknown as RoundRow[]) {
        for (const m of r.matches ?? []) flat.push({ ...m, round_name: r.name })
      }
      setMatches(flat)

      const { data: myData } = await supabase
        .from('predictions')
        .select('match_id, pred_home, pred_away, points_awarded, pts_exact, pred_first_goal_team, pred_first_scorer_id')
        .eq('user_id', user.id)
      const map: Record<string, MyPred> = {}
      for (const p of myData ?? []) map[(p as { match_id: string }).match_id] = p as unknown as MyPred
      setPreds(map)

      // All scored predictions for leaderboard + prize calc
      const { data: scored } = await supabase
        .from('predictions')
        .select('user_id, points_awarded, pts_outcome, profiles(username, avatar_url), matches(gw_number)')
        .not('points_awarded', 'is', null)
      const allScored = (scored ?? []) as unknown as ScoredPredRow[]
      setScoredPreds(allScored)

      // Leaderboard aggregation (overall)
      const agg = new Map<string, LBRow>()
      for (const row of allScored) {
        const cur = agg.get(row.user_id) ?? { id: row.user_id, name: row.profiles?.username ?? '?', avatar: row.profiles?.avatar_url, pts: 0, you: row.user_id === user.id }
        cur.pts += row.points_awarded
        agg.set(row.user_id, cur)
      }
      setLb(Array.from(agg.values()).sort((a, b) => b.pts - a.pts))

      // GW match status for prize range
      const { data: gwMatches } = await supabase
        .from('matches')
        .select('gw_number, real_home_score')
        .not('gw_number', 'is', null)
      setGwMatchRows((gwMatches ?? []) as unknown as MatchGWRow[])

      const { data: tp } = await supabase.from('tournament_predictions').select('user_id').eq('user_id', user.id).maybeSingle()
      setHasTournamentPick(!!tp)

      setLoading(false)
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

  const upcoming = useMemo(() => matches
    .filter((m) => m.real_home_score === null && new Date(m.match_date) > new Date())
    .sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date)), [matches])
  const missingCount = upcoming.filter((m) => !preds[m.id]).length
  const next = upcoming.slice(0, 4)

  const prize = useMemo(() => {
    if (!userId || scoredPreds.length === 0) return null
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
      points_awarded: r.points_awarded,
      pts_outcome: r.pts_outcome,
      gw_number: r.matches?.gw_number ?? null,
    }))
    return computePrizeSnapshot({ userId, allScoredPreds: predsForCalc, gwMatchStatus, overallRank: myRank })
  }, [userId, scoredPreds, gwMatchRows, myRank])

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between flex-wrap gap-3 pb-4 border-b border-border">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary mb-1.5">World Cup 2026</div>
          <h1 className="text-2xl sm:text-[28px] font-black tracking-tight leading-none">Dashboard</h1>
          <p className="text-texts font-medium mt-2 text-sm">
            {myRank ? <>You&apos;re <span className="text-gold font-bold">{ordinal(myRank)}</span></> : 'Make your first picks'}
            {missingCount > 0 && <> · <span className="text-error font-bold">{missingCount} predictions missing</span></>}
          </p>
        </div>
        <Link href="/predictions"><Button variant="primary" icon={<BoltIcon size={16} />}>Make predictions</Button></Link>
      </div>

      {!hasTournamentPick && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gold/[0.07] border border-gold/20">
          <div>
            <p className="text-sm font-bold text-textp">Make your tournament picks</p>
            <p className="text-xs text-texts mt-0.5">Pick champion, finalists and more before the knockout rounds start.</p>
          </div>
          <Link href="/bracket?tab=picks" className="shrink-0">
            <Pill tone="gold">Pick now →</Pill>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="My Rank" value={myRank ? `#${myRank}` : '–'} sub={`of ${lb.length || 1} players`} accent="gold" />
        <StatCard label="Total Points" value={myPts} accent="green" />
        <StatCard label="Exact Scores" value={exactCount} accent="blue" />
        <StatCard label="Predictions" value={Object.keys(preds).length} sub={`${missingCount} still to make`} />
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
            <EmptyState icon={<CalIcon size={22} />} title="No upcoming matches" desc="Fixtures will appear here as kickoff approaches." />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
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

          <Card className="overflow-hidden">
            <div className="flex items-center px-4 h-12 border-b border-border"><h3 className="font-extrabold text-textp text-[15px]">Scoring</h3></div>
            <div className="divide-y divide-border/60">
              {SCORING_RULES.map((s) => (
                <div key={s.key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[13px] font-medium text-texts">{s.label}</span>
                  <span className="text-sm font-extrabold tabular-nums text-primary">+{s.pts}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
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
          <p className="text-xl font-extrabold tabular-nums text-textp">
            <span className="text-error">{rangeMinLabel}</span>
            <span className="text-texts text-sm font-bold mx-0.5">→</span>
            <span className="text-success">{rangeMaxLabel}</span>
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts mt-0.5">Range</p>
          <p className="text-[10px] text-texts">best to worst case</p>
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
