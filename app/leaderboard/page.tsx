'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, Card, Skeleton, EmptyState, TrophyIcon, Avatar, LeagueBadge, Pill, ChipRow, BoltIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { type LBRow } from '@/components/football'
import { aggregateLeaderboard, type ProfileLite, type ScoredGroupPred, type ScoredTournamentPred } from '@/lib/leaderboard'
import { getActiveLeague, getMyLeagues, setActiveLeague, isMoneyLeague, type League, type LeagueLabel } from '@/lib/league'
import { DEFAULT_WEIGHTS, weightedMatchPoints, type ScoringWeights } from '@/lib/scoring'
import { GW_NAMES, GW_SHORT, GW_PRIZES, OVERALL_PRIZES, formatPrize, prizeTone } from '@/lib/prizes'
import { PointsRaceChart, RaceCompareChart, playerPalette, type RaceSeries, type RaceVariant } from '@/components/charts'
import { useColorblind } from '@/lib/prefs'
import { getTeam } from '@/lib/teams'
import { fmtDateTime } from '@/lib/date-format'
import { useUrlState } from '@/lib/url-state'
import { TeamLink } from '@/components/TeamLink'

const PRED_COLS = 'user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, matches(gw_number, match_date)'

interface PredRow {
  user_id: string
  points_awarded: number
  pts_outcome: number | null
  pts_exact: number | null
  pts_goal_diff: number | null
  pts_total_goals: number | null
  pts_team_goals: number | null
  pts_btts: number | null
  pts_first_team: number | null
  pts_first_scorer: number | null
  profiles?: { username: string; avatar_url: string | null } | null
  matches: { gw_number: number | null; match_date?: string | null } | null
}
interface SnapRow { user_id: string; rank: number; snapshot_at: string }

interface PickMatch {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
}

interface PickPred {
  match_id: string
  user_id: string
  pred_home: number | null
  pred_away: number | null
  points_awarded: number | null
  pts_outcome: number | null
  pts_exact: number | null
  pts_goal_diff: number | null
  pts_total_goals: number | null
  pts_team_goals: number | null
  pts_btts: number | null
  pts_first_team: number | null
  pts_first_scorer: number | null
}

