'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Card, StatCard, SectionHeader, Button, Skeleton, BoltIcon, EmptyState, CalIcon } from '@/components/ui'
import { NextPredictCard, LeaderboardTable, type LBRow } from '@/components/football'
import { toUIMatch, type DBMatch, type MyPred } from '@/lib/match-ui'
import { SCORING_RULES } from '@/lib/scoring'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [lb, setLb] = useState<LBRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
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
        .select('match_id, pred_home, pred_away, points_awarded')
        .eq('user_id', user.id)
      const map: Record<string, MyPred> = {}
      for (const p of myData ?? []) map[(p as { match_id: string }).match_id] = p as unknown as MyPred
      setPreds(map)

      // leaderboard aggregation
      const { data: scored } = await supabase
        .from('predictions')
        .select('user_id, points_awarded, profiles(username, avatar_url)')
        .not('points_awarded', 'is', null)
      const agg = new Map<string, LBRow>()
      for (const row of (scored ?? []) as unknown as { user_id: string; points_awarded: number; profiles: { username: string; avatar_url: string | null } | null }[]) {
        const cur = agg.get(row.user_id) ?? { id: row.user_id, name: row.profiles?.username ?? '?', avatar: row.profiles?.avatar_url, pts: 0, you: row.user_id === user.id }
        cur.pts += row.points_awarded
        agg.set(row.user_id, cur)
      }
      setLb(Array.from(agg.values()).sort((a, b) => b.pts - a.pts))
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
  const exactCount = useMemo(() => Object.values(preds).filter((p) => p.points_awarded != null && p.points_awarded >= 8).length, [preds])

  const upcoming = useMemo(() => matches
    .filter((m) => m.real_home_score === null && new Date(m.match_date) > new Date())
    .sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date)), [matches])
  const missingCount = upcoming.filter((m) => !preds[m.id]).length
  const next = upcoming.slice(0, 4)

  async function savePred(matchId: string, side: 'h' | 'a', val: number) {
    if (!userId) return
    const cur = preds[matchId] ?? { pred_home: 0, pred_away: 0, points_awarded: null }
    const updated: MyPred = { ...cur, pred_home: side === 'h' ? val : cur.pred_home, pred_away: side === 'a' ? val : cur.pred_away }
    setPreds((p) => ({ ...p, [matchId]: updated }))
    await supabase.from('predictions').upsert(
      { user_id: userId, match_id: matchId, pred_home: updated.pred_home, pred_away: updated.pred_away },
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="My Rank" value={myRank ? `#${myRank}` : '–'} sub={`of ${lb.length || 1} players`} accent="gold" />
        <StatCard label="Total Points" value={myPts} accent="green" />
        <StatCard label="Exact Scores" value={exactCount} accent="blue" />
        <StatCard label="Predictions" value={Object.keys(preds).length} sub={`${missingCount} still to make`} />
      </div>

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

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
