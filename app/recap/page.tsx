'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { GameweekRecap, CategoryStat, MatchSummary, PersonalBreakdown, FirstScorerInsight, TopGoalScorer } from '@/lib/gameweek-recap'
import { GW_NAMES, GW_SHORT, formatPrize, gwPrize } from '@/lib/prizes'
import { Card, EmptyState, PageHeader, Pill, Skeleton } from '@/components/ui'
import { LeaderboardTable } from '@/components/football'
import { RecapShareActions } from '@/components/RecapShareActions'

type RecapPayload = { recap: GameweekRecap; money: boolean }

export default function RecapPage() {
  return (
    <Suspense fallback={<RecapSkeleton />}>
      <RecapContent />
    </Suspense>
  )
}

function RecapSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-36 rounded-2xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  )
}

function RecapContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = Number(searchParams.get('gw'))
  const [gameweek, setGameweek] = useState(Number.isInteger(requested) && requested >= 1 && requested <= 8 ? requested : 1)
  const [payload, setPayload] = useState<RecapPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const next = Number(searchParams.get('gw'))
    if (Number.isInteger(next) && next >= 1 && next <= 8) setGameweek(next)
  }, [searchParams])

  useEffect(() => {
    setPayload(null); setError(null); setLoading(true)
    fetch(`/api/recap?gw=${gameweek}`)
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error ?? 'Unable to load recap'); setPayload(body) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load recap'))
      .finally(() => setLoading(false))
  }, [gameweek])

  const select = (next: number) => { setGameweek(next); router.replace(`/recap?gw=${next}`) }

  const gwTabs = (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {Array.from({ length: 8 }, (_, i) => i + 1).map((gw) => (
        <button key={gw} onClick={() => select(gw)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold border transition-colors ${gw === gameweek ? 'bg-textp text-bg border-textp' : 'bg-card border-border text-texts hover:border-primary/40'}`}>
          {GW_SHORT[gw]}
        </button>
      ))}
    </div>
  )

  if (error) return <div className="max-w-5xl mx-auto space-y-5">{gwTabs}<EmptyState title="Couldn't load recap" desc={error} /></div>
  if (loading || !payload) return <RecapSkeleton />

  const { recap, money } = payload
  const userRankIndex = recap.standings.findIndex((r) => r.id === recap.personal.row?.id)
  const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null
  const weekPoints = recap.standings.reduce((s, r) => s + r.pts, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader
        eyebrow="League recap"
        title={GW_NAMES[gameweek] ?? `Gameweek ${gameweek}`}
        sub={recap.state === 'final' ? `${recap.scoredMatches} matches settled — the week is final.` : recap.state === 'live' ? `${recap.scoredMatches} of ${recap.totalMatches} matches settled so far.` : 'No scored matches yet.'}
        action={
          <div className="flex items-center gap-3">
            <RecapShareActions title={recap.headline} subtitle={recap.moment?.body ?? (recap.leader ? `${recap.leader.name} led with ${recap.leader.pts} points.` : 'Your private league story.')} text={recap.shareText} />
            <Link href="/leaderboard" className="text-sm font-bold text-primary">Leaderboard →</Link>
          </div>
        }
      />

      {gwTabs}

      {recap.totalMatches === 0 ? (
        <EmptyState title="No fixtures in this gameweek" desc="Choose another gameweek to see the league story." />
      ) : (
        <>
          {/* ── Headline card ─────────────────────────────────────── */}
          <Card className="relative overflow-hidden border-primary/30 bg-primary/[0.06] p-5 sm:p-6">
            <div className="absolute right-[-45px] top-[-70px] h-44 w-44 rounded-full bg-primary/15 blur-2xl" />
            <p className="relative text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{recap.moment?.title ?? 'Gameweek headline'}</p>
            <h2 className="relative mt-2 max-w-3xl font-display text-2xl font-black tracking-tight text-textp sm:text-3xl">{recap.headline}</h2>
            {recap.moment && <p className="relative mt-2 max-w-2xl text-sm text-texts">{recap.moment.body}</p>}
            <p className="relative mt-4 text-xs font-bold text-textp">
              {recap.personal.row && userRank
                ? `Your week: ${userRank}${ordinalSuffix(userRank)} · ${recap.personal.row.pts} pts · ${recap.personal.row.exact ?? 0} exact${recap.personal.movement ? ` · ${recap.personal.movement > 0 ? '▲' : '▼'}${Math.abs(recap.personal.movement)} overall` : ''}`
                : 'Your week is still to score.'}
            </p>
          </Card>

          {/* ── 4-stat bar ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RecapNumber label="Week leader" value={recap.leader?.name ?? '—'} sub={recap.leader ? `${recap.leader.pts} pts` : 'Awaiting scores'} />
            <RecapNumber label="Biggest leap" value={recap.climber?.row.name ?? '—'} sub={recap.climber ? `+${recap.climber.movement} places` : 'No movement'} />
            <RecapNumber label="Sniper" value={recap.sniper ? `${recap.sniper.exact} exact` : '—'} sub={recap.sniper?.name ?? 'No perfect calls yet'} />
            <RecapNumber label="Settled" value={`${recap.scoredMatches}/${recap.totalMatches}`} sub={recap.state === 'final' ? 'Week final' : 'Still live'} />
          </div>

          {/* ── Podium + radar ────────────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-[1.4fr_.6fr]">
            <Card className="p-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">The podium</p>
                  <h2 className="mt-1 font-display text-xl font-black text-textp">Who owned {GW_SHORT[gameweek]}</h2>
                </div>
                <span className="text-xs font-bold text-primary">{weekPoints} pts total</span>
              </div>
              <div className="grid gap-2">
                {recap.standings.length ? recap.standings.slice(0, 3).map((row, i) => (
                  <div key={row.id} className={`flex items-center gap-3 rounded-xl border p-3 ${i === 0 ? 'border-gold/40 bg-gold/10' : 'border-border bg-surface'}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black ${i === 0 ? 'bg-gold text-bg' : 'bg-card text-texts'}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-textp">{row.name}</p>
                      <p className="text-[11px] text-texts">{row.exact ?? 0} exact · {row.acc}% outcomes</p>
                    </div>
                    {money && <span className="text-[11px] font-bold text-texts shrink-0">{formatPrize(gwPrize(i + 1))}</span>}
                    <span className="text-lg font-black tabular-nums text-textp shrink-0">{row.pts}</span>
                  </div>
                )) : <p className="text-sm text-texts">The podium forms once results settle.</p>}
                {recap.standings.length > 3 && (
                  <p className="text-center text-xs text-texts pt-1">&plus;{recap.standings.length - 3} more in the full table below</p>
                )}
              </div>
            </Card>

            <Card className="p-5 flex flex-col gap-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">Highlights</p>
              {recap.topGoalScorer && (
                <HighlightBar
                  label="Top scorer"
                  value={recap.topGoalScorer.name ?? `Player #${recap.topGoalScorer.playerId}`}
                  sub={`${recap.topGoalScorer.goals}G ${recap.topGoalScorer.assists}A · ${recap.topGoalScorer.teamCode}`}
                  accent="gold"
                />
              )}
              {recap.faller && (
                <HighlightBar
                  label="Biggest faller"
                  value={recap.faller.row.name}
                  sub={`▼ ${Math.abs(recap.faller.movement)} overall`}
                  accent="coral"
                />
              )}
              {recap.hardestMatch && recap.hardestMatch.outcomeAccuracy != null && (
                <HighlightBar
                  label="Toughest match"
                  value={`${recap.hardestMatch.match.home_team} vs ${recap.hardestMatch.match.away_team}`}
                  sub={`${recap.hardestMatch.outcomeAccuracy}% outcome accuracy`}
                  accent="blue"
                />
              )}
              {recap.climber && (
                <HighlightBar
                  label="Biggest climber"
                  value={recap.climber.row.name}
                  sub={`▲ ${recap.climber.movement} overall`}
                  accent="green"
                />
              )}
            </Card>
          </div>

          {/* ── Category accuracy ─────────────────────────────────── */}
          {recap.categoryBreakdown && Object.keys(recap.categoryBreakdown).length > 0 && (
            <Card className="p-5">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">Scoring accuracy</p>
                <h2 className="mt-1 font-display text-lg font-black text-textp">How the league fared by category</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                {(Object.entries(recap.categoryBreakdown) as [string, CategoryStat][]).map(([key, stat]) => (
                  <CategoryBar key={key} label={CAT_LABELS[key] ?? key} stat={stat} />
                ))}
              </div>
            </Card>
          )}

          {/* ── Match-by-match ────────────────────────────────────── */}
          {recap.matchSummaries.length > 0 && (
            <Card className="p-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">Match by match</p>
                  <h2 className="mt-1 font-display text-lg font-black text-textp">Every game this week</h2>
                </div>
                <p className="text-xs text-texts">Sorted by avg points</p>
              </div>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-texts border-b border-border">
                      <th className="pb-2 pr-4">Match</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">Result</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">Outcome %</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">Exact</th>
                      <th className="pb-2 px-3 text-right whitespace-nowrap">Avg pts</th>
                      <th className="pb-2 pl-3 text-right whitespace-nowrap">xG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recap.matchSummaries.map((ms) => (
                      <MatchRow key={ms.match.id} ms={ms} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Insights row ──────────────────────────────────────── */}
          {(recap.firstScorerInsight || recap.topGoalScorer) && (
            <div className="grid md:grid-cols-2 gap-3">
              {recap.firstScorerInsight && <FirstScorerCard insight={recap.firstScorerInsight} />}
              {recap.topGoalScorer && <TopScorerCard scorer={recap.topGoalScorer} />}
            </div>
          )}

          {/* ── Personal breakdown ────────────────────────────────── */}
          {recap.personalBreakdown && <PersonalBreakdownCard pb={recap.personalBreakdown} leagueSize={recap.leagueSize} />}

          {/* ── Stories ───────────────────────────────────────────── */}
          {recap.stories.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display font-bold text-lg">The story of {GW_SHORT[gameweek]}</h2>
                  <p className="text-sm text-texts">The matches that moved the league.</p>
                </div>
                <Pill tone={recap.state === 'final' ? 'green' : 'gold'}>{recap.state === 'final' ? 'Final' : recap.state === 'live' ? 'Live' : 'Upcoming'}</Pill>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {recap.stories.map((story) => (
                  <Link href={`/match/${story.match.id}`} key={story.kind} className="rounded-xl border border-border bg-surface p-4 transition hover:border-primary/60">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-texts">{STORY_LABELS[story.kind]}</p>
                    <p className="mt-2 font-bold text-sm">{story.match.home_team} {story.match.real_home_score ?? '–'}–{story.match.real_away_score ?? '–'} {story.match.away_team}</p>
                    <p className="mt-1 text-sm text-primary font-bold">
                      {story.kind === 'consensus_miss' ? `${story.value}% missed the outcome`
                        : story.kind === 'exact_calls' ? `${story.value} exact call${story.value === 1 ? '' : 's'}`
                        : story.kind === 'xg_miss' ? `${story.value} xG for the losing side`
                        : `${story.value} pts earned`}
                    </p>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ── Full standings ────────────────────────────────────── */}
          <details className="group rounded-2xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-display font-bold text-textp">
              Full {GW_SHORT[gameweek]} table
              <span className="text-xs font-sans font-bold text-texts group-open:hidden">Show standings ↓</span>
              <span className="hidden text-xs font-sans font-bold text-texts group-open:inline">Hide standings ↑</span>
            </summary>
            <div className="border-t border-border p-4">
              <p className="mb-3 text-sm text-texts">Points from this gameweek only.</p>
              <LeaderboardTable
                players={recap.standings.map((row, i) => money ? { ...row, prize: gwPrize(i + 1) } : row)}
                showPrize={money}
              />
            </div>
          </details>
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────

const CAT_LABELS: Record<string, string> = {
  outcome: 'Outcomes',
  exact: 'Exact scores',
  goalDiff: 'Goal diff',
  totalGoals: 'Total goals',
  btts: 'BTTS',
  firstTeam: 'First team',
  firstScorer: 'First scorer',
}

const STORY_LABELS = {
  highest_points: 'Best single-match haul',
  consensus_miss: 'League consensus missed',
  exact_calls: 'Most exact-score calls',
  xg_miss: 'xG upset of the week',
} as const

function RecapNumber({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <p className="truncate text-[9px] font-bold uppercase tracking-wider text-texts">{label}</p>
      <p className="mt-2 truncate text-base font-black text-textp sm:text-lg">{value}</p>
      <p className="mt-1 truncate text-[10px] text-texts">{sub}</p>
    </Card>
  )
}

function HighlightBar({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: 'gold' | 'coral' | 'blue' | 'green' }) {
  const colors: Record<string, string> = {
    gold: 'border-gold/60',
    coral: 'border-coral/60',
    blue: 'border-blue/60',
    green: 'border-green-500/60',
  }
  return (
    <div className={`border-l-2 ${colors[accent]} pl-3`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-texts">{label}</p>
      <p className="mt-0.5 truncate text-sm font-extrabold text-textp">{value}</p>
      <p className="mt-0.5 text-[11px] text-texts">{sub}</p>
    </div>
  )
}

function CategoryBar({ label, stat }: { label: string; stat: CategoryStat }) {
  const pct = Math.round(stat.rate * 100)
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] font-bold text-textp">{label}</span>
        <span className="text-[11px] font-bold tabular-nums text-texts">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-texts">{stat.hits}/{stat.total} picks</p>
    </div>
  )
}

function MatchRow({ ms }: { ms: MatchSummary }) {
  const xgLabel = ms.homeXg != null && ms.awayXg != null
    ? `${ms.homeXg.toFixed(1)} – ${ms.awayXg.toFixed(1)}`
    : ms.homeXg != null ? `${ms.homeXg.toFixed(1)} –` : '—'
  return (
    <tr className="text-sm">
      <td className="py-2.5 pr-4">
        <Link href={`/match/${ms.match.id}`} className="font-bold text-textp hover:text-primary transition-colors">
          {ms.match.home_team} vs {ms.match.away_team}
        </Link>
      </td>
      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-textp">
        {ms.match.real_home_score ?? '–'}&ndash;{ms.match.real_away_score ?? '–'}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums">
        {ms.outcomeAccuracy != null ? (
          <span className={`font-bold ${ms.outcomeAccuracy >= 60 ? 'text-green-500' : ms.outcomeAccuracy < 30 ? 'text-coral' : 'text-texts'}`}>
            {ms.outcomeAccuracy}%
          </span>
        ) : <span className="text-texts">—</span>}
      </td>
      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-textp">
        {ms.exactCount || '—'}
      </td>
      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-textp">
        {ms.avgPts > 0 ? ms.avgPts.toFixed(1) : '—'}
      </td>
      <td className="py-2.5 pl-3 text-right text-texts tabular-nums">
        {xgLabel}
      </td>
    </tr>
  )
}

function FirstScorerCard({ insight }: { insight: FirstScorerInsight }) {
  const hitPct = insight.totalPickers > 0 ? Math.round(insight.hitRate * 100) : 0
  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">First scorer spotlight</p>
        <h3 className="mt-1 font-display font-black text-lg text-textp">Who backed the opener?</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-surface p-3 text-center">
          <p className="text-xl font-black text-textp">{insight.totalPickers}</p>
          <p className="text-[10px] font-bold text-texts mt-0.5">Pickers</p>
        </div>
        <div className="rounded-xl bg-surface p-3 text-center">
          <p className="text-xl font-black text-textp">{insight.hits}</p>
          <p className="text-[10px] font-bold text-texts mt-0.5">Correct</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${hitPct > 0 ? 'bg-primary/10' : 'bg-surface'}`}>
          <p className={`text-xl font-black ${hitPct > 0 ? 'text-primary' : 'text-texts'}`}>{hitPct}%</p>
          <p className="text-[10px] font-bold text-texts mt-0.5">Hit rate</p>
        </div>
      </div>
      <div className="space-y-2">
        {insight.noPickers > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-texts">Picked &ldquo;no scorer&rdquo;</span>
            <span className="font-bold text-textp">{insight.noPickers}</span>
          </div>
        )}
        {insight.mostPickedCount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-texts">Most-backed player</span>
            <span className="font-bold text-textp">
              {insight.mostPickedId ? `#${insight.mostPickedId}` : '—'} ({insight.mostPickedCount} picks)
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}

function TopScorerCard({ scorer }: { scorer: TopGoalScorer }) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">Top performer</p>
        <h3 className="mt-1 font-display font-black text-lg text-textp">Standout this gameweek</h3>
      </div>
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-xl bg-gold/15 text-gold shrink-0">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/><path fill="none" stroke="white" strokeWidth="1.5" d="M12 7v5l3 3"/></svg>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-black text-textp truncate">{scorer.name ?? `Player #${scorer.playerId}`}</p>
          <p className="text-sm text-texts">{scorer.teamCode}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface p-3 text-center">
          <p className="text-2xl font-black text-gold">{scorer.goals}</p>
          <p className="text-[10px] font-bold text-texts mt-0.5">Goals</p>
        </div>
        <div className="rounded-xl bg-surface p-3 text-center">
          <p className="text-2xl font-black text-textp">{scorer.assists}</p>
          <p className="text-[10px] font-bold text-texts mt-0.5">Assists</p>
        </div>
      </div>
    </Card>
  )
}

function PersonalBreakdownCard({ pb, leagueSize }: { pb: PersonalBreakdown; leagueSize: number }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-texts">Your breakdown</p>
          <h2 className="mt-1 font-display text-lg font-black text-textp">Your week vs the league</h2>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-textp">{pb.totalPts}</p>
          <p className="text-[10px] text-texts">#{pb.rank} of {leagueSize}</p>
        </div>
      </div>
      <div className="space-y-3">
        {pb.categories.filter((c) => c.leagueHitRate > 0 || c.yourHits > 0).map((cat) => {
          const you = Math.round(cat.yourHits > 0 ? (cat.yourHits / (pb.categories.find((c2) => c2.key === cat.key)?.yourHits ?? 1) * 100) : 0)
          const leaguePct = Math.round(cat.leagueHitRate * 100)
          const ahead = cat.yourPts > cat.leagueAvgPts
          return (
            <div key={cat.key}>
              <div className="flex justify-between mb-1 text-[11px]">
                <span className="font-bold text-textp">{cat.label}</span>
                <span className={`font-bold ${ahead ? 'text-green-500' : 'text-texts'}`}>
                  {cat.yourPts > 0 ? `+${cat.yourPts}` : cat.yourPts} pts · {cat.yourHits}/{cat.leagueHitRate > 0 ? Math.round(cat.leagueHitRate * 100) : '?'}% league
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-surface overflow-hidden">
                <div className="h-full rounded-full bg-faint transition-all" style={{ width: `${leaguePct}%` }} />
                <div className={`absolute top-0 h-full rounded-full transition-all ${ahead ? 'bg-primary' : 'bg-coral/60'}`} style={{ width: `${Math.min(100, you)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[10px] text-texts">Blue bar = you · Grey bar = league average</p>
    </Card>
  )
}

function ordinalSuffix(n: number) {
  const tail = n % 10
  return n % 100 >= 11 && n % 100 <= 13 ? 'th' : tail === 1 ? 'st' : tail === 2 ? 'nd' : tail === 3 ? 'rd' : 'th'
}
