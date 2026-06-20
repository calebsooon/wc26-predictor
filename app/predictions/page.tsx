'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { EmptyState, Skeleton, CalIcon } from '@/components/ui'
import { CalendarExportButton } from '@/components/CalendarExport'
import { toUIMatch, matchStatus, type DBMatch, type MyPred } from '@/lib/match-ui'
import { getActiveLeague } from '@/lib/league'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'

const MATCH_WEIGHT_KEYS: (keyof ScoringWeights)[] = [
  'outcome', 'exact', 'goalDiff', 'totalGoals', 'teamGoals', 'btts', 'firstTeam', 'firstScorer',
]
function maxMatchPts(w: ScoringWeights) {
  return MATCH_WEIGHT_KEYS.reduce((s, k) => s + (w[k] ?? 0), 0)
}
function ptColor(pts: number, w: ScoringWeights): string {
  const max = maxMatchPts(w)
  if (max <= 0) return 'rgb(var(--primary))'
  const pct = pts / max
  if (pct >= 0.6) return 'rgb(var(--success))'
  if (pct >= 0.3) return 'rgb(var(--amber))'
  return 'rgb(var(--coral))'
}
import { fmtDateKey, fmtDateOnlyKey, fmtTime, getUserTimeZone } from '@/lib/date-format'
import FlagChip from '@/components/FlagChip'
import PredictionModal from '@/components/PredictionModal'
import { getTeam } from '@/lib/teams'
import { useUrlState } from '@/lib/url-state'
import { TeamLink } from '@/components/TeamLink'
import Link from 'next/link'

interface RoundRow { id: string; name: string; order: number; matches: DBMatch[] }

type MainFilter = 'open' | 'today' | 'missing' | 'closed' | 'full'
type StageFilter = 'all' | 'group' | 'knockout'

function mainFilterFromUrl(value: string | null): MainFilter {
  return value === 'today' || value === 'missing' || value === 'closed' || value === 'full' ? value : 'open'
}

function stageFilterFromUrl(value: string | null): StageFilter {
  return value === 'group' || value === 'knockout' ? value : 'all'
}

