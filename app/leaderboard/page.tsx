'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, Tabs, Card, Skeleton, EmptyState, TrophyIcon, Avatar } from '@/components/ui'
import { LeaderboardTable, type LBRow } from '@/components/football'

interface Round { id: string; name: string }
interface PredRow {
  user_id: string
  points_awarded: number
  pts_exact: number | null
  profiles: { username: string; avatar_url: string | null } | null
  matches: { round_id: string } | null
}

export default function LeaderboardPage() {
  const supabase = createClient()
  const [rounds, setRounds] = useState<Round[]>([])
  const [rows, setRows] = useState<PredRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      const { data: rd } = await supabase.from('rounds').select('id, name').order('"order"')
      if (rd) setRounds(rd as Round[])
      await fetchRows()
      setLoading(false)
    }
    load()
    const channel = supabase.channel('lb').on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => fetchRows()).subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchRows() {
    const { data } = await supabase
      .from('predictions')
      .select('user_id, points_awarded, pts_exact, profiles(username, avatar_url), matches(round_id)')
      .not('points_awarded', 'is', null)
    setRows((data ?? []) as unknown as PredRow[])
  }

  const board = useMemo<LBRow[]>(() => {
    const filtered = tab === 'all' ? rows : rows.filter((r) => r.matches?.round_id === tab)
    const agg = new Map<string, LBRow & { scored: number; correct: number }>()
    for (const r of filtered) {
      const cur = agg.get(r.user_id) ?? {
        id: r.user_id, name: r.profiles?.username ?? '?', avatar: r.profiles?.avatar_url,
        pts: 0, exact: 0, acc: 0, scored: 0, correct: 0, you: r.user_id === userId,
      }
      cur.pts += r.points_awarded
      cur.scored += 1
      if (r.points_awarded >= 3) cur.correct += 1
      const isExact = r.pts_exact != null ? r.pts_exact > 0 : r.points_awarded >= 8
      if (isExact) cur.exact = (cur.exact ?? 0) + 1
      agg.set(r.user_id, cur)
    }
    return Array.from(agg.values())
      .map((r) => ({ ...r, acc: r.scored ? Math.round((r.correct / r.scored) * 100) : 0 }))
      .sort((a, b) => b.pts - a.pts)
  }, [rows, tab, userId])

  const podium = board.slice(0, 3)

  if (loading) {
    return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Standings" title="Leaderboard" sub="Points settle the moment results land." />

      <Tabs
        tabs={[{ key: 'all', label: 'Overall' }, ...rounds.map((r) => ({ key: r.id, label: shortRound(r.name) }))]}
        value={tab}
        onChange={setTab}
      />

      {board.length === 0 ? (
        <EmptyState icon={<TrophyIcon size={22} />} title="No scored predictions yet" desc="The table fills in as results come in." />
      ) : (
        <>
          {/* podium */}
          {podium.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[podium[1], podium[0], podium[2]].map((p, idx) => {
                const place = idx === 1 ? 1 : idx === 0 ? 2 : 3
                const color = place === 1 ? 'rgb(var(--gold))' : place === 2 ? '#94A3B8' : '#D9A066'
                return (
                  <Card key={p.id} className={`p-4 text-center ${place === 1 ? 'sm:-mt-3' : ''} ${p.you ? 'border-blue/40' : ''}`}>
                    <div className="text-xs font-black mb-2" style={{ color }}>{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
                    <div className="flex justify-center mb-2"><Avatar name={p.name} src={p.avatar} size={44} ring={place === 1} you={p.you} /></div>
                    <div className="font-bold text-sm truncate" style={place === 1 ? { color } : undefined}>{p.name}</div>
                    <div className="text-2xl font-extrabold tabular-nums mt-1" style={{ color }}>{p.pts}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-texts">points</div>
                  </Card>
                )
              })}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="px-1 py-1">
              <LeaderboardTable players={board} metricLabel="PTS" showMove={false} />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function shortRound(name: string) {
  return name
    .replace('Group Stage', 'Groups').replace('Round of 32', 'R32').replace('Round of 16', 'R16')
    .replace('Quarter-Finals', 'QF').replace('Semi-Finals', 'SF').replace('Bronze Final', 'BF')
}
