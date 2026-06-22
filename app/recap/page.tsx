'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { GameweekRecap } from '@/lib/gameweek-recap'
import { GW_NAMES, GW_SHORT, formatPrize, gwPrize } from '@/lib/prizes'
import { Card, EmptyState, PageHeader, Pill, Skeleton } from '@/components/ui'
import { LeaderboardTable } from '@/components/football'
import { RecapShareActions } from '@/components/RecapShareActions'

type RecapPayload = { recap: GameweekRecap; money: boolean }

export default function RecapPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>}>
      <RecapContent />
    </Suspense>
  )
}

function RecapContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = Number(searchParams.get('gw'))
  const [gameweek, setGameweek] = useState(Number.isInteger(requested) && requested >= 1 && requested <= 8 ? requested : 1)
  const [payload, setPayload] = useState<RecapPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { const next = Number(searchParams.get('gw')); if (Number.isInteger(next) && next >= 1 && next <= 8) setGameweek(next) }, [searchParams])
  useEffect(() => {
    setPayload(null); setError(null)
    fetch(`/api/recap?gw=${gameweek}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to load recap'); setPayload(body) }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load recap'))
  }, [gameweek])
  const select = (next: number) => { setGameweek(next); router.replace(`/recap?gw=${next}`) }
  if (error) return <EmptyState title="Couldn’t load recap" desc={error} />
  if (!payload) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
  const { recap, money } = payload
  const storyLabel = { highest_points: 'Best single-match haul', consensus_miss: 'League consensus missed', exact_calls: 'Most exact-score calls', xg_miss: 'xG upset of the week' } as const
  const podium = recap.standings.slice(0, 3)
  const weekPoints = recap.standings.reduce((sum, row) => sum + row.pts, 0)

  return <div className="max-w-5xl mx-auto space-y-5">
    <PageHeader eyebrow="League recap" title={GW_NAMES[gameweek] ?? `Gameweek ${gameweek}`} sub={recap.state === 'final' ? `${recap.scoredMatches} matches settled — the week is final.` : recap.state === 'live' ? `${recap.scoredMatches} of ${recap.totalMatches} matches settled so far.` : 'No scored matches in this gameweek yet.'} action={<div className="flex items-center gap-3"><RecapShareActions title={recap.headline} subtitle={recap.moment?.body ?? (recap.leader ? `${recap.leader.name} led the week with ${recap.leader.pts} points.` : 'Your private league story.')} text={recap.shareText} /><Link href="/leaderboard" className="text-sm font-bold text-primary">Leaderboard →</Link></div>} />
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">{Array.from({ length: 8 }, (_, index) => index + 1).map((gw) => <button key={gw} onClick={() => select(gw)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold border ${gw === gameweek ? 'bg-textp text-bg border-textp' : 'bg-card border-border text-texts'}`}>{GW_SHORT[gw]}</button>)}</div>
    {recap.totalMatches === 0 ? <EmptyState title="No fixtures in this gameweek" desc="Choose another gameweek to see the league story." /> : <>
      <Card className="relative overflow-hidden border-primary/30 bg-primary/[0.06] p-5 sm:p-6"><div className="absolute right-[-45px] top-[-70px] h-44 w-44 rounded-full bg-primary/15 blur-2xl" /><p className="relative text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{recap.moment?.title ?? 'Gameweek headline'}</p><h2 className="relative mt-2 max-w-3xl font-display text-2xl font-black tracking-tight text-textp sm:text-3xl">{recap.headline}</h2>{recap.moment && <p className="relative mt-2 max-w-2xl text-sm text-texts">{recap.moment.body}</p>}<p className="relative mt-4 text-xs font-bold text-textp">Your week: {recap.personal.row ? `${recap.standings.findIndex((row) => row.id === recap.personal.row?.id) + 1}${ordinalSuffix(recap.standings.findIndex((row) => row.id === recap.personal.row?.id) + 1)} · ${recap.personal.row.pts} pts · ${recap.personal.row.exact ?? 0} exact` : 'still to score'}{recap.personal.movement ? ` · ${recap.personal.movement > 0 ? '▲' : '▼'}${Math.abs(recap.personal.movement)} overall` : ''}</p></Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RecapNumber label="Week leader" value={recap.leader?.name ?? '—'} sub={recap.leader ? `${recap.leader.pts} pts` : 'Awaiting scores'} />
        <RecapNumber label="Biggest leap" value={recap.climber?.row.name ?? '—'} sub={recap.climber ? `+${recap.climber.movement} overall` : 'No movement yet'} />
        <RecapNumber label="Exact calls" value={String(recap.sniper?.exact ?? 0)} sub={recap.sniper ? recap.sniper.name : 'No perfect scores'} />
        <RecapNumber label="Settled" value={`${recap.scoredMatches}/${recap.totalMatches}`} sub={recap.state === 'final' ? 'Week final' : 'Still live'} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.25fr_.75fr]">
        <Card className="p-5"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">The podium</p><h2 className="mt-1 font-display text-xl font-black text-textp">Who owned {GW_SHORT[gameweek]}</h2></div><span className="text-xs font-bold text-primary">{weekPoints} points claimed</span></div><div className="grid gap-2">{podium.length ? podium.map((row, index) => <div key={row.id} className={`flex items-center gap-3 rounded-xl border p-3 ${index === 0 ? 'border-gold/40 bg-gold/10' : 'border-border bg-surface'}`}><span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-black ${index === 0 ? 'bg-gold text-bg' : 'bg-card text-texts'}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-textp">{row.name}</p><p className="text-[11px] text-texts">{row.exact ?? 0} exact calls · {row.acc}% outcomes</p></div><span className="text-lg font-black tabular-nums text-textp">{row.pts}</span></div>) : <p className="text-sm text-texts">The podium forms once results settle.</p>}</div></Card>
        <Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">Week radar</p><div className="mt-3 space-y-3"><Radar label="Biggest climb" value={recap.climber?.row.name ?? 'No movement'} sub={recap.climber ? `▲ ${recap.climber.movement} overall places` : 'Rank changes appear after scoring'} /><Radar label="Exact-score artist" value={recap.sniper?.name ?? 'No exact calls'} sub={recap.sniper ? `${recap.sniper.exact} perfect scorelines` : 'Still up for grabs'} /><Radar label={money ? 'Your prize position' : 'Your week'} value={recap.personal.row ? `${recap.personal.row.pts} pts` : 'Still to score'} sub={money && recap.personal.row ? `${formatPrize(gwPrize(recap.standings.findIndex((row) => row.id === recap.personal.row?.id) + 1))} at current rank` : 'Your result is part of the story'} /></div></Card>
      </div>
      <Card className="p-5"><div className="flex items-center justify-between mb-4"><div><h2 className="font-display font-bold text-lg">The story of {GW_SHORT[gameweek]}</h2><p className="text-sm text-texts">The matches that moved the league.</p></div><Pill tone={recap.state === 'final' ? 'green' : 'gold'}>{recap.state === 'final' ? 'Final' : recap.state === 'live' ? 'Live' : 'Upcoming'}</Pill></div><div className="grid md:grid-cols-3 gap-3">{recap.stories.length ? recap.stories.map((story) => <Link href={`/match/${story.match.id}`} key={story.kind} className="rounded-xl border border-border bg-surface p-4 transition hover:border-primary/60"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">{storyLabel[story.kind]}</p><p className="mt-2 font-bold">{story.match.home_team} {story.match.real_home_score ?? '–'}–{story.match.real_away_score ?? '–'} {story.match.away_team}</p><p className="mt-1 text-sm text-primary font-bold">{story.kind === 'consensus_miss' ? `${story.value}% missed the outcome` : story.kind === 'exact_calls' ? `${story.value} exact calls` : story.kind === 'xg_miss' ? `${story.value} xG for the loser` : `${story.value} points earned`}</p></Link>) : <p className="text-sm text-texts">Stories appear as results are scored.</p>}</div></Card>
      <details className="group rounded-2xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-display font-bold text-textp">Full {GW_SHORT[gameweek]} table <span className="text-xs font-sans font-bold text-texts group-open:hidden">Show standings ↓</span><span className="hidden text-xs font-sans font-bold text-texts group-open:inline">Hide standings ↑</span></summary><div className="border-t border-border p-4"><p className="mb-3 text-sm text-texts">Points from this gameweek only.</p><LeaderboardTable players={recap.standings.map((row, index) => money ? { ...row, prize: gwPrize(index + 1) } : row)} showPrize={money} /></div></details>
    </>}
  </div>
}

function Radar({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="border-l-2 border-primary/50 pl-3"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">{label}</p><p className="mt-0.5 truncate text-sm font-extrabold text-textp">{value}</p><p className="mt-0.5 text-[11px] text-texts">{sub}</p></div> }
function RecapNumber({ label, value, sub }: { label: string; value: string; sub: string }) { return <Card className="min-w-0 p-3 sm:p-4"><p className="truncate text-[9px] font-bold uppercase tracking-wider text-texts">{label}</p><p className="mt-2 truncate text-base font-black text-textp sm:text-lg">{value}</p><p className="mt-1 truncate text-[10px] text-texts">{sub}</p></Card> }
function ordinalSuffix(rank: number) { const tail = rank % 10; return rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : tail === 1 ? 'st' : tail === 2 ? 'nd' : tail === 3 ? 'rd' : 'th' }
