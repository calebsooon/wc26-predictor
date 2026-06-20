'use client'

import { useEffect, useState } from 'react'
import { PageHeader, Card, Skeleton, Avatar, Tabs, EmptyState, TrophyIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { getTeam } from '@/lib/teams'

interface Stat { name: string; photo: string | null; goals: number; assists: number; code: string | null }

export default function GoldenBootPage() {
  const [scorers, setScorers] = useState<Stat[] | null>(null)
  const [assists, setAssists] = useState<Stat[] | null>(null)
  const [tab, setTab] = useState<'goals' | 'assists'>('goals')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/golden-boot')
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else { setScorers(d.scorers ?? []); setAssists(d.assists ?? []) } })
      .catch(() => setError('Failed to load'))
  }, [])

  const loading = !scorers && !assists && !error
  const rows = tab === 'goals' ? scorers : assists
  const metric = (s: Stat) => (tab === 'goals' ? s.goals : s.assists)

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader eyebrow="World Cup 2026" title="Golden Boot" sub="Live top scorers and assists across the tournament." />
      <Tabs
        tabs={[{ key: 'goals', label: 'Top Scorers' }, { key: 'assists', label: 'Top Assists' }]}
        value={tab} onChange={(k) => setTab(k as 'goals' | 'assists')}
      />

      {loading && <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
      {error && <EmptyState icon={<TrophyIcon size={22} />} title="Couldn't load" desc={error} />}

      {rows && rows.length > 0 && (
        <Card className="overflow-hidden">
          {rows.map((s, i) => (
            <div key={`${s.name}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 ${i < rows.length - 1 ? 'border-b border-border/60' : ''} ${i === 0 ? 'bg-gold/[0.06]' : ''}`}>
              <span className={`w-6 text-center text-sm font-bold tabular-nums shrink-0 ${i === 0 ? 'text-gold' : 'text-texts'}`}>{i + 1}</span>
              <Avatar src={s.photo} name={s.name} size={30} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-textp truncate block">{s.name}</span>
                {s.code && <span className="text-[11px] text-texts">{getTeam(s.code).name}</span>}
              </div>
              {s.code && <FlagChip code={s.code} w={22} h={15} r={3} />}
              <span className="w-8 text-right text-base font-extrabold text-textp tabular-nums shrink-0">{metric(s)}</span>
            </div>
          ))}
        </Card>
      )}
      {rows && rows.length === 0 && !loading && (
        <EmptyState icon={<TrophyIcon size={22} />} title="No data yet" desc="Scorer stats will appear once goals are recorded." />
      )}
    </div>
  )
}
