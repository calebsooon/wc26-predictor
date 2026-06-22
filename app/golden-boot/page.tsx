'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHeader, Card, Skeleton, Avatar, Tabs, EmptyState, TrophyIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { getTeam } from '@/lib/teams'
import { useUrlState } from '@/lib/url-state'

interface Stat {
  name: string
  photo: string | null
  goals: number
  assists: number
  minutes: number
  rank: number | null
  order: number | null
  code: string | null
}

type Tab = 'goals' | 'assists' | 'contributions'

export default function GoldenBootPage() {
  const { searchParams, replaceUrl } = useUrlState()
  const [scorers, setScorers] = useState<Stat[] | null>(null)
  const [assists, setAssists] = useState<Stat[] | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return t === 'assists' || t === 'contributions' ? t : 'goals'
  })
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      const response = await fetch('/api/golden-boot')
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error ?? 'Failed to load')
      setScorers(data.scorers ?? [])
      setAssists(data.assists ?? [])
      setUpdatedAt(data.updatedAt ?? new Date().toISOString())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = searchParams.get('tab')
    setTab(t === 'assists' || t === 'contributions' ? t : 'goals')
  }, [searchParams])

  const loading = !scorers && !assists && !error

  // Combined G+A list — deduplicate by name+code, sort by total contributions
  const combined: Stat[] = (() => {
    if (!scorers || !assists) return []
    const map = new Map<string, Stat>()
    for (const s of scorers) {
      const key = `${s.name}|${s.code}`
      map.set(key, { ...s })
    }
    for (const a of assists) {
      const key = `${a.name}|${a.code}`
      const existing = map.get(key)
      if (existing) {
        existing.assists = Math.max(existing.assists, a.assists)
      } else {
        map.set(key, { ...a })
      }
    }
    return [...map.values()]
      .filter((s) => s.goals > 0 || s.assists > 0)
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals || a.minutes - b.minutes)
  })()

  const rows = tab === 'goals' ? scorers : tab === 'assists' ? assists : combined
  const metric = (s: Stat) => tab === 'goals' ? s.goals : tab === 'assists' ? s.assists : s.goals + s.assists

  const leader = rows?.[0] ?? null

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader
        eyebrow="World Cup 2026"
        title="Golden Boot"
        sub={updatedAt
          ? `Synced ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}`
          : 'Official FIFA top scorers and assists.'}
        action={
          <button
            onClick={() => void refresh()}
            disabled={refreshing}
            className="h-9 px-3 rounded-xl border border-border bg-surface text-xs font-bold text-textp hover:bg-surface2 disabled:opacity-50 transition-colors"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {/* Leader spotlight */}
      {!loading && !error && leader && (
        <LeaderSpotlight leader={leader} tab={tab} />
      )}
      {loading && <Skeleton className="h-28 rounded-2xl" />}

      <Tabs
        tabs={[
          { key: 'goals', label: 'Top Scorers' },
          { key: 'assists', label: 'Top Assists' },
          { key: 'contributions', label: 'G+A' },
        ]}
        ariaLabel="Golden Boot standings"
        panelIdPrefix="golden-boot"
        value={tab}
        onChange={(k) => {
          const next = k as Tab
          setTab(next)
          replaceUrl({ tab: next === 'goals' ? null : next })
        }}
      />

      <div id={`golden-boot-panel-${tab}`} role="tabpanel" aria-labelledby={`golden-boot-tab-${tab}`}>
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        )}
        {error && <EmptyState icon={<TrophyIcon size={22} />} title="Couldn't load" desc={error} />}

        {rows && rows.length > 0 && (
          <>
            <p className="text-[11px] text-texts/50 px-1 mb-2">
              {tab === 'goals' && 'Fewer minutes ranks higher at equal goals (FIFA official tiebreaker)'}
              {tab === 'assists' && 'Fewer minutes ranks higher at equal assists (FIFA official tiebreaker)'}
              {tab === 'contributions' && 'Combined goals + assists · sorted by total then goals then minutes'}
            </p>
            <Card className="overflow-hidden divide-y divide-border/60">
              {rows.map((s, i) => {
                const rank = tab === 'contributions' ? i + 1 : (s.rank ?? i + 1)
                const minPer = tab === 'goals' && s.goals > 0 ? Math.round(s.minutes / s.goals) : null
                return (
                  <div
                    key={`${s.name}-${i}`}
                    className={`flex items-center gap-3 px-4 py-2.5 ${rank === 1 ? 'bg-gold/[0.06]' : ''}`}
                  >
                    <span className={`w-6 text-center text-sm font-bold tabular-nums shrink-0 ${rank === 1 ? 'text-gold' : 'text-texts'}`}>
                      {rank}
                    </span>
                    <Avatar src={s.photo} name={s.name} size={30} />
                    {s.code ? (
                      <Link href={`/squads?team=${encodeURIComponent(s.code)}`} className="flex-1 min-w-0 group" aria-label={`Open ${getTeam(s.code).name} squad`}>
                        <span className="text-sm font-semibold text-textp truncate block group-hover:text-primary">{s.name}</span>
                        <span className="text-[11px] text-texts group-hover:text-primary">{getTeam(s.code).name}</span>
                      </Link>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-textp truncate block">{s.name}</span>
                      </div>
                    )}

                    {/* Secondary stats */}
                    <div className="flex items-center gap-3 shrink-0">
                      {tab === 'contributions' && (
                        <div className="text-right hidden sm:block">
                          <span className="text-[10px] font-bold text-texts tabular-nums">{s.goals}G {s.assists}A</span>
                        </div>
                      )}
                      {minPer != null && (
                        <span className="text-[10px] text-texts/50 tabular-nums hidden sm:block" title="Minutes per goal">
                          {minPer}′/g
                        </span>
                      )}
                      {s.minutes > 0 && (
                        <span className="text-[10px] text-texts/50 tabular-nums hidden sm:block">
                          {s.minutes.toLocaleString()}′
                        </span>
                      )}
                      {s.code && (
                        <Link href={`/squads?team=${encodeURIComponent(s.code)}`} aria-label={`Open ${getTeam(s.code).name} squad`}>
                          <FlagChip code={s.code} w={22} h={15} r={3} />
                        </Link>
                      )}
                      <span className={`w-8 text-right text-base font-extrabold tabular-nums shrink-0 ${rank === 1 ? 'text-gold' : 'text-textp'}`}>
                        {metric(s)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </Card>
          </>
        )}

        {rows && rows.length === 0 && !loading && (
          <EmptyState icon={<TrophyIcon size={22} />} title="No data yet" desc="Scorer stats will appear once goals are recorded." />
        )}
      </div>
    </div>
  )
}

function LeaderSpotlight({ leader, tab }: { leader: Stat; tab: Tab }) {
  const team = leader.code ? getTeam(leader.code) : null
  const statLabel = tab === 'goals' ? 'Goals' : tab === 'assists' ? 'Assists' : 'G+A'
  const statValue = tab === 'goals' ? leader.goals : tab === 'assists' ? leader.assists : leader.goals + leader.assists
  const minPer = tab === 'goals' && leader.goals > 0 ? Math.round(leader.minutes / leader.goals) : null

  return (
    <Card className="relative overflow-hidden border-gold/30 bg-gold/[0.04] p-5">
      <div className="absolute right-[-30px] top-[-40px] h-36 w-36 rounded-full bg-gold/10 blur-2xl" />
      <p className="relative text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
        {tab === 'goals' ? 'Golden Boot leader' : tab === 'assists' ? 'Top assist maker' : 'Top contributor'}
      </p>
      <div className="relative mt-3 flex items-center gap-4">
        <Avatar src={leader.photo} name={leader.name} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-textp truncate">{leader.name}</p>
          <div className="mt-0.5 flex items-center gap-2">
            {leader.code && <FlagChip code={leader.code} w={18} h={12} r={2} />}
            {team && <span className="text-xs text-texts">{team.name}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-black text-gold tabular-nums">{statValue}</p>
          <p className="text-[10px] font-bold text-texts">{statLabel}</p>
        </div>
      </div>
      {(minPer != null || leader.minutes > 0 || (tab === 'contributions' && (leader.goals > 0 || leader.assists > 0))) && (
        <div className="relative mt-3 flex gap-4 text-[11px] text-texts border-t border-gold/20 pt-3">
          {tab === 'contributions' && (
            <>
              <span><span className="font-bold text-textp">{leader.goals}</span> goals</span>
              <span><span className="font-bold text-textp">{leader.assists}</span> assists</span>
            </>
          )}
          {minPer != null && <span><span className="font-bold text-textp">{minPer}′</span> per goal</span>}
          {leader.minutes > 0 && <span><span className="font-bold text-textp">{leader.minutes.toLocaleString()}′</span> played</span>}
        </div>
      )}
    </Card>
  )
}
