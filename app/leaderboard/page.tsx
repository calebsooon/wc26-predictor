'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, Tabs, Card, Skeleton, EmptyState, TrophyIcon, Avatar } from '@/components/ui'
import { LeaderboardTable, type LBRow } from '@/components/football'
import { aggregateLeaderboard } from '@/lib/leaderboard'
import { GW_NAMES, GW_SHORT, GW_PRIZES, OVERALL_PRIZES, formatPrize, prizeTone } from '@/lib/prizes'

interface PredRow {
  user_id: string
  points_awarded: number
  pts_exact: number | null
  pts_outcome: number | null
  profiles: { username: string; avatar_url: string | null } | null
  matches: { gw_number: number | null } | null
}
interface SnapRow { user_id: string; rank: number; snapshot_at: string }
interface ProfileRow { id: string; username: string | null; avatar_url: string | null }

const GW_TABS = [
  { key: 'all', label: 'Overall' },
  ...Array.from({ length: 8 }, (_, i) => ({ key: String(i + 1), label: GW_SHORT[i + 1] })),
]

export default function LeaderboardPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<PredRow[]>([])
  const [allProfiles, setAllProfiles] = useState<ProfileRow[]>([])
  const [prevRanks, setPrevRanks] = useState<Map<string, number>>(new Map())
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: { user } }, , { data: snaps }, { data: profiles }] = await Promise.all([
        supabase.auth.getUser(),
        fetchRows(),
        supabase.from('rank_snapshots').select('user_id, rank, snapshot_at').order('snapshot_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('id, username, avatar_url'),
      ])
      setUserId(user?.id ?? null)
      setAllProfiles((profiles ?? []) as ProfileRow[])
      if (snaps && snaps.length > 0) {
        const latest = (snaps[0] as SnapRow).snapshot_at
        const map = new Map<string, number>()
        for (const s of snaps as SnapRow[]) {
          if (s.snapshot_at === latest) map.set(s.user_id, s.rank)
        }
        setPrevRanks(map)
      }
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
      .select('user_id, points_awarded, pts_exact, pts_outcome, profiles(username, avatar_url), matches(gw_number)')
      .not('points_awarded', 'is', null)
    setRows((data ?? []) as unknown as PredRow[])
  }

  const board = useMemo<LBRow[]>(() => {
    const gwNum = tab === 'all' ? null : parseInt(tab)
    const prizes = tab === 'all' ? OVERALL_PRIZES : GW_PRIZES

    const sorted = aggregateLeaderboard({ scoredPreds: rows, profiles: allProfiles, userId, gwNumber: gwNum })

    return sorted.map((r, currentIdx) => {
      const prevRank = prevRanks.get(r.id)
      const move = prevRank != null ? prevRank - (currentIdx + 1) : undefined
      const prize = prizes[Math.min(currentIdx, 6)]
      return { ...r, move, prize }
    })
  }, [rows, tab, userId, prevRanks, allProfiles])

  const podium = board.slice(0, 3)
  const hasSnapshots = prevRanks.size > 0
  const gwLabel = tab === 'all' ? 'Overall' : (GW_NAMES[parseInt(tab)] ?? tab)

  if (loading) {
    return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Standings"
        title="Leaderboard"
        sub={tab === 'all' ? 'Overall season standings + prize pool' : gwLabel}
      />

      <div className="overflow-x-auto -mx-4 px-4">
        <Tabs tabs={GW_TABS} value={tab} onChange={setTab} />
      </div>

      {board.length === 0 ? (
        <EmptyState icon={<TrophyIcon size={22} />} title="No players yet" desc="Players will appear here once they sign up." />
      ) : (
        <>
          {podium.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[podium[1], podium[0], podium[2]].map((p, idx) => {
                const place = idx === 1 ? 1 : idx === 0 ? 2 : 3
                const color = place === 1 ? 'rgb(var(--gold))' : place === 2 ? '#94A3B8' : '#D9A066'
                const prizeAmt = (tab === 'all' ? OVERALL_PRIZES : GW_PRIZES)[Math.min(place - 1, 6)]
                const prizeLabel = formatPrize(prizeAmt)
                const tone = prizeTone(prizeAmt)
                const prizeColor = tone === 'green' ? 'rgb(var(--success))' : tone === 'red' ? 'rgb(var(--error))' : 'rgb(var(--texts))'
                return (
                  <Card key={p.id} className={`p-4 text-center ${place === 1 ? 'sm:-mt-3' : ''} ${p.you ? 'border-blue/40' : ''}`}>
                    <div className="text-xs font-black mb-2" style={{ color }}>{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
                    <div className="flex justify-center mb-2"><Avatar name={p.name} src={p.avatar} size={44} ring={place === 1} you={p.you} /></div>
                    <div className="font-bold text-sm truncate" style={place === 1 ? { color } : undefined}>{p.name}</div>
                    <div className="text-2xl font-extrabold tabular-nums mt-1" style={{ color }}>{p.pts}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-texts mb-1">points</div>
                    <div className="text-sm font-extrabold tabular-nums" style={{ color: prizeColor }}>{prizeLabel}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-texts">prize</div>
                  </Card>
                )
              })}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="px-1 py-1">
              <LeaderboardTable players={board} metricLabel="PTS" showMove={hasSnapshots} showPrize />
            </div>
          </Card>

          <div className="px-1">
            <p className="text-[11px] text-texts font-medium">
              Tiebreaker: most correct outcomes, then alphabetical. Prize pool per GW: 1st +$15 · 2nd +$10 · 3rd +$5 · 4th $0 · 5th -$5 · 6th -$10 · 7th -$15. Overall: 1st +$40 · 7th -$40.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
