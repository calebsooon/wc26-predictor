'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { getActiveLeague, isMoneyLeague } from '@/lib/league'
import { buildGameweekRecap, type RecapMatch, type RecapPrediction } from '@/lib/gameweek-recap'
import { GW_NAMES, GW_SHORT, formatPrize, gwPrize } from '@/lib/prizes'
import { Card, EmptyState, PageHeader, Pill, Skeleton } from '@/components/ui'
import { LeaderboardTable } from '@/components/football'
import type { ProfileLite } from '@/lib/leaderboard'
import type { ScoringWeights } from '@/lib/scoring'

const PRED_COLS = 'user_id, match_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'

export default function RecapPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = Number(searchParams.get('gw'))
  const [gameweek, setGameweek] = useState(Number.isInteger(requested) && requested >= 1 && requested <= 8 ? requested : 1)
  const [matches, setMatches] = useState<RecapMatch[]>([])
  const [predictions, setPredictions] = useState<RecapPrediction[]>([])
  const [profiles, setProfiles] = useState<ProfileLite[]>([])
  const [weights, setWeights] = useState<ScoringWeights | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [money, setMoney] = useState(false)

  useEffect(() => {
    const next = Number(searchParams.get('gw'))
    if (Number.isInteger(next) && next >= 1 && next <= 8) setGameweek(next)
  }, [searchParams])

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    setUserId(user.id)
    const active = await getActiveLeague(supabase, user.id)
    setProfiles(active.memberProfiles)
    setWeights(active.weights)
    setMoney(isMoneyLeague(active.league))
    const ids = active.memberIds.length ? active.memberIds : [user.id]
    const [matchRes, predRes] = await Promise.all([
      supabase.from('matches').select('id, gw_number, home_team, away_team, real_home_score, real_away_score'),
      supabase.from('predictions').select(PRED_COLS).in('user_id', ids),
    ])
    setMatches((matchRes.data ?? []) as RecapMatch[])
    setPredictions((predRes.data ?? []) as RecapPrediction[])
  })() }, [router, supabase])

  if (!weights) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
  const recap = buildGameweekRecap({ gameweek, matches, predictions, profiles, userId, weights })
  const select = (next: number) => { setGameweek(next); router.replace(`/recap?gw=${next}`) }
  const storyLabel = { highest_points: 'Best single-match haul', consensus_miss: 'League consensus missed', exact_calls: 'Most exact-score calls' } as const

  return <div className="max-w-5xl mx-auto space-y-5">
    <PageHeader eyebrow="League recap" title={GW_NAMES[gameweek] ?? `Gameweek ${gameweek}`} sub={recap.state === 'final' ? `${recap.scoredMatches} matches settled — the week is final.` : recap.state === 'live' ? `${recap.scoredMatches} of ${recap.totalMatches} matches settled so far.` : 'No scored matches in this gameweek yet.'} action={<Link href="/leaderboard" className="text-sm font-bold text-primary">Leaderboard →</Link>} />
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">{Array.from({ length: 8 }, (_, index) => index + 1).map((gw) => <button key={gw} onClick={() => select(gw)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold border ${gw === gameweek ? 'bg-textp text-bg border-textp' : 'bg-card border-border text-texts'}`}>{GW_SHORT[gw]}</button>)}</div>
    {recap.totalMatches === 0 ? <EmptyState title="No fixtures in this gameweek" desc="Choose another gameweek to see the league story." /> : <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Highlight label="Gameweek leader" value={recap.leader?.name ?? '—'} sub={recap.leader ? `${recap.leader.pts} pts` : 'No scores yet'} />
        <Highlight label="Biggest climber" value={recap.climber?.row.name ?? '—'} sub={recap.climber ? `▲${recap.climber.movement} overall` : 'No movement yet'} />
        <Highlight label="Scoreline sniper" value={recap.sniper?.name ?? '—'} sub={recap.sniper ? `${recap.sniper.exact} exact scores` : 'No exact calls yet'} />
        <Highlight label={money ? 'Your prize position' : 'Your week'} value={recap.personal.row ? `${recap.personal.row.pts} pts` : '—'} sub={money && recap.personal.row ? `${formatPrize(gwPrize(recap.standings.findIndex((row) => row.id === userId) + 1))} at current rank` : recap.personal.movement ? `${recap.personal.movement > 0 ? '▲' : '▼'}${Math.abs(recap.personal.movement)} overall` : 'Still to score'} />
      </div>
      <Card className="p-5"><div className="flex items-center justify-between mb-4"><div><h2 className="font-display font-bold text-lg">The story of {GW_SHORT[gameweek]}</h2><p className="text-sm text-texts">The matches that moved the league.</p></div><Pill tone={recap.state === 'final' ? 'green' : 'gold'}>{recap.state === 'final' ? 'Final' : recap.state === 'live' ? 'Live' : 'Upcoming'}</Pill></div><div className="grid md:grid-cols-3 gap-3">{recap.stories.length ? recap.stories.map((story) => <div key={story.kind} className="rounded-xl border border-border bg-surface p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">{storyLabel[story.kind]}</p><p className="mt-2 font-bold">{story.match.home_team} {story.match.real_home_score ?? '–'}–{story.match.real_away_score ?? '–'} {story.match.away_team}</p><p className="mt-1 text-sm text-primary font-bold">{story.kind === 'consensus_miss' ? `${story.value}% missed the outcome` : story.kind === 'exact_calls' ? `${story.value} exact calls` : `${story.value} points earned`}</p></div>) : <p className="text-sm text-texts">Stories appear as results are scored.</p>}</div></Card>
      <Card className="p-4"><div className="mb-3"><h2 className="font-display font-bold text-lg">{GW_SHORT[gameweek]} standings</h2><p className="text-sm text-texts">Points from this gameweek only.</p></div><LeaderboardTable players={recap.standings.map((row, index) => money ? { ...row, prize: gwPrize(index + 1) } : row)} showPrize={money} /></Card>
      {recap.personal.row && <Card className="p-4 bg-primary/[0.05] border-primary/25"><p className="text-xs font-bold uppercase tracking-wider text-primary">Your takeaway</p><p className="mt-1 font-bold">You’re {recap.standings.findIndex((row) => row.id === userId) + 1}{ordinalSuffix(recap.standings.findIndex((row) => row.id === userId) + 1)} this gameweek with {recap.personal.row.pts} points{recap.personal.movement ? ` and ${recap.personal.movement > 0 ? 'climbed' : 'dropped'} ${Math.abs(recap.personal.movement)} overall.` : '.'}</p></Card>}
    </>}
  </div>
}

function Highlight({ label, value, sub }: { label: string; value: string; sub: string }) { return <Card className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">{label}</p><p className="mt-2 font-display text-lg font-bold truncate">{value}</p><p className="mt-1 text-xs text-texts">{sub}</p></Card> }
function ordinalSuffix(rank: number) { const tail = rank % 10; return rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : tail === 1 ? 'st' : tail === 2 ? 'nd' : tail === 3 ? 'rd' : 'th' }
