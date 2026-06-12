'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, Card, Avatar, Skeleton, EmptyState, UsersIcon, ProgressBar, Select } from '@/components/ui'
import { getActiveLeague } from '@/lib/league'
import { weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights, type MatchBreakdown } from '@/lib/scoring'
import type { ProfileLite } from '@/lib/leaderboard'
import { getTeam } from '@/lib/teams'

interface PredRow extends MatchBreakdown { user_id: string; match_id: string; points_awarded: number; pred_home: number; pred_away: number }

interface MatchRow {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
}

const COLS = 'user_id, match_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'

export default function H2HPage() {
  const supabase = createClient()
  const [members, setMembers] = useState<ProfileLite[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [rows, setRows] = useState<PredRow[]>([])
  const [matchMap, setMatchMap] = useState<Map<string, MatchRow>>(new Map())
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
    if (!aId || !bId || aId === bId) { setRows([]); setMatchMap(new Map()); return }
    supabase.from('predictions').select(COLS).in('user_id', [aId, bId]).not('points_awarded', 'is', null)
      .then(async ({ data, error: e }) => {
        if (e) { setError(e.message); return }
        const predRows = (data ?? []) as unknown as PredRow[]
        setRows(predRows)
        const seen = new Set<string>()
        const matchIds: string[] = []
        for (const p of predRows) { if (!seen.has(p.match_id)) { seen.add(p.match_id); matchIds.push(p.match_id) } }
        if (matchIds.length) {
          const { data: md } = await supabase.from('matches')
            .select('id, match_date, home_team, away_team, real_home_score, real_away_score')
            .in('id', matchIds)
          const map = new Map<string, MatchRow>()
          for (const m of (md ?? []) as unknown as MatchRow[]) map.set(m.id, m)
          setMatchMap(map)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId])

  const { stats, catStats, commonMatches, formA, formB } = useMemo(() => {
    const forUser = (uid: string) => rows.filter((r) => r.user_id === uid)
    const calc = (uid: string) => {
      const ps = forUser(uid)
      const pts = ps.reduce((s, p) => s + weightedMatchPoints(p, weights), 0)
      const scored = ps.length
      const exact = ps.filter((p) => (p.pts_exact ?? 0) > 0).length
      const correct = ps.filter((p) => (p.pts_outcome ?? 0) > 0).length
      return { pts, scored, exact, acc: scored ? Math.round((correct / scored) * 100) : 0 }
    }
    const psA = forUser(aId), psB = forUser(bId)
    const byMatchA = new Map(psA.map((p) => [p.match_id, p]))
    let winA = 0, winB = 0, tie = 0, common = 0
    for (const pb of psB) {
      const pa = byMatchA.get(pb.match_id)
      if (!pa) continue
      common++
      const da = weightedMatchPoints(pa, weights), db = weightedMatchPoints(pb, weights)
      if (da > db) winA++; else if (db > da) winB++; else tie++
    }

    const allCatDefs = [
      { label: 'Outcome', ptsKey: 'pts_outcome', weightKey: 'outcome' },
      { label: 'Exact score', ptsKey: 'pts_exact', weightKey: 'exact' },
      { label: 'Goal diff', ptsKey: 'pts_goal_diff', weightKey: 'goalDiff' },
      { label: 'Total goals', ptsKey: 'pts_total_goals', weightKey: 'totalGoals' },
      { label: 'Team goals', ptsKey: 'pts_team_goals', weightKey: 'teamGoals' },
      { label: 'BTTS', ptsKey: 'pts_btts', weightKey: 'btts' },
      { label: 'First team', ptsKey: 'pts_first_team', weightKey: 'firstTeam' },
      { label: 'First scorer', ptsKey: 'pts_first_scorer', weightKey: 'firstScorer' },
    ] satisfies { label: string; ptsKey: keyof PredRow; weightKey: keyof ScoringWeights }[]
    const catDefs = allCatDefs.filter((c) => weights[c.weightKey] > 0)
    const catStats = catDefs.map(({ label, ptsKey }) => {
      const hitA = psA.filter((p) => ((p[ptsKey] as number) ?? 0) > 0).length
      const hitB = psB.filter((p) => ((p[ptsKey] as number) ?? 0) > 0).length
      const pctA = psA.length ? (hitA / psA.length) * 100 : 0
      const pctB = psB.length ? (hitB / psB.length) * 100 : 0
      return { label, hitA, hitB, pctA, pctB, totalA: psA.length, totalB: psB.length }
    })

    const commonMatches = psB
      .filter((pb) => byMatchA.has(pb.match_id))
      .map((pb) => {
        const pa = byMatchA.get(pb.match_id)!
        return {
          match_id: pb.match_id,
          match: matchMap.get(pb.match_id),
          pa, pb,
          ptsA: weightedMatchPoints(pa, weights),
          ptsB: weightedMatchPoints(pb, weights),
        }
      })
      .sort((x, y) => {
        const da = x.match?.match_date ?? '', db = y.match?.match_date ?? ''
        return db.localeCompare(da)
      })

    const sortByDate = (ps: PredRow[]) =>
      [...ps].sort((a, b) => (matchMap.get(b.match_id)?.match_date ?? '').localeCompare(matchMap.get(a.match_id)?.match_date ?? ''))

    return {
      stats: { a: calc(aId), b: calc(bId), winA, winB, tie, common },
      catStats,
      commonMatches: commonMatches.slice(0, 15),
      formA: sortByDate(psA).slice(0, 5),
      formB: sortByDate(psB).slice(0, 5),
    }
  }, [rows, aId, bId, weights, matchMap])

  const a = members.find((m) => m.id === aId)
  const b = members.find((m) => m.id === bId)

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-72 rounded-xl" /></div>

  if (error) return (
    <div className="space-y-5">
      <PageHeader eyebrow="Compare" title="Head-to-head" />
      <EmptyState icon={<UsersIcon size={22} />} title="Couldn't load data" desc={error} />
    </div>
  )

  const winPct = stats.common ? (stats.winA / stats.common) * 100 : 50

  function ptsColor(pts: number) {
    return pts >= 6 ? 'rgb(var(--primary))' : pts > 0 ? 'rgb(var(--gold))' : 'rgb(var(--error))'
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader eyebrow="Compare" title="Head-to-head" sub="Stack any two players in your league side by side." />

      {members.length < 2 ? (
        <EmptyState icon={<UsersIcon size={22} />} title="Not enough players" desc="You need at least two members in this league to compare." />
      ) : (
        <>
          {/* Player selectors */}
          <div className="grid grid-cols-2 gap-3">
            <Select id="player-a" label="Player A" value={aId} onChange={setAId}>
              <option value="">Select…</option>
              {members.filter((m) => m.id !== bId).map((m) => <option key={m.id} value={m.id}>{m.username ?? '?'}</option>)}
            </Select>
            <Select id="player-b" label="Player B" value={bId} onChange={setBId}>
              <option value="">Select…</option>
              {members.filter((m) => m.id !== aId).map((m) => <option key={m.id} value={m.id}>{m.username ?? '?'}</option>)}
            </Select>
          </div>

          {a && b && aId !== bId && (
            <>
              {/* Overview card */}
              <Card className="p-5">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-5">
                  <div className="flex flex-col items-center text-center">
                    <Avatar name={a.username ?? '?'} src={a.avatar_url} size={56} />
                    <p className="font-bold text-sm mt-2 truncate max-w-full">{a.username}</p>
                    <p className="text-3xl font-extrabold tabular-nums mt-1 text-primary">{stats.a.pts}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-texts">points</p>
                  </div>

                  <div className="text-center px-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-texts mb-1">vs</p>
                    <div className="flex gap-1.5 items-baseline justify-center">
                      <span className="text-xl font-extrabold text-primary">{stats.winA}</span>
                      <span className="text-texts text-xs">–</span>
                      <span className="text-sm font-bold text-texts">{stats.tie}</span>
                      <span className="text-texts text-xs">–</span>
                      <span className="text-xl font-extrabold text-blue">{stats.winB}</span>
                    </div>
                    <p className="text-[9px] text-texts mt-0.5">{stats.common} common</p>
                  </div>

                  <div className="flex flex-col items-center text-center">
                    <Avatar name={b.username ?? '?'} src={b.avatar_url} size={56} />
                    <p className="font-bold text-sm mt-2 truncate max-w-full">{b.username}</p>
                    <p className="text-3xl font-extrabold tabular-nums mt-1 text-blue">{stats.b.pts}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-texts">points</p>
                  </div>
                </div>

                <ProgressBar pct={winPct} color="rgb(var(--primary))" height={6} />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-bold text-primary">{stats.winA} won</span>
                  <span className="text-[10px] font-bold text-texts">{stats.tie} tied</span>
                  <span className="text-[10px] font-bold text-blue">{stats.winB} won</span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {([
                    ['Accuracy', `${stats.a.acc}%`, `${stats.b.acc}%`, stats.a.acc, stats.b.acc],
                    ['Exact scores', stats.a.exact, stats.b.exact, stats.a.exact, stats.b.exact],
                    ['Predictions scored', stats.a.scored, stats.b.scored, stats.a.scored, stats.b.scored],
                  ] as [string, string | number, string | number, number, number][]).map(([label, av, bv, an, bn]) => (
                    <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <span className={`text-right text-sm font-extrabold tabular-nums ${an >= bn ? 'text-primary' : 'text-texts'}`}>{av}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-texts whitespace-nowrap">{label}</span>
                      <span className={`text-left text-sm font-extrabold tabular-nums ${bn >= an ? 'text-blue' : 'text-texts'}`}>{bv}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Per-category comparison bars */}
              {catStats.some((c) => c.totalA > 0 || c.totalB > 0) && (
                <Card className="p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-3">Category accuracy</p>
                  <div className="space-y-3">
                    {catStats.map(({ label, hitA, hitB, pctA, pctB, totalA, totalB }) => (
                      <div key={label}>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-1">
                          <span className={`text-right text-[12px] font-extrabold tabular-nums ${pctA >= pctB ? 'text-primary' : 'text-texts'}`}>
                            {hitA}/{totalA}
                          </span>
                          <span className="text-[10px] font-bold text-texts whitespace-nowrap">{label}</span>
                          <span className={`text-[12px] font-extrabold tabular-nums ${pctB >= pctA ? 'text-blue' : 'text-texts'}`}>
                            {hitB}/{totalB}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 flex justify-end">
                            <div className="w-full h-1.5 rounded-full overflow-hidden bg-surface">
                              <div className="h-full rounded-full transition-all duration-700 ml-auto" style={{ width: `${pctA}%`, background: 'rgb(var(--primary))' }} />
                            </div>
                          </div>
                          <div className="w-px h-3 bg-border shrink-0" />
                          <div className="flex-1">
                            <div className="w-full h-1.5 rounded-full overflow-hidden bg-surface">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctB}%`, background: 'rgb(var(--blue))' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Recent form strips */}
              {(formA.length > 0 || formB.length > 0) && (
                <Card className="p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-3">Recent form (last 5)</p>
                  <div className="grid grid-cols-2 gap-4">
                    {([{ label: a.username ?? '?', form: formA, color: 'primary' }, { label: b.username ?? '?', form: formB, color: 'blue' }] as const).map(({ label, form, color }) => (
                      <div key={label}>
                        <p className="text-[11px] font-semibold text-texts truncate mb-2">{label}</p>
                        <div className="flex items-center gap-1.5">
                          {form.length === 0 && <span className="text-[11px] text-texts">No data</span>}
                          {form.map((p, i) => {
                            const pts = weightedMatchPoints(p, weights)
                            return (
                              <div
                                key={i}
                                title={`+${pts} pts`}
                                className="w-7 h-7 grid place-items-center rounded-md text-[10px] font-extrabold tabular-nums text-white shrink-0"
                                style={{ background: ptsColor(pts) }}
                              >
                                {pts}
                              </div>
                            )
                          })}
                          {form.length < 5 && Array.from({ length: 5 - form.length }).map((_, i) => (
                            <div key={`empty-${color}-${i}`} className="w-7 h-7 rounded-md bg-surface border border-border/50 shrink-0" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Match-by-match table */}
              {commonMatches.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="px-4 h-11 flex items-center border-b border-border">
                    <p className="text-[13px] font-extrabold text-textp">Match by match</p>
                    <span className="ml-auto text-[11px] font-bold text-texts">{commonMatches.length} matches</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {commonMatches.map(({ match_id, match, pa, pb, ptsA, ptsB }) => {
                      const home = match ? getTeam(match.home_team) : null
                      const away = match ? getTeam(match.away_team) : null
                      return (
                        <div key={match_id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2">
                          <div className="text-right">
                            <span className={`text-sm font-extrabold tabular-nums ${ptsA > ptsB ? 'text-primary' : ptsA === ptsB ? 'text-texts' : 'text-texts/50'}`}>+{ptsA}</span>
                          </div>
                          <div className="text-center min-w-0">
                            {match ? (
                              <div className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                                <span>{home?.flag}</span>
                                {match.real_home_score != null
                                  ? <span className="tabular-nums font-extrabold text-textp">{match.real_home_score}–{match.real_away_score}</span>
                                  : <span className="text-texts">vs</span>}
                                <span>{away?.flag}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-texts tabular-nums">{match_id.slice(0, 6)}</span>
                            )}
                            <div className="flex items-center justify-center gap-1.5 mt-0.5 text-[9px] text-texts">
                              <span className="text-primary">{pa.pred_home ?? '?'}-{pa.pred_away ?? '?'}</span>
                              <span className="text-border">·</span>
                              <span className="text-blue">{pb.pred_home ?? '?'}-{pb.pred_away ?? '?'}</span>
                            </div>
                          </div>
                          <div className="text-left">
                            <span className={`text-sm font-extrabold tabular-nums ${ptsB > ptsA ? 'text-blue' : ptsB === ptsA ? 'text-texts' : 'text-texts/50'}`}>+{ptsB}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