function downloadCSV(rows: LBRow[], gwLabel: string, includePrize: boolean) {
  const headers = ['Rank', 'Player', 'Points', 'Exact Scores', 'Accuracy %', ...(includePrize ? ['Prize'] : [])]
  const data = rows.map((r, i) => [
    String(i + 1),
    r.name,
    String(r.pts),
    String(r.exact ?? 0),
    String(r.acc ?? 0),
    ...(includePrize ? [r.prize != null ? String(r.prize) : ''] : []),
  ])
  const csv = [headers, ...data].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `matchday-leaderboard-${gwLabel.toLowerCase().replace(/\s+/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const GW_TABS = [
  { key: 'all', label: 'Overall' },
  ...Array.from({ length: 8 }, (_, i) => ({ key: String(i + 1), label: GW_SHORT[i + 1] })),
]

const VIEW_TABS = [
  { key: 'standings', label: 'Standings' },
  { key: 'picks', label: 'Picks' },
]

function leaderboardTabFromUrl(value: string | null): string {
  return value === 'all' || /^[1-8]$/.test(value ?? '') ? value ?? 'all' : 'all'
}

export default function LeaderboardPage() {
  const supabase = createClient()
  const { searchParams, replaceUrl } = useUrlState()
  const [rows, setRows] = useState<PredRow[]>([])
  const [groupRows, setGroupRows] = useState<ScoredGroupPred[]>([])
  const [tournRows, setTournRows] = useState<ScoredTournamentPred[]>([])
  const [members, setMembers] = useState<ProfileLite[]>([])
  const memberIdsRef = useRef<string[]>([])
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [leagueName, setLeagueName] = useState<string>('')
  const [leagueLabel, setLeagueLabel] = useState<LeagueLabel | null>(null)
  const [isMoney, setIsMoney] = useState(false)
  const [revealPicks, setRevealPicks] = useState(false)
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const [prevRanks, setPrevRanks] = useState<Map<string, number>>(new Map())
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState(() => leaderboardTabFromUrl(searchParams.get('tab')))
  const [view, setView] = useState(() => searchParams.get('view') === 'picks' ? 'picks' : 'standings')
  const [raceVariant, setRaceVariant] = useState<RaceVariant>('absolute') // race chart mode
  const colorblind = useColorblind()
  const [loading, setLoading] = useState(true)

  // Picks tab state
  const [pickMatches, setPickMatches] = useState<PickMatch[]>([])
  const [pickPreds, setPickPreds] = useState<PickPred[]>([])
  const [picksLoading, setPicksLoading] = useState(false)

  useEffect(() => {
    setTab(leaderboardTabFromUrl(searchParams.get('tab')))
    setView(searchParams.get('view') === 'picks' ? 'picks' : 'standings')
  }, [searchParams])

  const fetchRows = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setRows([]); setGroupRows([]); setTournRows([]); return }
    const [matchRes, groupRes, tournRes] = await Promise.all([
      supabase.from('predictions').select(PRED_COLS).not('points_awarded', 'is', null).in('user_id', ids),
      supabase.from('group_predictions').select('user_id, points_awarded').not('points_awarded', 'is', null).in('user_id', ids),
      supabase.from('tournament_predictions').select('user_id, pts_champion, pts_runner_up, pts_semi, pts_quarter').in('user_id', ids),
    ])
    if (!matchRes.error) setRows((matchRes.data ?? []) as unknown as PredRow[])
    if (!groupRes.error) setGroupRows((groupRes.data ?? []) as ScoredGroupPred[])
    if (!tournRes.error) setTournRows((tournRes.data ?? []) as ScoredTournamentPred[])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function applyLeague(uid: string) {
    const { league, weights: w, memberIds: ids, memberProfiles } = await getActiveLeague(supabase, uid)
    setWeights(w)
    setMembers(memberProfiles)
    memberIdsRef.current = ids
    setLeagueName(league?.name ?? '')
    setLeagueLabel(league?.league_labels ?? null)
    setIsMoney(isMoneyLeague(league))
    setRevealPicks(league?.reveal_predictions === true)
    setActiveLeagueId(league?.id ?? null)
    // Reset to standings if reveal is off
    if (!league?.reveal_predictions) setView('standings')
    await Promise.all([fetchRows(ids), fetchSnaps(league?.id ?? null)])
  }

  async function switchLeague(id: string) {
    if (!userId || id === activeLeagueId) return
    await setActiveLeague(supabase, userId, id)
    setLoading(true)
    await applyLeague(userId)
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        setUserId(user.id)
        setMyLeagues(await getMyLeagues(supabase, user.id))
        await applyLeague(user.id)
      } catch {
        // non-fatal — empty state will show
      } finally {
        setLoading(false)
      }
    }
    load()
    // No generic Realtime channel here — the scoped league channel below handles real-time updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime subscription — debounced re-fetch when predictions are scored (fires once per batch, not per row)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeLeagueId) return
    const debouncedFetch = () => {
      if (!memberIdsRef.current.length) return
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
      fetchTimeoutRef.current = setTimeout(() => fetchRows(memberIdsRef.current), 1500)
    }
    const channel = supabase
      .channel(`lb-realtime-${activeLeagueId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions' }, debouncedFetch)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeagueId, fetchRows])

  // Load picks data when picks tab is activated
  useEffect(() => {
    if (view !== 'picks' || !revealPicks || members.length === 0) return
    loadPicks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, revealPicks, members])

  async function loadPicks() {
    setPicksLoading(true)
    try {
      const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name')
        .order('match_date', { ascending: true })
        .limit(30)
      if (mErr) throw mErr
      setPickMatches((matches ?? []) as PickMatch[])

      if (matches && matches.length > 0) {
        const matchIds = (matches as PickMatch[]).map((m) => m.id)
        const { data: preds, error: pErr } = await supabase
          .from('predictions')
          .select('match_id, user_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer')
          .in('match_id', matchIds)
          .in('user_id', memberIdsRef.current)
        if (pErr) throw pErr
        setPickPreds((preds ?? []) as PickPred[])
      }
    } catch {
      // picks are non-critical — silently degrade, skeleton clears
    } finally {
      setPicksLoading(false)
    }
  }

  async function fetchSnaps(leagueId: string | null) {
    if (!leagueId) { setPrevRanks(new Map()); return }
    const { data: snaps, error } = await supabase
      .from('rank_snapshots')
      .select('user_id, rank, snapshot_at')
      .eq('league_id', leagueId)
      .order('snapshot_at', { ascending: false })
      .limit(200)
    if (error) return
    if (snaps && snaps.length > 0) {
      const latest = (snaps[0] as SnapRow).snapshot_at
      const map = new Map<string, number>()
      for (const s of snaps as SnapRow[]) if (s.snapshot_at === latest) map.set(s.user_id, s.rank)
      setPrevRanks(map)
    } else {
      setPrevRanks(new Map())
    }
  }

  const board = useMemo<LBRow[]>(() => {
    const gwNum = tab === 'all' ? null : parseInt(tab)
    const prizes = tab === 'all' ? OVERALL_PRIZES : GW_PRIZES
    const sorted = aggregateLeaderboard({ scoredPreds: rows, profiles: members, userId, gwNumber: gwNum, weights, groupPreds: groupRows, tournamentPreds: tournRows })
    return sorted.map((r, currentIdx) => {
      const prevRank = prevRanks.get(r.id)
      const move = prevRank != null ? prevRank - (currentIdx + 1) : undefined
      const prize = isMoney ? prizes[Math.min(currentIdx, 6)] : undefined
      return { ...r, move, prize }
    })
  }, [rows, groupRows, tournRows, tab, userId, prevRanks, members, weights, isMoney])

  const podium = board.slice(0, 3)
  const hasSnapshots = prevRanks.size > 0
  const gwLabel = tab === 'all' ? 'Overall' : (GW_NAMES[parseInt(tab)] ?? tab)

  const raceLabels = useMemo(() => {
    if (tab === 'all') {
      const gwNums = [1, 2, 3, 4, 5, 6, 7, 8]
      const gwHasData = gwNums.map((gw) => rows.some((r) => r.matches?.gw_number === gw))
      let last = -1
      for (let i = 0; i < gwNums.length; i++) { if (gwHasData[i]) last = i }
      if (last < 0) return [GW_SHORT[1] ?? 'GW1']
      return gwNums.slice(0, last + 1).map((gw) => GW_SHORT[gw] ?? `GW${gw}`)
    }
    const gwNum = parseInt(tab)
    if (gwNum <= 3) {
      // Line mode within this GW: X axis = unique calendar days (YYYY-MM-DD)
      const days = Array.from(
        new Set(
          rows
            .filter((r) => r.matches?.gw_number === gwNum && r.matches?.match_date)
            .map((r) => (r.matches!.match_date as string).slice(0, 10))
        )
      ).sort()
      // Cap at 12 labels max — sample evenly if more
      const step = days.length > 12 ? Math.ceil(days.length / 12) : 1
      return days
        .filter((_, i) => i % step === 0 || i === days.length - 1)
        .map((d) => {
          const [, m, day] = d.split('-')
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          return `${parseInt(day)} ${months[parseInt(m) - 1]}`
        })
    }
    // GW4+: bar mode — no X labels needed (names shown below bars)
    return []
  }, [rows, tab])

  const raceSeries = useMemo<RaceSeries[]>(() => {
    const palette = playerPalette(colorblind)
    return board.map((p, idx) => {
      const userRows = rows.filter((r) => r.user_id === p.id)
      const color = palette[idx % palette.length]
      if (tab === 'all') {
        const gwCount = raceLabels.length
        let cum = 0
        const data = [1, 2, 3, 4, 5, 6, 7, 8].slice(0, gwCount).map((gw) => {
          cum += userRows
            .filter((r) => r.matches?.gw_number === gw)
            .reduce((s, r) => s + weightedMatchPoints(r, weights), 0)
          return cum
        })
        return { id: p.id, name: p.name, color, data }
      }
      const gwNum = parseInt(tab)
      if (gwNum <= 3) {
        // Cumulative within this GW by calendar day (truncate to YYYY-MM-DD)
        const days = Array.from(
          new Set(
            rows
              .filter((r) => r.matches?.gw_number === gwNum && r.matches?.match_date)
              .map((r) => (r.matches!.match_date as string).slice(0, 10))
          )
        ).sort()
        const step = days.length > 12 ? Math.ceil(days.length / 12) : 1
        const sampledDays = days.filter((_, i) => i % step === 0 || i === days.length - 1)
        let cum = 0
        // accumulate all days including skipped ones, but only emit sampled points
        let dayIdx = 0
        const data: number[] = []
        for (const d of days) {
          cum += userRows
            .filter((r) => r.matches?.gw_number === gwNum && (r.matches!.match_date as string).slice(0, 10) === d)
            .reduce((s, r) => s + weightedMatchPoints(r, weights), 0)
          if (sampledDays[dayIdx] === d) { data.push(cum); dayIdx++ }
        }
        return { id: p.id, name: p.name, color, data }
      }
      // GW4+ knockout: single total
      const pts = userRows
        .filter((r) => r.matches?.gw_number === gwNum)
        .reduce((s, r) => s + weightedMatchPoints(r, weights), 0)
      return { id: p.id, name: p.name, color, data: [pts] }
    })
  }, [rows, board, tab, raceLabels, weights, colorblind])
  const myIdx = board.findIndex((r) => r.you)
  const srStatus = myIdx >= 0 ? `You are ranked ${myIdx + 1} of ${board.length}${leagueName ? ` in ${leagueName}` : ''} with ${board[myIdx].pts} points.` : ''

  if (loading) {
    return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Standings"
        title="Leaderboard"
        sub={view === 'picks' ? 'Everyone\'s pregame picks for upcoming matches' : tab === 'all' ? (isMoney ? 'Overall season standings + prize pool' : 'Overall season standings') : gwLabel}
        action={leagueName ? <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-textp">{leagueName}<LeagueBadge name={leagueLabel?.name} color={leagueLabel?.color} money={isMoney} /></span> : undefined}
      />

      <p className="sr-only" role="status" aria-live="polite">{srStatus}</p>

      {/* League switcher */}
      {myLeagues.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 no-scrollbar pb-0.5">
          {myLeagues.map((l) => {
            const active = l.id === activeLeagueId
            return (
              <button
                key={l.id}
                onClick={() => switchLeague(l.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full border text-[13px] font-bold transition-colors ${active ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-surface text-texts hover:text-textp'}`}
              >
                {l.name}
                <LeagueBadge name={l.league_labels?.name} color={l.league_labels?.color} money={isMoneyLeague(l)} />
              </button>
            )
          })}
        </div>
      )}

      {/* Top-level view switcher — only show Picks tab if league has reveal on */}
      {revealPicks && (
        <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border w-fit">
          {VIEW_TABS.map((v) => (
            <button
              key={v.key}
              onClick={() => {
                setView(v.key)
                replaceUrl({ view: v.key === 'standings' ? null : v.key })
              }}
              className={`px-4 h-8 rounded-lg text-sm font-bold transition-all ${view === v.key ? 'bg-card text-textp shadow-sm' : 'text-texts hover:text-textp'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {view === 'picks' ? (
        <PicksView
          matches={pickMatches}
          preds={pickPreds}
          members={members}
          userId={userId}
          loading={picksLoading}
          weights={weights}
        />
      ) : (
        <>
          {/* GW pill tabs + CSV export */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 overflow-x-auto no-scrollbar -mx-4 px-4"
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', gap: 8, paddingBottom: 4, flexShrink: 0 }}>
                {GW_TABS.map((t) => {
                  const active = t.key === tab
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        setTab(t.key)
                        replaceUrl({ tab: t.key === 'all' ? null : t.key })
                      }}
                      style={{
                        height: 36,
                        padding: '0 14px',
                        borderRadius: 999,
                        fontSize: '12.5px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        border: '1px solid',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        background: active ? 'rgb(var(--textp))' : 'rgb(var(--card))',
                        color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                        borderColor: active ? 'rgb(var(--textp))' : 'rgb(var(--border))',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              onClick={() => { if (tab !== 'all') window.location.assign(`/recap?gw=${tab}`) }}
              disabled={tab === 'all'}
              className="shrink-0 text-[12px] font-bold text-texts hover:text-textp disabled:opacity-35 px-3 py-1.5 rounded-lg border border-border hover:border-texts/40 transition-colors"
            >
              Recap
            </button>
            <button
              onClick={() => downloadCSV(board, gwLabel, isMoney)}
              className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold text-texts hover:text-textp px-3 py-1.5 rounded-lg border border-border hover:border-texts/40 transition-colors"
            >
              ↓ CSV
            </button>
          </div>

          {board.length === 0 ? (
            <EmptyState icon={<TrophyIcon size={22} />} title="No players yet" desc="Players will appear here once they sign up." />
          ) : (
            <>
              {/* Podium */}
              {podium.length >= 3 && (
                <div
                  style={{
                    background: 'rgb(var(--card))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 20,
                    padding: '52px 24px 0',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Gold glow */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at 50% -10%, rgba(var(--gold),0.10), transparent 45%)',
                    pointerEvents: 'none',
                  }} />

                  <div style={{
                    maxWidth: 620,
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    alignItems: 'end',
                    gap: 0,
                  }}>
                    {/* 2nd place */}
                    <PodiumSlot
                      player={podium[1]}
                      place={2}
                      isMoney={isMoney}
                      tab={tab}
                    />
                    {/* 1st place */}
                    <PodiumSlot
                      player={podium[0]}
                      place={1}
                      isMoney={isMoney}
                      tab={tab}
                    />
                    {/* 3rd place */}
                    <PodiumSlot
                      player={podium[2]}
                      place={3}
                      isMoney={isMoney}
                      tab={tab}
                    />
                  </div>
                </div>
              )}

              {/* Stat highlights */}
              <StatHighlights board={board} rows={rows} weights={weights} />

              {/* Full table */}
              <div style={{
                background: 'rgb(var(--card))',
                border: '1px solid rgb(var(--border))',
                borderRadius: 18,
                overflow: 'hidden',
              }}>
                {/* Table header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: '1px solid rgb(var(--border))',
                  gap: 14,
                }}>
                  <span style={{ width: 22, fontSize: 11, fontWeight: 700, color: 'rgb(var(--faint))', textAlign: 'center', flexShrink: 0 }}>#</span>
                  {hasSnapshots && <span style={{ width: 10, flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'rgb(var(--faint))' }}>Player</span>
                  <span className="hidden sm:block" style={{ width: 90, fontSize: 11, fontWeight: 700, color: 'rgb(var(--faint))', textAlign: 'center', flexShrink: 0 }}>Exact</span>
                  <span style={{ width: 60, fontSize: 11, fontWeight: 700, color: 'rgb(var(--faint))', textAlign: 'right', flexShrink: 0 }}>{tab === 'all' ? 'Points' : 'GW Pts'}</span>
                  {isMoney && <span className="hidden sm:block" style={{ width: 60, fontSize: 11, fontWeight: 700, color: 'rgb(var(--faint))', textAlign: 'right', flexShrink: 0 }}>Prize</span>}
                </div>

                <div style={{ padding: '4px' }}>
                  {board.map((p, idx) => {
                    const place = idx + 1
                    const posColor =
                      place === 1 ? 'rgb(var(--gold))' :
                      place === 2 ? 'rgb(var(--texts))' :
                      place === 3 ? 'rgb(var(--bronze))' :
                      'rgb(var(--texts))'
                    const prizeAmt = p.prize
                    const prizeLabel = prizeAmt != null ? formatPrize(prizeAmt) : null
                    const tone = prizeAmt != null ? prizeTone(prizeAmt) : 'default'
                    const prizeColor =
                      tone === 'green' ? 'rgb(var(--success))' :
                      tone === 'red' ? 'rgb(var(--error))' :
                      'rgb(var(--texts))'

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '12px 16px',
                          borderRadius: 13,
                          margin: '2px 0',
                          background: p.you ? 'rgba(var(--primary),0.10)' : undefined,
                        }}
                      >
                        {/* Position */}
                        <span style={{
                          width: 22,
                          fontSize: 15,
                          fontWeight: 800,
                          textAlign: 'center',
                          color: posColor,
                          flexShrink: 0,
                        }}>
                          {place}
                        </span>

                        {/* Delta */}
                        {hasSnapshots && (
                          <span style={{
                            minWidth: 18,
                            fontSize: 13,
                            fontWeight: 700,
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                            color:
                              (p.move ?? 0) > 0 ? 'rgb(var(--success))' :
                              (p.move ?? 0) < 0 ? 'rgb(var(--error))' :
                              'rgb(var(--faint))',
                            animation: p.move ? 'lb-pop 0.45s' : undefined,
                          }}>
                            {p.move == null || p.move === 0 ? '–' : p.move > 0 ? `▲${p.move}` : `▼${Math.abs(p.move)}`}
                          </span>
                        )}

                        {/* Avatar */}
                        <Avatar name={p.name} src={p.avatar} size={34} you={p.you} />

                        {/* Name + accuracy block */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--textp))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </span>
                            {p.you && (
                              <span style={{
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: 999,
                                background: 'rgba(var(--primary),0.12)',
                                color: 'rgb(var(--primary))',
                                border: '1px solid rgba(var(--primary),0.2)',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                flexShrink: 0,
                              }}>
                                YOU
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgb(var(--texts))', marginTop: 1 }}>
                            {p.acc ?? 0}% acc · {p.exact ?? 0} exact
                          </div>
                        </div>

                        {/* Exact count — hidden on mobile */}
                        <span className="hidden sm:block" style={{
                          width: 90,
                          textAlign: 'center',
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'rgb(var(--blue))',
                          flexShrink: 0,
                        }}>
                          {p.exact ?? 0}
                        </span>

                        {/* Points */}
                        <span style={{
                          width: 60,
                          fontSize: 16,
                          fontWeight: 800,
                          textAlign: 'right',
                          fontFamily: 'Schibsted Grotesk, sans-serif',
                          color: 'rgb(var(--textp))',
                          flexShrink: 0,
                        }}>
                          {p.pts}
                        </span>

                        {/* Prize — hidden on mobile */}
                        {isMoney && (
                          <span className="hidden sm:block" style={{
                            width: 60,
                            textAlign: 'right',
                            fontSize: 13,
                            fontWeight: 700,
                            color: prizeColor,
                            flexShrink: 0,
                          }}>
                            {prizeLabel}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Points race chart */}
              {raceSeries.length > 0 && (
                <div style={{
                  marginTop: 20,
                  padding: '20px 16px 16px',
                  background: 'rgb(var(--card))',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))' }}>
                      {tab === 'all' ? 'Season Points Race' : parseInt(tab) <= 3 ? `${gwLabel} — Points Race` : `${gwLabel} Points`}
                    </p>
                    {/* Race chart mode toggle — only for line charts (Overall + group GWs).
                        Matches the segmented pill toggle used on profile/dashboard. */}
                    {(tab === 'all' || parseInt(tab) <= 3) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))', flexWrap: 'wrap' }}>
                        {([
                          ['absolute', 'Points'],
                          ['gapLeader', 'vs Leader'],
                          ['gapAvg', 'vs Avg'],
                          ['rank', 'Rank'],
                        ] as [RaceVariant, string][]).map(([v, label]) => {
                          const active = raceVariant === v
                          return (
                            <button
                              key={v}
                              onClick={() => setRaceVariant(v)}
                              style={{
                                height: 28, padding: '0 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                                background: active ? 'rgb(var(--textp))' : 'transparent',
                                color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                                fontSize: 11.5, fontWeight: 700, transition: 'all 0.15s',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {(tab === 'all' || parseInt(tab) <= 3) && (
                    <p style={{ fontSize: 11, color: 'rgb(var(--texts))', marginTop: -6, marginBottom: 12 }}>
                      {raceVariant === 'absolute' ? 'Total points accumulated over time.'
                        : raceVariant === 'gapLeader' ? 'Points behind the leader — the leader sits flat along the top.'
                          : raceVariant === 'gapAvg' ? 'Points above or below the field average (the dashed 0 line).'
                            : 'Finishing position over time — 1st place at the top, lines cross on overtakes.'}
                    </p>
                  )}
                  {tab === 'all' || parseInt(tab) <= 3 ? (
                    <RaceCompareChart series={raceSeries} labels={raceLabels} youId={userId} variant={raceVariant} />
                  ) : (
                    <PointsRaceChart series={raceSeries} labels={raceLabels} youId={userId} mode="bar" />
                  )}
                </div>
              )}

              <div style={{ padding: '2px 4px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isMoney && (
                  <p className="text-[11px] font-medium text-texts leading-relaxed">
                    <span className="font-semibold text-textp">{tab === 'all' ? 'Overall prize pool' : 'Per-round prize pool'}:</span>{' '}
                    {(tab === 'all' ? OVERALL_PRIZES : GW_PRIZES).map((amt, i) => {
                      const tone = prizeTone(amt)
                      const col = tone === 'green' ? 'rgb(var(--success))' : tone === 'red' ? 'rgb(var(--error))' : 'rgb(var(--texts))'
                      const sfx = ['st','nd','rd','th','th','th','th'][i]
                      return (
                        <React.Fragment key={i}>
                          <span>{i + 1}<span style={{ fontSize: 9, verticalAlign: 'super' }}>{sfx}</span> <span style={{ color: col, fontWeight: 700 }}>{formatPrize(amt)}</span></span>
                          {i < 6 && <span className="text-faint mx-1">·</span>}
                        </React.Fragment>
                      )
                    })}
                  </p>
                )}
                <p className="text-[11px] font-medium text-texts leading-relaxed">
                  <span className="font-semibold text-textp">Tiebreaker:</span>{' '}
                  {['Total points','Predictions in','Outcomes','Exact scores','Goal diff','Total goals','BTTS','First-goal team','First scorer','Shared rank'].map((label, i, arr) => (
                    <React.Fragment key={label}>
                      <span className={i === 0 ? 'font-semibold text-textp' : i === arr.length - 1 ? 'text-faint' : ''}>{label}</span>
                      {i < arr.length - 1 && <span className="text-faint mx-1">·</span>}
                    </React.Fragment>
                  ))}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ── Podium slot ─────────────────────────────── */
function PodiumSlot({ player, place, isMoney, tab }: { player: LBRow; place: 1 | 2 | 3; isMoney: boolean; tab: string }) {
  const prizes = tab === 'all' ? OVERALL_PRIZES : GW_PRIZES
  const prizeAmt = prizes[Math.min(place - 1, 6)]
  const prizeLabel = formatPrize(prizeAmt)
  const tone = prizeTone(prizeAmt)
  const prizeColor = tone === 'green' ? 'rgb(var(--success))' : tone === 'red' ? 'rgb(var(--error))' : 'rgb(var(--texts))'

  const avatarSize = place === 1 ? 70 : place === 2 ? 58 : 54
  const podiumH = place === 1 ? 132 : place === 2 ? 96 : 72
  const numSize = place === 1 ? 38 : place === 2 ? 30 : 26
  const ptsSize = place === 1 ? 26 : place === 2 ? 22 : 18

  const borderColor =
    place === 1 ? 'rgb(var(--gold))' :
    place === 2 ? 'rgb(var(--texts))' :
    'rgb(var(--bronze))'

  const podiumBg =
    place === 1
      ? 'linear-gradient(180deg, rgb(var(--gold) / 0.32), rgb(var(--gold) / 0.10))'
      : place === 2
      ? 'linear-gradient(180deg, rgb(var(--surface3)), rgb(var(--surface2)))'
      : 'linear-gradient(180deg, rgb(var(--bronze) / 0.30), rgb(var(--bronze) / 0.10))'

  const podiumBorder =
    place === 1 ? '1px solid rgb(var(--gold) / 0.4)' :
    place === 2 ? '1px solid rgb(var(--border))' :
    '1px solid rgb(var(--bronze) / 0.4)'

  const numColor =
    place === 1 ? 'rgb(var(--gold))' :
    place === 2 ? 'rgb(var(--texts))' :
    'rgb(var(--bronze))'

  const avatarBorder =
    place === 1 ? `3px solid rgb(var(--gold))` :
    place === 2 ? `2.5px solid rgb(var(--texts))` :
    `2.5px solid rgb(var(--bronze))`

  const avatarShadow =
    place === 1 ? '0 0 0 4px rgb(var(--gold) / 0.16)' : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px' }}>
      {/* Crown for 1st */}
      {place === 1 && (
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ color: 'rgb(var(--gold))', width: 24, height: 24, marginBottom: 4 }}>
          <path d="M2 20h20l-3-9-4.5 4.5L12 8l-2.5 7.5L5 11Z" />
        </svg>
      )}

      {/* Avatar */}
      <div style={{
        borderRadius: '50%',
        border: avatarBorder,
        boxShadow: avatarShadow,
        display: 'inline-flex',
        overflow: 'hidden',
        flexShrink: 0,
        lineHeight: 0,
      }}>
        <Avatar name={player.name} src={player.avatar} size={avatarSize} />
      </div>

      {/* Name */}
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, textAlign: 'center', color: 'rgb(var(--textp))', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </div>

      {/* Points */}
      <div style={{
        fontSize: ptsSize,
        fontWeight: 800,
        color: borderColor,
        fontFamily: 'Schibsted Grotesk, sans-serif',
        marginTop: 2,
      }}>
        {player.pts}
      </div>

      {/* YOU pill */}
      {player.you && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 999,
          background: 'rgba(var(--primary),0.12)',
          color: 'rgb(var(--primary))',
          border: '1px solid rgba(var(--primary),0.2)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginTop: 3,
        }}>
          YOU
        </span>
      )}

      {/* Podium block */}
      <div style={{
        width: '100%',
        height: podiumH,
        marginTop: 10,
        borderRadius: '13px 13px 0 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: podiumBorder,
        borderBottom: 'none',
        background: podiumBg,
        gap: 4,
      }}>
        <span style={{ fontSize: numSize, fontWeight: 800, color: numColor, fontFamily: 'Schibsted Grotesk, sans-serif' }}>
          {place}
        </span>
        {isMoney && (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: prizeColor }}>{prizeLabel}</span>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgb(var(--texts))' }}>prize</span>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Stat highlights (4 cards) ─────────────────── */
function StatHighlights({ board, rows, weights }: { board: LBRow[]; rows: PredRow[]; weights: ScoringWeights }) {
  // 1. Most exact scores
  const topExact = [...board].sort((a, b) => (b.exact ?? 0) - (a.exact ?? 0))[0]

  // 2. Top scorer picks — most pts_first_scorer > 0 among all preds
  const scorerHits = new Map<string, number>()
  for (const r of rows) {
    if ((r.pts_first_scorer ?? 0) > 0) {
      scorerHits.set(r.user_id, (scorerHits.get(r.user_id) ?? 0) + 1)
    }
  }
  let topScorerPicks: LBRow | null = null
  let topScorerCount = 0
  for (const p of board) {
    const count = scorerHits.get(p.id) ?? 0
    if (count > topScorerCount) { topScorerCount = count; topScorerPicks = p }
  }

  // 3. Biggest climber
  const climbers = board.filter((r) => r.move != null && r.move > 0)
  const topClimber = climbers.length > 0 ? climbers.sort((a, b) => (b.move ?? 0) - (a.move ?? 0))[0] : null

  // 4. Best gameweek — highest single-GW points for any user
  const gwTotals = new Map<string, number>()
  for (const r of rows) {
    const gw = r.matches?.gw_number
    if (gw == null) continue
    const key = `${r.user_id}|${gw}`
    gwTotals.set(key, (gwTotals.get(key) ?? 0) + weightedMatchPoints(r, weights))
  }
  let bestGwUser: LBRow | null = null
  let bestGwPts = 0
  gwTotals.forEach((pts, key) => {
    if (pts > bestGwPts) {
      bestGwPts = pts
      const uid = key.split('|')[0]
      bestGwUser = board.find((p) => p.id === uid) ?? null
    }
  })

  const cards = [
    topExact && (topExact.exact ?? 0) > 0 ? {
      icon: <BoltIcon size={16} />,
      iconBg: 'rgba(var(--blue),0.12)',
      iconColor: 'rgb(var(--blue))',
      label: 'Most exact',
      player: topExact,
      value: String(topExact.exact ?? 0),
    } : null,
    topScorerPicks && topScorerCount > 0 ? {
      icon: <TrophyIcon size={16} />,
      iconBg: 'rgba(var(--primary),0.12)',
      iconColor: 'rgb(var(--primary))',
      label: 'Scorer picks',
      player: topScorerPicks,
      value: String(topScorerCount),
    } : null,
    topClimber ? {
      icon: <span style={{ fontSize: 14, fontWeight: 800 }}>▲</span>,
      iconBg: 'rgba(var(--success),0.12)',
      iconColor: 'rgb(var(--success))',
      label: 'Biggest climber',
      player: topClimber,
      value: `+${topClimber.move}`,
    } : null,
    bestGwUser && bestGwPts > 0 ? {
      icon: <BoltIcon size={16} />,
      iconBg: 'rgba(var(--gold),0.14)',
      iconColor: 'rgb(var(--gold))',
      label: 'Best gameweek',
      player: bestGwUser,
      value: String(bestGwPts),
    } : null,
  ].filter(Boolean) as {
    icon: React.ReactNode
    iconBg: string
    iconColor: string
    label: string
    player: LBRow
    value: string
  }[]

  if (cards.length === 0) return null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: 'rgb(var(--card))',
            border: '1px solid rgb(var(--border))',
            borderRadius: 16,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: card.iconBg,
            color: card.iconColor,
          }}>
            {card.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--faint))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {card.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Avatar name={card.player.name} src={card.player.avatar} size={30} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {card.player.name}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'rgb(var(--textp))', flexShrink: 0 }}>
                {card.value}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ──────────────────────────────────────────────
   Picks view — one card per match, one row per member
   ────────────────────────────────────────────── */
function PicksView({
  matches, preds, members, userId, loading, weights,
}: {
  matches: PickMatch[]
  preds: PickPred[]
  members: ProfileLite[]
  userId: string | null
  loading: boolean
  weights: ScoringWeights
}) {
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')

  const predMap = useMemo(() => {
    const m = new Map<string, PickPred>() // key: `matchId|userId`
    for (const p of preds) m.set(`${p.match_id}|${p.user_id}`, p)
    return m
  }, [preds])

  const displayed = useMemo(() => {
    if (filter === 'upcoming') return matches.filter((m) => !m.real_home_score && !m.real_away_score && !m.is_locked)
    return matches
  }, [matches, filter])

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
  }

  if (displayed.length === 0) {
    return <EmptyState icon={<TrophyIcon size={22} />} title="No upcoming matches" desc="Picks will appear here for matches not yet kicked off." />
  }

  return (
    <div className="space-y-3">
      <ChipRow
        chips={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'all', label: 'All' }]}
        value={filter}
        onChange={(v) => setFilter(v as 'upcoming' | 'all')}
      />

      {displayed.map((m) => {
        const home = getTeam(m.home_team)
        const away = getTeam(m.away_team)
        const isScored = m.real_home_score !== null && m.real_away_score !== null
        const stageLabel = m.group_name ? `Group ${m.group_name}` : 'Knockout'

        return (
          <Card key={m.id} className="p-4">
            {/* Match header */}
            <div className="flex items-center gap-3 mb-3">
              <Pill tone={m.group_name ? 'default' : 'gold'}>{stageLabel}</Pill>
              <span className="text-[11px] text-texts font-medium">
                {fmtDateTime(m.match_date)}
              </span>
              {isScored ? (
                <Pill tone="green" className="ml-auto">{m.real_home_score}–{m.real_away_score} FT</Pill>
              ) : m.is_locked ? (
                <Pill tone="default" className="ml-auto">Locked</Pill>
              ) : null}
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between mb-3">
              <TeamLink code={home.code} className="flex items-center gap-2 group">
                <FlagChip code={home.code} w={24} h={16} r={3} />
                <span className="font-bold text-textp">{home.name}</span>
              </TeamLink>
              <span className="text-texts font-bold text-sm px-2">vs</span>
              <TeamLink code={away.code} className="flex items-center gap-2 flex-row-reverse group">
                <FlagChip code={away.code} w={24} h={16} r={3} />
                <span className="font-bold text-textp text-right">{away.name}</span>
              </TeamLink>
            </div>

            {/* Member picks — always visible when reveal_predictions is on */}
            <div className="divide-y divide-border/40">
              {members.map((member) => {
                const pick = predMap.get(`${m.id}|${member.id}`)
                const isMe = member.id === userId
                const scored = pick?.points_awarded != null
                return (
                  <div key={member.id} className={`flex items-center gap-3 py-2 ${isMe ? 'bg-blue/[0.04] -mx-4 px-4' : ''}`}>
                    <Avatar name={member.username ?? '?'} src={member.avatar_url} size={26} you={isMe} />
                    <span className={`flex-1 text-[13px] font-semibold truncate ${isMe ? 'text-primary' : 'text-textp'}`}>
                      {member.username ?? '?'}{isMe ? ' (you)' : ''}
                    </span>
                    {pick?.pred_home != null && pick?.pred_away != null ? (
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold tabular-nums text-sm text-textp">
                          {pick.pred_home}–{pick.pred_away}
                        </span>
                        {scored && (() => {
                          const wPts = weightedMatchPoints(pick, weights)
                          return (
                            <span className={`text-[11px] font-bold tabular-nums ${wPts >= 8 ? 'text-primary' : wPts > 0 ? 'text-gold' : 'text-error'}`}>
                              +{wPts}pts
                            </span>
                          )
                        })()}
                      </div>
                    ) : (
                      <span className="text-[11px] text-texts font-medium italic">no pick</span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
