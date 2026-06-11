'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, Card, Avatar, Skeleton, EmptyState, UsersIcon, ProgressBar } from '@/components/ui'
import { getActiveLeague } from '@/lib/league'
import { weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights, type MatchBreakdown } from '@/lib/scoring'
import type { ProfileLite } from '@/lib/leaderboard'

interface PredRow extends MatchBreakdown { user_id: string; match_id: string; points_awarded: number }

const COLS = 'user_id, match_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'

export default function H2HPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<ProfileLite[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [rows, setRows] = useState<PredRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { weights: w, memberProfiles } = await getActiveLeague(supabase, user.id)
        setWeights(w)
        setMembers(memberProfiles)
        setAId(user.id)
        const other = memberProfiles.find((m) => m.id !== user.id)
        setBId(other?.id ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load league')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!aId || !bId || aId === bId) { setRows([]); return }
    supabase.from('predictions').select(COLS).in('user_id', [aId, bId]).not('points_awarded', 'is', null)
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        else setRows((data ?? []) as unknown as PredRow[])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId])

  const stats = useMemo(() => {
    const forUser = (uid: string) => rows.filter((r) => r.user_id === uid)
    const calc = (uid: string) => {
      const ps = forUser(uid)
      const pts = ps.reduce((s, p) => s + weightedMatchPoints(p, weights), 0)
      const scored = ps.length
      const exact = ps.filter((p) => (p.pts_exact ?? 0) > 0).length
      const correct = ps.filter((p) => (p.pts_outcome ?? 0) > 0).length
      return { pts, scored, exact, acc: scored ? Math.round((correct / scored) * 100) : 0 }
    }
    // head-to-head on matches BOTH scored
    const byMatchA = new Map(forUser(aId).map((p) => [p.match_id, p]))
    let winA = 0, winB = 0, tie = 0, common = 0
    for (const pb of forUser(bId)) {
      const pa = byMatchA.get(pb.match_id)
      if (!pa) continue
      common++
      const da = weightedMatchPoints(pa, weights), db = weightedMatchPoints(pb, weights)
      if (da > db) winA++; else if (db > da) winB++; else tie++
    }
    return { a: calc(aId), b: calc(bId), winA, winB, tie, common }
  }, [rows, aId, bId, weights])

  const a = members.find((m) => m.id === aId)
  const b = members.find((m) => m.id === bId)

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-72 rounded-xl" /></div>

  if (error) return (
    <div className="space-y-5">
      <PageHeader eyebrow="Compare" title="Head-to-head" />
      <EmptyState icon={<UsersIcon size={22} />} title="Couldn't load data" desc={error} />
    </div>
  )

  const Select = ({ id, label, value, onChange, exclude }: { id: string; label: string; value: string; onChange: (v: string) => void; exclude: string }) => (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-textp focus:outline-none focus:border-primary">
        <option value="">Select…</option>
        {members.filter((m) => m.id !== exclude).map((m) => <option key={m.id} value={m.id}>{m.username ?? '?'}</option>)}
      </select>
    </div>
  )

  const winPct = stats.common ? (stats.winA / stats.common) * 100 : 50

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader eyebrow="Compare" title="Head-to-head" sub="Stack any two players in your league side by side." />

      {members.length < 2 ? (
        <EmptyState icon={<UsersIcon size={22} />} title="Not enough players" desc="You need at least two members in this league to compare." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select id="player-a" label="Player A" value={aId} onChange={setAId} exclude={bId} />
            <Select id="player-b" label="Player B" value={bId} onChange={setBId} exclude={aId} />
          </div>

          {a && b && aId !== bId && (
            <>
              <Card className="p-5">
                <div className="grid grid-cols-2 gap-4">
                  {[{ p: a, s: stats.a, side: 'l' }, { p: b, s: stats.b, side: 'r' }].map(({ p, s, side }) => (
                    <div key={p.id} className={`flex flex-col items-center text-center ${side === 'r' ? 'order-2' : ''}`}>
                      <Avatar name={p.username ?? '?'} src={p.avatar_url} size={56} />
                      <p className="font-bold text-sm mt-2 truncate max-w-full">{p.username}</p>
                      <p className="text-3xl font-extrabold tabular-nums mt-1 text-primary">{s.pts}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-texts">points</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {([
                    ['Accuracy', `${stats.a.acc}%`, `${stats.b.acc}%`, stats.a.acc, stats.b.acc],
                    ['Exact scores', stats.a.exact, stats.b.exact, stats.a.exact, stats.b.exact],
                    ['Predictions scored', stats.a.scored, stats.b.scored, stats.a.scored, stats.b.scored],
                  ] as [string, string | number, string | number, number, number][]).map(([label, av, bv, an, bn]) => (
                    <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <span className={`text-right text-sm font-extrabold tabular-nums ${an >= bn ? 'text-primary' : 'text-texts'}`}>{av}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-texts whitespace-nowrap">{label}</span>
                      <span className={`text-left text-sm font-extrabold tabular-nums ${bn >= an ? 'text-primary' : 'text-texts'}`}>{bv}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">Head-to-head ({stats.common} common matches)</p>
                <div className="flex items-center justify-between text-sm font-extrabold mb-1.5">
                  <span className="text-primary tabular-nums">{stats.winA} won</span>
                  <span className="text-texts tabular-nums">{stats.tie} tied</span>
                  <span className="text-blue tabular-nums">{stats.winB} won</span>
                </div>
                <ProgressBar pct={winPct} color="rgb(var(--primary))" height={8} />
                <p className="text-[11px] text-texts mt-2 text-center">On matches you both predicted, who scored more points.</p>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
