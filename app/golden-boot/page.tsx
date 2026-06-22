'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageHeader, Card, Skeleton, Avatar, Tabs, EmptyState, TrophyIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { getTeam } from '@/lib/teams'
import { useUrlState } from '@/lib/url-state'

interface Stat { name: string; photo: string | null; goals: number; assists: number; minutes: number; rank: number | null; order: number | null; code: string | null }

export default function GoldenBootPage() {
  const { searchParams, replaceUrl } = useUrlState()
  const [scorers, setScorers] = useState<Stat[] | null>(null)
  const [assists, setAssists] = useState<Stat[] | null>(null)
  const [tab, setTab] = useState<'goals' | 'assists'>(searchParams.get('tab') === 'assists' ? 'assists' : 'goals')
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

  useEffect(() => { void refresh() }, [])

  useEffect(() => {
    setTab(searchParams.get('tab') === 'assists' ? 'assists' : 'goals')
  }, [searchParams])

  const loading = !scorers && !assists && !error
  const rows = tab === 'goals' ? scorers : assists
  const metric = (s: Stat) => (tab === 'goals' ? s.goals : s.assists)

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader
        eyebrow="World Cup 2026"
        title="Golden Boot"
        sub={updatedAt ? `Official FIFA standings synced ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}.` : 'Official FIFA top scorers and assists across the tournament.'}
        action={<button onClick={() => void refresh()} disabled={refreshing} className="h-9 px-3 rounded-xl border border-border bg-surface text-xs font-bold text-textp hover:bg-surface2 disabled:opacity-50">{refreshing ? 'Refreshing...' : 'Refresh'}</button>}
      />
      <Tabs
        tabs={[{ key: 'goals', label: 'Top Scorers' }, { key: 'assists', label: 'Top Assists' }]}
        ariaLabel="Golden Boot standings"
        panelIdPrefix="golden-boot"
        value={tab} onChange={(k) => {
          const next = k as 'goals' | 'assists'
          setTab(next)
          replaceUrl({ tab: next === 'goals' ? null : next })
        }}
      />

      <div id={`golden-boot-panel-${tab}`} role="tabpanel" aria-labelledby={`golden-boot-tab-${tab}`}>
      {loading && <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
      {error && <EmptyState icon={<TrophyIcon size={22} />} title="Couldn't load" desc={error} />}

      {rows && rows.length > 0 && (
        <>
          <p className="text-[11px] text-texts/50 px-1">Minutes played shown — fewer minutes ranks higher at equal {tab === 'goals' ? 'goals' : 'assists'} (FIFA official tiebreaker)</p>
          <Card className="overflow-hidden">
            {rows.map((s, i) => {
              const rank = s.rank ?? i + 1
              return (
              <div key={`${s.name}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 ${i < rows.length - 1 ? 'border-b border-border/60' : ''} ${rank === 1 ? 'bg-gold/[0.06]' : ''}`}>
                <span className={`w-6 text-center text-sm font-bold tabular-nums shrink-0 ${rank === 1 ? 'text-gold' : 'text-texts'}`}>{rank}</span>
                <Avatar src={s.photo} name={s.name} size={30} />
                {s.code ? (
                  <Link href={`/squads?team=${encodeURIComponent(s.code)}`} className="flex-1 min-w-0 group" aria-label={`Open ${getTeam(s.code).name} squad`}>
                    <span className="text-sm font-semibold text-textp truncate block group-hover:text-primary">{s.name}</span>
                    <span className="text-[11px] text-texts group-hover:text-primary">{getTeam(s.code).name}</span>
                  </Link>
                ) : (
                  <div className="flex-1 min-w-0"><span className="text-sm font-semibold text-textp truncate block">{s.name}</span></div>
                )}
                {s.minutes > 0 && <span className="shrink-0 text-[10px] text-texts/50 tabular-nums">{`${s.minutes.toLocaleString()}′`}</span>}
                {s.code && <Link href={`/squads?team=${encodeURIComponent(s.code)}`} aria-label={`Open ${getTeam(s.code).name} squad`}><FlagChip code={s.code} w={22} h={15} r={3} /></Link>}
                <span className="w-8 text-right text-base font-extrabold text-textp tabular-nums shrink-0">{metric(s)}</span>
              </div>
            )})}
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
