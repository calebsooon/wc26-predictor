'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, ChipRow, EmptyState, Skeleton, CalIcon, StaggerList, StaggerItem, Card, Select } from '@/components/ui'
import { MatchCard } from '@/components/football'
import { toUIMatch, type DBMatch, type MyPred } from '@/lib/match-ui'
import { getActiveLeague } from '@/lib/league'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { fmtDateKey } from '@/lib/date-format'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }

export default function FixturesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [filter, setFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [weekFilter, setWeekFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }

        const { data: roundData, error: roundErr } = await supabase
          .from('rounds')
          .select('id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)')
          .order('"order"')
          .order('match_date', { referencedTable: 'matches' })
        if (roundErr) throw roundErr
        const flat: DBMatch[] = []
        for (const r of (roundData ?? []) as unknown as RoundRow[]) {
          for (const m of r.matches ?? []) flat.push({ ...m, round_name: r.name })
        }
        setMatches(flat)

        const { data: myData, error: predErr } = await supabase
          .from('predictions')
          .select('match_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer')
          .eq('user_id', user.id)
        if (predErr) throw predErr
        const map: Record<string, MyPred> = {}
        for (const p of myData ?? []) map[(p as { match_id: string }).match_id] = p as unknown as MyPred
        setPreds(map)

        const { weights: w } = await getActiveLeague(supabase, user.id)
        setWeights(w)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load fixtures')
      } finally {
        setLoading(false)
      }
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

  const statusChips = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'today', label: 'Today' },
    { key: 'missing', label: 'Missing', count: counts.missing },
    { key: 'locked', label: 'Locked', count: counts.locked },
    { key: 'finished', label: 'Finished', count: counts.finished },
  ]
  const stageChips = [
    { key: 'all', label: 'All stages' },
    { key: 'group', label: 'Group stage', count: matches.filter((m) => !toUIMatch(m, preds[m.id]).knockout).length },
    { key: 'knockout', label: 'Knockouts', count: matches.filter((m) => toUIMatch(m, preds[m.id]).knockout).length },
  ]

  const sgtDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(d)
  const todaySGT = sgtDate(new Date())

  const dateOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of matches) {
      const key = sgtDate(new Date(m.match_date))
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [matches])

  const groups = useMemo(() => {
    const set = new Set<string>()
    for (const m of matches) if (m.group_name) set.add(m.group_name)
    return Array.from(set).sort()
  }, [matches])

  const gameweeks = useMemo(() => {
    const set = new Set<number>()
    for (const m of matches) if (m.group_name && m.gameweek != null) set.add(m.gameweek)
    return Array.from(set).sort((a, b) => a - b)
  }, [matches])

  const knockoutRounds = useMemo(() => {
    const set = new Set<string>()
    for (const m of matches) {
      const ui = toUIMatch(m, preds[m.id])
      if (ui.knockout) set.add(m.round_name ?? 'Knockout')
    }
    return Array.from(set)
  }, [matches, preds])

  const filtered = useMemo(() => matches.filter((m) => {
    const ui = toUIMatch(m, preds[m.id])
    const statusOk = (() => {
      switch (filter) {
      case 'today': return sgtDate(new Date(m.match_date)) === todaySGT
      case 'missing': return ui.status === 'missing'
      case 'locked': return ui.status === 'locked'
      case 'finished': return ui.status === 'scored'
      default: return true
      }
    })()
    if (!statusOk) return false
    if (stageFilter === 'group' && ui.knockout) return false
    if (stageFilter === 'knockout' && !ui.knockout) return false
    if (stageFilter === 'group' && groupFilter !== 'all' && m.group_name !== groupFilter) return false
    if (stageFilter === 'group' && weekFilter !== 'all' && String(m.gameweek ?? '') !== weekFilter) return false
    if (stageFilter === 'knockout' && roundFilter !== 'all' && (m.round_name ?? 'Knockout') !== roundFilter) return false
    if (dateFilter !== 'all' && sgtDate(new Date(m.match_date)) !== dateFilter) return false
    return true
  }), [matches, preds, filter, stageFilter, groupFilter, weekFilter, roundFilter, dateFilter, todaySGT])

  const sortMatches = (items: DBMatch[]) => [...items].sort((a, b) => +new Date(a.match_date) - +new Date(b.match_date))

  const byDate = useMemo(() => {
    const g: Record<string, DBMatch[]> = {}
    for (const m of filtered) {
      const key = sgtDate(new Date(m.match_date))
      ;(g[key] ||= []).push(m)
    }
    return g
  }, [filtered])
  const dates = Object.keys(byDate).sort()

  const byGroup = useMemo(() => {
    const g: Record<string, DBMatch[]> = {}
    for (const m of filtered) if (m.group_name) (g[m.group_name] ||= []).push(m)
    for (const key of Object.keys(g)) g[key] = sortMatches(g[key])
    return g
  }, [filtered])
  const groupKeys = Object.keys(byGroup).sort()

  const byRound = useMemo(() => {
    const g: Record<string, DBMatch[]> = {}
    for (const m of filtered) {
      const key = m.round_name ?? 'Knockout'
      ;(g[key] ||= []).push(m)
    }
    for (const key of Object.keys(g)) g[key] = sortMatches(g[key])
    return g
  }, [filtered])
  const roundKeys = Object.keys(byRound)

  function renderSection(title: string, items: DBMatch[], sub?: string) {
    return (
      <div key={title}>
        <div className="flex items-center gap-3 mb-3 mt-2">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-texts">{title}</h2>
            {sub && <p className="text-[11px] text-texts font-medium mt-0.5">{sub}</p>}
          </div>
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-texts font-bold tabular-nums">{items.length} matches</span>
        </div>
        <StaggerList className="grid sm:grid-cols-2 gap-3">
          {items.map((m) => (
            <StaggerItem key={m.id}>
              <MatchCard m={toUIMatch(m, preds[m.id], weights)} onClick={() => router.push(`/match/${m.id}`)} />
            </StaggerItem>
          ))}
        </StaggerList>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-full" />
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="h-5 w-32 mb-3" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="World Cup 2026" title="Fixtures" />
        <EmptyState icon={<CalIcon size={22} />} title="Couldn't load fixtures" desc={error} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="World Cup 2026" title="Fixtures" sub={`${counts.missing} predictions still missing across the schedule.`} />
      <Card className="p-3 sm:p-4 space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">Status</p>
          <ChipRow chips={statusChips} value={filter} onChange={setFilter} />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">Stage</p>
          <ChipRow
            chips={stageChips}
            value={stageFilter}
            onChange={(v) => {
              setStageFilter(v)
              if (v !== 'group') { setGroupFilter('all'); setWeekFilter('all') }
              if (v !== 'knockout') setRoundFilter('all')
            }}
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Select id="fixture-date" label="Matchday" value={dateFilter} onChange={setDateFilter}>
            <option value="all">All dates</option>
            {dateOptions.map(([d, count]) => <option key={d} value={d}>{fmtDateKey(d)} ({count})</option>)}
          </Select>
          {stageFilter === 'group' ? (
            <>
              <Select id="fixture-group" label="Group" value={groupFilter} onChange={setGroupFilter}>
                <option value="all">All groups</option>
                {groups.map((g) => <option key={g} value={g}>Group {g}</option>)}
              </Select>
              <Select id="fixture-gw" label="Gameweek" value={weekFilter} onChange={setWeekFilter}>
                <option value="all">All group GWs</option>
                {gameweeks.map((gw) => <option key={gw} value={String(gw)}>GW {gw}</option>)}
              </Select>
            </>
          ) : stageFilter === 'knockout' ? (
            <Select id="fixture-round" label="Round" value={roundFilter} onChange={setRoundFilter} className="sm:col-span-2">
              <option value="all">All knockout rounds</option>
              {knockoutRounds.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          ) : (
            <div className="sm:col-span-2 rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-texts">Quick tip</p>
              <p className="text-[13px] font-semibold text-textp mt-1">Choose Group stage for Group A-L and GW filters, or Knockouts for round filters.</p>
            </div>
          )}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={<CalIcon size={22} />} title="Nothing here" desc="No matches match this filter. Try a different one." />
      ) : stageFilter === 'group' ? (
        groupKeys.map((g) => renderSection(`Group ${g}`, byGroup[g], weekFilter === 'all' ? undefined : `GW ${weekFilter}`))
      ) : stageFilter === 'knockout' ? (
        roundKeys.map((r) => renderSection(r, byRound[r]))
      ) : (
        dates.map((d) => (
          renderSection(fmtDateKey(d), byDate[d])
        ))
      )}
    </div>
  )
}