export default function FixturesPage() {
  const supabase = createClient()
  const router = useRouter()
  const { searchParams, replaceUrl } = useUrlState()
  const [matches, setMatches] = useState<DBMatch[]>([])
  const [preds, setPreds] = useState<Record<string, MyPred>>({})
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [mainFilter, setMainFilter] = useState<MainFilter>(() => mainFilterFromUrl(searchParams.get('status')))
  const [stageFilter, setStageFilter] = useState<StageFilter>(() => stageFilterFromUrl(searchParams.get('stage')))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalMatchId, setModalMatchId] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => searchParams.get('group'))
  const [timeZone, setTimeZone] = useState('Asia/Singapore')

  useEffect(() => {
    setTimeZone(getUserTimeZone())
  }, [])

  useEffect(() => {
    setMainFilter(mainFilterFromUrl(searchParams.get('status')))
    setStageFilter(stageFilterFromUrl(searchParams.get('stage')))
    setSelectedGroup(searchParams.get('group'))
  }, [searchParams])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }

        const [
          { data: roundData, error: roundErr },
          { data: myData, error: predErr },
          { weights: w },
        ] = await Promise.all([
          supabase.from('rounds')
            .select('id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)')
            .order('"order"')
            .order('match_date', { referencedTable: 'matches' }),
          supabase.from('predictions')
            .select('match_id, pred_home, pred_away, pred_total_goals, pred_goal_diff, pred_btts, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer')
            .eq('user_id', user.id),
          getActiveLeague(supabase, user.id),
        ])

        if (roundErr) throw roundErr
        if (predErr) throw predErr

        const flat: DBMatch[] = []
        for (const r of (roundData ?? []) as unknown as RoundRow[]) {
          for (const m of r.matches ?? []) flat.push({ ...m, round_name: r.name })
        }
        setMatches(flat)

        const map: Record<string, MyPred> = {}
        for (const p of myData ?? []) map[(p as { match_id: string }).match_id] = p as unknown as MyPred
        setPreds(map)
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

  // Refetch a single match (+ my prediction for it) — called when the modal closes
  // so a freshly-entered score or updated pick shows on the card without waiting on
  // realtime (the matches table may not be in the realtime publication).
  const refreshMatch = useCallback(async (matchId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: m }, predRes] = await Promise.all([
      supabase.from('matches')
        .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek')
        .eq('id', matchId).single(),
      user
        ? supabase.from('predictions')
            .select('match_id, pred_home, pred_away, pred_total_goals, pred_goal_diff, pred_btts, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer')
            .eq('user_id', user.id).eq('match_id', matchId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    if (m) setMatches((prev) => prev.map((x) => x.id === matchId ? { ...x, ...(m as Partial<DBMatch>) } : x))
    if (predRes?.data) setPreds((prev) => ({ ...prev, [matchId]: predRes.data as unknown as MyPred }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: update match scores without requiring a page refresh
  useEffect(() => {
    const channel = supabase
      .channel('fixtures-match-scores')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          const updated = payload.new as Partial<DBMatch> & { id: string }
          setMatches((prev) => prev.map((m) => {
            if (m.id !== updated.id) return m
            const scoreChanged =
              updated.real_home_score !== m.real_home_score ||
              updated.real_away_score !== m.real_away_score
            if (scoreChanged && updated.real_home_score != null && updated.real_away_score != null) {
              const home = getTeam(m.home_team)
              const away = getTeam(m.away_team)
              toast.info(`${home.name} ${updated.real_home_score}–${updated.real_away_score} ${away.name}`, { duration: 4000 })
            }
            return { ...m, ...updated }
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const localDateKey = (d: Date) => fmtDateOnlyKey(d.toISOString(), timeZone)
  const todayLocal = localDateKey(new Date())
  const tomorrowLocal = localDateKey(new Date(Date.now() + 86_400_000))

  const counts = useMemo(() => {
    const missing = matches.filter((m) => matchStatus(m, preds[m.id]) === 'missing').length
    const today = matches.filter((m) => fmtDateOnlyKey(m.match_date, timeZone) === todayLocal).length
    const open = matches.filter((m) => m.real_home_score === null || m.real_away_score === null).length
    const closed = matches.filter((m) => m.real_home_score !== null && m.real_away_score !== null).length
    const full = matches.length
    return { open, missing, today, closed, full }
  }, [matches, preds, timeZone, todayLocal])

  const groupNames = useMemo(() => {
    const seen = new Set<string>()
    for (const m of matches) {
      if (!toUIMatch(m, preds[m.id]).knockout && m.group_name) seen.add(m.group_name)
    }
    return Array.from(seen).sort()
  }, [matches, preds])

  const filtered = useMemo(() => matches.filter((m) => {
    const ui = toUIMatch(m, preds[m.id])

    const passesMain =
      mainFilter === 'full'
        ? true
        : mainFilter === 'open'
        ? (m.real_home_score === null || m.real_away_score === null)
        : mainFilter === 'closed'
        ? (m.real_home_score !== null && m.real_away_score !== null)
        : mainFilter === 'today'
        ? fmtDateOnlyKey(m.match_date, timeZone) === todayLocal
        : matchStatus(m, preds[m.id]) === 'missing'

    if (!passesMain) return false

    switch (stageFilter) {
      case 'group':
        if (selectedGroup) return m.group_name === selectedGroup
        return !ui.knockout
      case 'knockout':
        return ui.knockout
      default:
        return true
    }
  }), [matches, preds, mainFilter, stageFilter, selectedGroup, timeZone, todayLocal])

  const byDate = useMemo(() => {
    const g: Record<string, DBMatch[]> = {}
    for (const m of filtered) {
      const key = fmtDateOnlyKey(m.match_date, timeZone)
      ;(g[key] ||= []).push(m)
    }
    return g
  }, [filtered, timeZone])
  const dates = Object.keys(byDate).sort()

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Skeleton className="h-[70px] w-64 rounded-[12px]" />
        <Skeleton className="h-10 w-full rounded-[12px]" />
        {[0, 1].map((i) => (
          <div key={i} style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 16, overflow: 'hidden' }}>
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ marginTop: j > 0 ? 1 : 0 }}>
                <Skeleton className="h-[72px] w-full rounded-none" />
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return <EmptyState icon={<CalIcon size={22} />} title="Couldn't load fixtures" desc={error} />
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>World Cup 2026</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Schibsted Grotesk, sans-serif', lineHeight: 1.15, margin: 0 }}>
            Fixtures
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {counts.missing > 0 && (
            <div style={{
              color: 'rgb(var(--coral))',
              background: 'rgba(var(--coral),0.12)',
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              {counts.missing} open to predict
            </div>
          )}
          <CalendarExportButton variant="outline" size="sm" />
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Row 1: main filter chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
          {(
            [
              { key: 'open' as MainFilter, label: 'Open', count: counts.open },
              { key: 'closed' as MainFilter, label: 'Closed', count: counts.closed },
              { key: 'today' as MainFilter, label: 'Today', count: counts.today },
              { key: 'missing' as MainFilter, label: 'Missing', count: counts.missing },
              { key: 'full' as MainFilter, label: 'All', count: counts.full },
            ] as { key: MainFilter; label: string; count: number }[]
          ).map(({ key, label, count }) => {
            const active = mainFilter === key
            return (
              <button
                key={key}
                onClick={() => {
                  setMainFilter(key)
                  replaceUrl({ status: key === 'open' ? null : key })
                }}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  background: active ? 'rgb(var(--textp))' : 'rgb(var(--card))',
                  color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                  border: active ? '1px solid rgb(var(--textp))' : '1px solid rgb(var(--border))',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                {label}
                <span style={{
                  background: active ? 'rgba(0,0,0,0.20)' : 'rgb(var(--surface3))',
                  color: active ? '#fff' : 'rgb(var(--textp))',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Row 2: stage filter chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              { key: 'all' as StageFilter, label: 'All stages' },
              { key: 'group' as StageFilter, label: 'Group' },
              { key: 'knockout' as StageFilter, label: 'Knockout' },
            ] as { key: StageFilter; label: string }[]
          ).map(({ key, label }) => {
            const active = stageFilter === key
            return (
              <button
                key={key}
                onClick={() => {
                  setStageFilter(key)
                  if (key !== 'group') setSelectedGroup(null)
                  replaceUrl({ stage: key === 'all' ? null : key, group: key === 'group' ? searchParams.get('group') : null })
                }}
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: active ? 'rgb(var(--primary))' : 'rgb(var(--surface2))',
                  color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                  border: active ? '1px solid transparent' : '1px solid rgb(var(--border))',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Group letter sub-chips */}
        {stageFilter === 'group' && groupNames.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {groupNames.map((g) => {
              const active = selectedGroup === g
              return (
                <button
                  key={g}
                  onClick={() => {
                    const next = active ? null : g
                    setSelectedGroup(next)
                    replaceUrl({ stage: 'group', group: next })
                  }}
                  style={{
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: active ? 'rgb(var(--primary))' : 'rgb(var(--surface2))',
                    color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                    border: 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {g}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Date groups */}
      {dates.length === 0 ? (
        <EmptyState icon={<CalIcon size={22} />} title="Nothing here" desc="No matches match this filter." />
      ) : (
        dates.map((d) => (
          <DateGroup
            key={d}
            dateKey={d}
            isToday={d === todayLocal}
            isTomorrow={d === tomorrowLocal}
            matches={byDate[d]}
            preds={preds}
            weights={weights}
            onOpen={setModalMatchId}
            timeZone={timeZone}
          />
        ))
      )}

      {modalMatchId && (
        <PredictionModal
          matchId={modalMatchId}
          onClose={() => { const id = modalMatchId; setModalMatchId(null); if (id) refreshMatch(id) }}
        />
      )}
    </div>
  )
}

/* ─── DateGroup ─────────────────────────────────────────────────────────── */
function DateGroup({
  dateKey, isToday, isTomorrow, matches, preds, weights, onOpen,
  timeZone,
}: {
  dateKey: string
  isToday: boolean
  isTomorrow: boolean
  matches: DBMatch[]
  preds: Record<string, MyPred>
  weights: ScoringWeights
  onOpen: (id: string) => void
  timeZone: string
}) {
  // Build label: "TODAY, 15 JUNE" / "TOMORROW" / formatted date
  const [year, month, day] = dateKey.split('-').map(Number)
  const baseFmt = new Intl.DateTimeFormat('en-SG', {
    day: 'numeric', month: 'long', timeZone,
  }).format(new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12)))

  let dateLabel: string
  if (isToday) {
    dateLabel = `TODAY, ${baseFmt.toUpperCase()}`
  } else if (isTomorrow) {
    dateLabel = 'TOMORROW'
  } else {
    dateLabel = fmtDateKey(dateKey, timeZone).toUpperCase()
  }

  return (
    <div>
      {/* Date header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 0 }}>
        <span className="eb" style={{ color: 'rgb(var(--faint))', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {dateLabel}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgb(var(--border))' }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgb(var(--faint))' }} className="tabular-nums">
          {matches.length}
        </span>
      </div>

      {/* Card container */}
      <div style={{
        background: 'rgb(var(--card))',
        border: '1px solid rgb(var(--border))',
        boxShadow: 'var(--card-shadow)',
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 10,
      }}>
        {matches.map((m, i) => (
          <MatchRow
            key={m.id}
            m={m}
            pred={preds[m.id] ?? null}
            weights={weights}
            divider={i > 0}
            onOpen={() => onOpen(m.id)}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  )
}

/* ─── MatchRow ──────────────────────────────────────────────────────────── */
function MatchRow({
  m, pred, weights, divider, onOpen,
  timeZone,
}: {
  m: DBMatch
  pred: MyPred | null
  weights: ScoringWeights
  divider: boolean
  onOpen: () => void
  timeZone: string
}) {
  const ui = toUIMatch(m, pred, weights)
  const home = getTeam(m.home_team)
  const away = getTeam(m.away_team)
  const timeStr = fmtTime(m.match_date, timeZone)
  const hasScore = m.real_home_score !== null && m.real_away_score !== null
  const isKO = ui.knockout

  // Determine status pill props
  type PillCfg = { label: string; color: string; bg: string; border: string }
  let pill: PillCfg

  if (hasScore) {
    // settled
    if (ui.pts != null) {
      pill = {
        label: `+${ui.pts} pts`,
        color: ptColor(ui.pts, weights),
        bg: 'rgba(var(--primary),0.12)',
        border: 'rgba(var(--primary),0.25)',
      }
    } else {
      pill = {
        label: 'Settled',
        color: 'rgb(var(--faint))',
        bg: 'rgb(var(--surface2))',
        border: 'rgb(var(--border))',
      }
    }
  } else if (ui.status === 'missing') {
    pill = {
      label: 'Predict now',
      color: 'rgb(var(--coral))',
      bg: 'rgba(var(--coral),0.12)',
      border: 'rgba(var(--coral),0.3)',
    }
  } else if (ui.status === 'submitted' && pred) {
    // predicted, not yet locked
    pill = {
      label: `Your pick ${pred.pred_home}–${pred.pred_away}`,
      color: 'rgb(var(--blue))',
      bg: 'rgba(var(--blue),0.12)',
      border: 'rgba(var(--blue),0.3)',
    }
  } else if (ui.status === 'locked') {
    if (pred) {
      pill = {
        label: `${pred.pred_home}–${pred.pred_away}`,
        color: 'rgb(var(--blue))',
        bg: 'rgba(var(--blue),0.12)',
        border: 'rgba(var(--blue),0.3)',
      }
    } else {
      pill = {
        label: 'Locked',
        color: 'rgb(var(--faint))',
        bg: 'rgb(var(--surface2))',
        border: 'rgb(var(--border))',
      }
    }
  } else {
    pill = {
      label: 'Locked',
      color: 'rgb(var(--faint))',
      bg: 'rgb(var(--surface2))',
      border: 'rgb(var(--border))',
    }
  }

  return (
    <div
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen()
      }}
      role="button"
      tabIndex={0}
      className="hover:bg-textp/[0.035]"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderTop: divider ? '1px solid rgba(var(--border),0.55)' : undefined,
        width: '100%',
        textAlign: 'left',
        border: divider ? undefined : 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        background: 'transparent',
      }}
    >
      {/* Time / group block */}
      <div style={{ width: 52, flexShrink: 0 }}>
        <div style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: 'rgb(var(--textp))',
          fontFamily: 'Schibsted Grotesk, sans-serif',
        }}>
          {timeStr}
        </div>
        {!isKO && m.group_name ? (
          <div className="eb" style={{
            color: 'rgb(var(--blue))',
            fontSize: 11,
            fontWeight: 700,
            marginTop: 2,
          }}>
            GRP {m.group_name}
          </div>
        ) : isKO ? (
          <div className="eb" style={{
            color: 'rgb(var(--blue))',
            fontSize: 11,
            fontWeight: 700,
            marginTop: 2,
          }}>
            KO
          </div>
        ) : null}
      </div>

      {/* Teams block */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Home */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamLink code={m.home_team} stopPropagation className="flex items-center gap-2 min-w-0 group" style={{ color: 'inherit' }}>
            <FlagChip code={m.home_team} w={26} h={18} r={4} />
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'Schibsted Grotesk, sans-serif',
              color: 'rgb(var(--textp))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {home.name}
            </span>
          </TeamLink>
          {hasScore && (
            <span style={{ fontSize: 14, fontWeight: 800, color: 'rgb(var(--textp))', marginLeft: 'auto', paddingRight: 4 }}>
              {m.real_home_score}
            </span>
          )}
        </div>
        {/* Away */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamLink code={m.away_team} stopPropagation className="flex items-center gap-2 min-w-0 group" style={{ color: 'inherit' }}>
            <FlagChip code={m.away_team} w={26} h={18} r={4} />
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'Schibsted Grotesk, sans-serif',
              color: 'rgb(var(--textp))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {away.name}
            </span>
          </TeamLink>
          {hasScore && (
            <span style={{ fontSize: 14, fontWeight: 800, color: 'rgb(var(--textp))', marginLeft: 'auto', paddingRight: 4 }}>
              {m.real_away_score}
            </span>
          )}
        </div>
      </div>

      {/* Status pill / countdown */}
      <div style={{ minWidth: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', maxWidth: 120 }}>
        {!hasScore && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <MiniCountdown kickoff={m.match_date} />
          </div>
        )}
        {hasScore ? (
          <span style={{
            padding: '6px 11px',
            borderRadius: 999,
            border: `1px solid ${pill.border}`,
            fontSize: 11.5,
            fontWeight: 700,
            textAlign: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: pill.color,
            background: pill.bg,
            whiteSpace: 'nowrap',
          }}>
            {pill.label}
          </span>
        ) : (
          <span style={{
            padding: '6px 11px',
            borderRadius: 999,
            border: `1px solid ${pill.border}`,
            fontSize: 11.5,
            fontWeight: 700,
            textAlign: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: pill.color,
            background: pill.bg,
            whiteSpace: 'nowrap',
            marginTop: 4,
          }}>
            {pill.label}
          </span>
        )}
      </div>
      <Link
        href={`/match/${m.id}`}
        onClick={(event) => event.stopPropagation()}
        className="shrink-0 text-[11px] font-bold text-texts hover:text-primary"
      >
        Match details
      </Link>
    </div>
  )
}

/* ─── MiniCountdown ─────────────────────────────────────────────────────── */
function MiniCountdown({ kickoff }: { kickoff: string }) {
  const [label, setLabel] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    function update() {
      const diff = new Date(kickoff).getTime() - Date.now()
      if (diff <= 0) { setLabel('Live'); setLocked(true); return }
      const totalMins = Math.floor(diff / 60_000)
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      setIsUrgent(totalMins < 60)
      setLocked(false)
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    update()
    const t = setInterval(update, 60_000)
    return () => clearInterval(t)
  }, [kickoff])

  if (!label) return null

  return (
    <span style={{
      fontSize: 11.5,
      fontWeight: 700,
      color: locked ? 'rgb(var(--faint))' : isUrgent ? 'rgb(var(--coral))' : 'rgb(var(--amber))',
    }} className="tabular-nums">
      {label}
    </span>
  )
}
