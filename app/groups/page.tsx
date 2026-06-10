'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import { PageHeader, Card, Tabs, Button, Skeleton, Pill } from '@/components/ui'

interface Match {
  id: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  group_name: string
  gameweek: number
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
  const [savingMsg, setSavingMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      const { data } = await supabase
        .from('matches')
        .select('id, home_team, away_team, real_home_score, real_away_score, group_name, gameweek')
        .not('group_name', 'is', null)
        .order('match_date')
      if (data) setMatches(data as Match[])
      if (user) {
        const { data: gp } = await supabase
          .from('group_predictions')
          .select('group_name, ranked_codes, points_awarded')
          .eq('user_id', user.id)
        const map: Record<string, GroupPredRow> = {}
        for (const r of (gp ?? []) as GroupPredRow[]) map[r.group_name] = r
        setSavedPreds(map)
      }
      setLoading(false)
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
    const { error } = await supabase.from('group_predictions').upsert(
      { user_id: userId, group_name: group, ranked_codes: order, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,group_name' },
    )
    setSavingMsg(error ? error.message : 'Saved ✓')
    if (!error) setSavedPreds((s) => ({ ...s, [group]: { group_name: group, ranked_codes: order, points_awarded: s[group]?.points_awarded ?? null } }))
    setTimeout(() => setSavingMsg(null), 2500)
  }

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-40" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 rounded-xl" /></div>

  const currentPred = savedPreds[group]
  const ptsAwarded = currentPred?.points_awarded ?? null

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="World Cup 2026" title="Groups" sub="Live standings and your predicted finishing order." />

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
                        <span>{t.flag}</span><span className="truncate">{t.name}</span>
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
              {ptsAwarded !== null && (
                <Pill tone={ptsAwarded > 0 ? 'green' : 'default'}>
                  +{ptsAwarded} pts
                </Pill>
              )}
              {ptsAwarded === null && groupComplete && (
                <Pill tone="default">Awaiting scoring</Pill>
              )}
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
                  <span className="text-lg">{t.flag}</span>
                  <span className="font-bold text-sm flex-1 truncate">{t.name}</span>
                  {correct && <span className="text-xs font-bold text-primary">✓</span>}
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="w-8 h-8 grid place-items-center rounded-md border border-border text-texts hover:text-textp disabled:opacity-30">↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="w-8 h-8 grid place-items-center rounded-md border border-border text-texts hover:text-textp disabled:opacity-30">↓</button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-4 gap-2">
            <p className="text-[11px] text-texts">+2 pts per team in correct position · max 8 pts per group</p>
            <Button onClick={savePrediction} disabled={!userId || order.length === 0}>Save</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
