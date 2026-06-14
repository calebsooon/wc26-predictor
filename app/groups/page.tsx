'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import { PageHeader, Card, Tabs, Button, Skeleton, Pill, Flag } from '@/components/ui'
import { getActiveLeague } from '@/lib/league'
import { DEFAULT_WEIGHTS, weightedGroupPoints, type ScoringWeights } from '@/lib/scoring'

interface Match {
  id: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  group_name: string
  gameweek: number
  match_date: string
}

interface TeamRow { team: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }
interface GroupPredRow { group_name: string; ranked_codes: string[]; points_awarded: number | null }

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

function buildTable(matches: Match[], group: string): TeamRow[] {
  const map = new Map<string, TeamRow>()
  const ensure = (t: string) => { if (!map.has(t)) map.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }); return map.get(t)! }
  for (const m of matches) {
    if (m.group_name !== group) continue
    ensure(m.home_team); ensure(m.away_team)
    if (m.real_home_score === null || m.real_away_score === null) continue
    const home = ensure(m.home_team), away = ensure(m.away_team)
    const rh = m.real_home_score, ra = m.real_away_score
    home.p++; away.p++
    home.gf += rh; home.ga += ra; home.gd = home.gf - home.ga
    away.gf += ra; away.ga += rh; away.gd = away.gf - away.ga
    if (rh > ra) { home.w++; home.pts += 3; away.l++ }
    else if (rh < ra) { away.w++; away.pts += 3; home.l++ }
    else { home.d++; home.pts++; away.d++; away.pts++ }
  }
  return Array.from(map.values()).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
}

