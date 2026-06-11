'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, ChipRow, EmptyState, Skeleton, CalIcon, StaggerList, StaggerItem } from '@/components/ui'
import { MatchCard } from '@/components/football'
import { toUIMatch, type DBMatch, type MyPred } from '@/lib/match-ui'
import { getActiveLeague } from '@/lib/league'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }

export default function FixturesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)')
        .order('"order"')
        .order('match_date', { referencedTable: 'matches' })
      const flat: DBMatch[] = []
      for (const r of (roundData ?? []) as unknown as RoundRow[]) {
        for (const m of r.matches ?? []) flat.push({ ...m, round_name: r.name })
      }
      setMatches(flat)

      const { data: myData } = await supabase
        .from('predictions')
        .select('match_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer')
        .eq('user_id', user.id)
      const map: Record<string, MyPred> = {}
      for (const p of myData ?? []) map[(p as { match_id: string }).match_id] = p as unknown as MyPred
      setPreds(map)

      const { weights: w } = await getActiveLeague(supabase, user.id)
      setWeights(w)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const counts = useMemo(() => {
    const ui = matches.map((m) => toUIMatch(m, preds[m.id]))
    return {
      all: ui.length,
      missing: ui.filter((m) => m.status === 'missing').length,
      locked: ui.filter((m) => m.status === 'locked').length,
      finished: ui.filter((m) => m.status === 'scored').length,
    }
  }, [matches, preds])

  const chips = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'today', label: 'Today' },
    { key: 'missing', label: 'Missing', count: counts.missing },
    { key: 'locked', label: 'Locked', count: counts.locked },
    { key: 'finished', label: 'Finished', count: counts.finished },
    { key: 'group', label: 'Group' },
    { key: 'knockout', label: 'Knockout' },
  ]

  const sgtDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(d)
  const todaySGT = sgtDate(new Date())
  const filtered = useMemo(() => matches.filter((m) => {
    const ui = toUIMatch(m, preds[m.id])
    switch (filter) {
      case 'today': return sgtDate(new Date(m.match_date)) === todaySGT
      case 'missing': return ui.status === 'missing'
      case 'locked': return ui.status === 'locked'
      case 'finished': return ui.status === 'scored'
      case 'group': return !ui.knockout
      case 'knockout': return ui.knockout
      default: return true
    }
  }), [matches, preds, filter, todaySGT])

  const byDate = useMemo(() => {
    const g: Record<string, DBMatch[]> = {}
    for (const m of filtered) {
      const key = sgtDate(new Date(m.match_date))
      ;(g[key] ||= []).push(m)
    }
    return g
  }, [filtered])
  const dates = Object.keys(byDate).sort()

  if (loading) {
    return <div className="space-y-5"><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-full" /><div className="grid sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div></div>
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="World Cup 2026" title="Fixtures" sub={`${counts.missing} predictions still missing across the schedule.`} />
      <ChipRow chips={chips} value={filter} onChange={setFilter} />

      {dates.length === 0 ? (
        <EmptyState icon={<CalIcon size={22} />} title="Nothing here" desc="No matches match this filter. Try a different one." />
      ) : (
        dates.map((d) => (
          <div key={d}>
            <div className="flex items-center gap-3 mb-3 mt-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-texts">{fmtDate(d)}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-texts font-bold tabular-nums">{byDate[d].length} matches</span>
            </div>
            <StaggerList className="grid sm:grid-cols-2 gap-3">
              {byDate[d].map((m) => (
                <StaggerItem key={m.id}>
                  <MatchCard m={toUIMatch(m, preds[m.id], weights)} onClick={() => router.push(`/match/${m.id}`)} />
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        ))
      )}
    </div>
  )
}

function fmtDate(d: string) {
  // d is a YYYY-MM-DD date in SGT — parse as midnight SGT
  const date = new Date(d + 'T00:00:00+08:00')
  const todaySGT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  const label = new Intl.DateTimeFormat('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).format(date)
  return d === todaySGT ? `Today · ${label}` : label
}
