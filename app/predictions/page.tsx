'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, ChipRow, EmptyState, Skeleton, CalIcon, StaggerList, StaggerItem, Button, ScoreStepper } from '@/components/ui'
import { MatchCard } from '@/components/football'
import { toUIMatch, type DBMatch, type MyPred } from '@/lib/match-ui'
import { getActiveLeague } from '@/lib/league'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { fmtDateKey } from '@/lib/date-format'
import { getTeam } from '@/lib/teams'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }

export default function FixturesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickMatch, setQuickMatch] = useState<DBMatch | null>(null)
  const [quickH, setQuickH] = useState<number | null>(null)
  const [quickA, setQuickA] = useState<number | null>(null)

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
      <ChipRow chips={chips} value={filter} onChange={setFilter} />

      {dates.length === 0 ? (
        <EmptyState icon={<CalIcon size={22} />} title="Nothing here" desc="No matches match this filter. Try a different one." />
      ) : (
        dates.map((d) => (
          <div key={d}>
            <div className="flex items-center gap-3 mb-3 mt-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-texts">{fmtDateKey(d)}</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-texts font-bold tabular-nums">{byDate[d].length} matches</span>
            </div>
            <StaggerList className="grid sm:grid-cols-2 gap-3">
              {byDate[d].map((m) => (
                <StaggerItem key={m.id}>
                  <MatchCard
                    m={toUIMatch(m, preds[m.id], weights)}
                    onClick={() => {
                      const ui = toUIMatch(m, preds[m.id])
                      if (ui.status === 'missing' || (ui.status !== 'locked' && ui.status !== 'scored')) {
                        const existing = preds[m.id]
                        setQuickMatch(m)
                        setQuickH(existing?.pred_home ?? null)
                        setQuickA(existing?.pred_away ?? null)
                      } else {
                        router.push(`/match/${m.id}`)
                      }
                    }}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        ))
      )}

      {quickMatch && (
        <QuickPredictModal
          match={quickMatch}
          initialH={quickH}
          initialA={quickA}
          onClose={() => setQuickMatch(null)}
          onSaved={(matchId, h, a) => {
            setPreds((prev) => ({
              ...prev,
              [matchId]: { ...prev[matchId], pred_home: h, pred_away: a, match_id: matchId } as MyPred,
            }))
          }}
        />
      )}
    </div>
  )
}

function QuickPredictModal({
  match, initialH, initialA, onClose, onSaved,
}: {
  match: DBMatch
  initialH: number | null
  initialA: number | null
  onClose: () => void
  onSaved: (matchId: string, h: number, a: number) => void
}) {
  const supabase = createClient()
  const home = getTeam(match.home_team), away = getTeam(match.away_team)
  const [h, setH] = useState<number | null>(initialH)
  const [a, setA] = useState<number | null>(initialA)
  const [saving, setSaving] = useState(false)

  async function save() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || h == null || a == null) return
    setSaving(true)
    const { error } = await supabase.from('predictions').upsert({
      user_id: user.id, match_id: match.id,
      pred_home: h, pred_away: a,
    }, { onConflict: 'user_id,match_id' })
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    toast.success(`${home.code} ${h}–${a} ${away.code} saved`)
    onSaved(match.id, h, a)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm sm:mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-texts">{match.group_name ? `Group ${match.group_name}` : 'Knockout'}</p>
              <p className="text-sm font-extrabold text-textp">{home.name} vs {away.name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg border border-border text-texts hover:text-textp text-lg">×</button>
          </div>

          <div className="flex items-center justify-center gap-5 py-3">
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">{home.flag}</span>
              <ScoreStepper value={h} onChange={setH} />
            </div>
            <span className="text-xl font-black text-texts mt-6">:</span>
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">{away.flag}</span>
              <ScoreStepper value={a} onChange={setA} />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="surface" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={save} disabled={saving || h == null || a == null}>
              {saving ? 'Saving…' : 'Save pick'}
            </Button>
          </div>
          <p className="text-center text-[11px] text-texts mt-3">For full options (first scorer, BTTS etc), tap View match →</p>
        </div>
      </div>
    </>
  )
}