export default function GroupsPage() {
  const supabase = createClient()
  const [matches, setMatches] = useState<Match[]>([])
  const [group, setGroup] = useState('A')
  const [mode, setMode] = useState('standings')
  const [userId, setUserId] = useState<string | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [savedPreds, setSavedPreds] = useState<Record<string, GroupPredRow>>({})
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [leagueName, setLeagueName] = useState('')
  const [savingMsg, setSavingMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUserId(user?.id ?? null)
        const { data, error: matchErr } = await supabase
          .from('matches')
          .select('id, home_team, away_team, real_home_score, real_away_score, group_name, gameweek, match_date')
          .not('group_name', 'is', null)
          .order('match_date')
        if (matchErr) throw matchErr
        if (data) setMatches(data as Match[])
        if (user) {
          const [{ data: gp, error: gpErr }, active] = await Promise.all([
            supabase
              .from('group_predictions')
              .select('group_name, ranked_codes, points_awarded')
              .eq('user_id', user.id),
            getActiveLeague(supabase, user.id),
          ])
          if (gpErr) throw gpErr
          setWeights(active.weights)
          setLeagueName(active.league?.name ?? '')
          const map: Record<string, GroupPredRow> = {}
          for (const r of (gp ?? []) as GroupPredRow[]) map[r.group_name] = r
          setSavedPreds(map)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load groups')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const table = useMemo(() => buildTable(matches, group), [matches, group])
  const teamsInGroup = useMemo(() => {
    const set = new Set<string>()
    for (const m of matches) if (m.group_name === group) { set.add(m.home_team); set.add(m.away_team) }
    return Array.from(set)
  }, [matches, group])

  const groupComplete = useMemo(() => {
    const gMatches = matches.filter((m) => m.group_name === group)
    return gMatches.length > 0 && gMatches.every((m) => m.real_home_score !== null)
  }, [matches, group])

  useEffect(() => {
    if (mode !== 'predict') return
    const saved = savedPreds[group]
    const base = saved?.ranked_codes?.length ? saved.ranked_codes : (table.length ? table.map((t) => t.team) : teamsInGroup)
    setOrder(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, mode, savedPreds, matches])

  function move(i: number, dir: -1 | 1) {
    setOrder((o) => {
      const n = [...o]; const j = i + dir
      if (j < 0 || j >= n.length) return o
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  }

  async function savePrediction() {
    if (!userId || order.length === 0) return
    setSavingMsg('Saving…')
    try {
      const { error } = await supabase.from('group_predictions').upsert(
        { user_id: userId, group_name: group, ranked_codes: order, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,group_name' },
      )
      setSavingMsg(error ? error.message : 'Saved ✓')
      if (!error) setSavedPreds((s) => ({ ...s, [group]: { group_name: group, ranked_codes: order, points_awarded: s[group]?.points_awarded ?? null } }))
    } catch (e) {
      setSavingMsg(e instanceof Error ? e.message : 'Save failed')
    }
    setTimeout(() => setSavingMsg(null), 2500)
  }

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-40" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 rounded-xl" /></div>
  if (error) return (
    <div className="space-y-5">
      <PageHeader eyebrow="World Cup 2026" title="Groups" />
      <div className="py-12 text-center"><p className="text-sm text-texts">{error}</p></div>
    </div>
  )

  const currentPred = savedPreds[group]
  const ptsAwarded = currentPred?.points_awarded ?? null
  const groupScoringActive = weights.groupPosition > 0

  // Side panel data
  const topTwo = table.slice(0, 2)
  const upcomingInGroup = useMemo(() =>
    matches.filter((m) => m.group_name === group && m.real_home_score === null)
      .sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date))
      .slice(0, 3),
    [matches, group],
  )
  const myPredForGroup = savedPreds[group]

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="World Cup 2026" title="Groups" sub={leagueName ? `Live standings and ${leagueName} group-pick settings.` : 'Live standings and your predicted finishing order.'} />

      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => {
          const active = g === group
          const pred = savedPreds[g]
          const hasPts = pred?.points_awarded != null
          return (
            <button key={g} onClick={() => setGroup(g)}
              className={`w-10 h-10 rounded-lg text-sm font-bold transition-all border relative ${active ? 'bg-primary/12 border-primary text-primary' : 'bg-card border-border text-texts hover:text-textp'}`}>
              {g}
              {hasPts && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />}
            </button>
          )
        })}
      </div>

      <Tabs tabs={[{ key: 'standings', label: 'Standings' }, { key: 'predict', label: 'My Prediction' }]} value={mode} onChange={setMode} />

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {mode === 'standings' ? (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-texts border-b border-border">
                    <th className="text-left py-2.5 px-3 font-bold w-6">#</th>
                    <th className="text-left py-2.5 px-3 font-bold">Team</th>
                    {['P', 'W', 'D', 'L', 'GF', 'GA', 'GD'].map((h) => <th key={h} className="py-2.5 px-2 font-bold text-center">{h}</th>)}
                    <th className="py-2.5 px-3 font-bold text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => {
                    const t = getTeam(row.team)
                    const qualify = i < 2
                    return (
                      <tr key={row.team} className={`border-b border-border/50 last:border-0 ${qualify ? '' : 'opacity-60'}`}>
                        <td className="py-2.5 px-3 text-texts font-bold text-xs">{i + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-textp">
                          <div className="flex items-center gap-2">
                            {qualify && <div className="w-1 h-4 rounded-full bg-primary" />}
                            <Flag code={t.code} size={18} /><span className="truncate">{t.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.p}</td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.w}</td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.d}</td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.l}</td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.gf}</td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.ga}</td>
                        <td className="py-2.5 px-2 text-center text-texts">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-textp">{row.pts}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-texts px-3 py-2 border-t border-border/50">Green bar = qualify for Round of 32 · Sorted by Pts → GD → GF</p>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-texts">Reorder how you think Group {group} finishes.</p>
                <div className="flex items-center gap-2">
                  {groupScoringActive && ptsAwarded !== null && (
                    <Pill tone={ptsAwarded > 0 ? 'gold' : 'default'}>
                      +{weightedGroupPoints(ptsAwarded, weights)} pts
                    </Pill>
                  )}
                  {groupScoringActive && ptsAwarded === null && groupComplete && (
                    <Pill tone="default">Awaiting scoring</Pill>
                  )}
                  {!groupScoringActive && <Pill tone="default">For fun</Pill>}
                  {savingMsg && <Pill tone={savingMsg.includes('✓') ? 'green' : 'default'}>{savingMsg}</Pill>}
                </div>
              </div>
              <div className="space-y-2">
                {order.map((code, i) => {
                  const t = getTeam(code)
                  const saved = currentPred?.ranked_codes?.[i]
                  const correct = groupComplete && saved === table[i]?.team
                  return (
                    <div key={code} className={`flex items-center gap-3 p-2.5 rounded-lg border ${i < 2 ? 'border-primary/30 bg-primary/[0.06]' : 'border-border bg-surface'} ${correct ? 'border-green-500/40 bg-green-500/[0.05]' : ''}`}>
                      <span className="w-6 text-center text-sm font-extrabold tabular-nums" style={{ color: i < 2 ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>{i + 1}</span>
                      <Flag code={t.code} size={20} />
                      <span className="font-bold text-sm flex-1 truncate">{t.name}</span>
                      {correct && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="m5 12 5 5L20 7"/></svg>}
                      <div className="flex gap-1">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="w-8 h-8 grid place-items-center rounded-md border border-border text-texts hover:text-textp disabled:opacity-30">↑</button>
                        <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="w-8 h-8 grid place-items-center rounded-md border border-border text-texts hover:text-textp disabled:opacity-30">↓</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-4 gap-2">
                <p className="text-[11px] text-texts">
                  {groupScoringActive
                    ? `+${weights.groupPosition} pts per team in correct finishing position · max ${weights.groupPosition * 4} pts per group · scored once the group completes`
                    : 'Group picks are for fun in this league and do not affect standings.'}
                </p>
                <Button onClick={savePrediction} disabled={!userId || order.length === 0}>Save</Button>
              </div>
            </Card>
          )}
        </div>

        {/* Desktop side panel */}
        <div className="hidden lg:flex flex-col gap-4 w-56 shrink-0">
          {/* Qualification outlook */}
          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-texts mb-3">Group {group} Outlook</p>
            {topTwo.length > 0 ? (
              <div className="space-y-2">
                {topTwo.map((row, i) => {
                  const t = getTeam(row.team)
                  return (
                    <div key={t.code} className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-primary shrink-0" />
                      <Flag code={t.code} size={16} />
                      <span className="text-[12px] font-bold text-textp truncate flex-1">{t.name}</span>
                      <span className="text-[11px] font-bold tabular-nums text-primary shrink-0">{row.pts}p</span>
                    </div>
                  )
                })}
                <p className="text-[10px] text-texts pt-1">Top 2 currently qualifying</p>
              </div>
            ) : (
              <p className="text-[12px] text-texts italic">No matches played yet</p>
            )}
          </Card>

          {/* My prediction */}
          {myPredForGroup?.ranked_codes && myPredForGroup.ranked_codes.length > 0 && (
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-texts mb-3">My Prediction</p>
              <div className="space-y-2">
                {myPredForGroup.ranked_codes.slice(0, 4).map((code, i) => {
                  const t = getTeam(code)
                  return (
                    <div key={code} className="flex items-center gap-2">
                      <span className="w-4 text-[11px] font-extrabold tabular-nums shrink-0" style={{ color: i < 2 ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>{i + 1}</span>
                      <Flag code={t.code} size={16} />
                      <span className="text-[12px] font-bold text-textp truncate">{t.name}</span>
                    </div>
                  )
                })}
              </div>
              {myPredForGroup.points_awarded != null && (
                <div className="mt-3 pt-2 border-t border-border/50">
                  <p className="text-[11px] font-bold text-primary">+{weightedGroupPoints(myPredForGroup.points_awarded, weights)} pts earned</p>
                </div>
              )}
            </Card>
          )}

          {/* Upcoming matches in group */}
          {upcomingInGroup.length > 0 && (
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-texts mb-3">Upcoming</p>
              <div className="space-y-3">
                {upcomingInGroup.map((m) => {
                  const home = getTeam(m.home_team), away = getTeam(m.away_team)
                  return (
                    <div key={m.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Flag code={home.code} size={13} />
                          <span className="font-bold text-textp truncate">{home.name}</span>
                        </div>
                        <span className="text-texts font-bold shrink-0">vs</span>
                        <div className="flex items-center gap-1.5 min-w-0 flex-row-reverse">
                          <Flag code={away.code} size={13} />
                          <span className="font-bold text-textp truncate text-right">{away.name}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-texts">
                        {new Date(m.match_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
