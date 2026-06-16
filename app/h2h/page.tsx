'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Skeleton, EmptyState, Avatar, Select } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
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
  gw_number: number | null
}

const COLS = 'user_id, match_id, pred_home, pred_away, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'

const eyebrow: React.CSSProperties = {
  fontSize: '10.5px',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  fontWeight: 600,
}

function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

/** Catmull-Rom spline → cubic bezier path */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
}

export default function H2HPage() {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<ProfileLite[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [currentUserId, setCurrentUserId] = useState('')
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [raceView, setRaceView] = useState<'season' | 'gameweek' | 'specific'>('season')
  const [selectedGw, setSelectedGw] = useState('1')
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
        setCurrentUserId(user.id)
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
            .select('id, match_date, home_team, away_team, real_home_score, real_away_score, gw_number')
            .in('id', matchIds)
          const map = new Map<string, MatchRow>()
          for (const m of (md ?? []) as unknown as MatchRow[]) map.set(m.id, m)
          setMatchMap(map)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId])

  const { stats, catStats, commonMatches, formA, formB, gwSeriesA, gwSeriesB, gwTotalsA, gwTotalsB, gwMatchSeriesA, gwMatchSeriesB, availableGws } = useMemo(() => {
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

    // Category defs matching design spec order
    const allCatDefs = [
      { label: 'Outcome', ptsKey: 'pts_outcome' as keyof PredRow, weightKey: 'outcome' as keyof ScoringWeights },
      { label: 'Both score', ptsKey: 'pts_btts' as keyof PredRow, weightKey: 'btts' as keyof ScoringWeights },
      { label: 'Total goals', ptsKey: 'pts_total_goals' as keyof PredRow, weightKey: 'totalGoals' as keyof ScoringWeights },
      { label: 'First goal', ptsKey: 'pts_first_team' as keyof PredRow, weightKey: 'firstTeam' as keyof ScoringWeights },
      { label: 'Goal diff', ptsKey: 'pts_goal_diff' as keyof PredRow, weightKey: 'goalDiff' as keyof ScoringWeights },
      { label: 'Exact', ptsKey: 'pts_exact' as keyof PredRow, weightKey: 'exact' as keyof ScoringWeights },
    ]
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

    // Compute per-GW cumulative sums for chart
    const buildGWSeries = (ps: PredRow[]) => {
      const byGW = new Map<number, number>()
      for (const p of ps) {
        const gw = matchMap.get(p.match_id)?.gw_number
        if (gw == null) continue
        byGW.set(gw, (byGW.get(gw) ?? 0) + weightedMatchPoints(p, weights))
      }
      const gws = Array.from(byGW.keys()).sort((a, b) => a - b)
      let cum = 0
      return gws.map((gw) => { cum += byGW.get(gw) ?? 0; return { gw, cum } })
    }
    const buildGWTotals = (ps: PredRow[]) => {
      const byGW = new Map<number, number>()
      for (const p of ps) {
        const gw = matchMap.get(p.match_id)?.gw_number
        if (gw == null) continue
        byGW.set(gw, (byGW.get(gw) ?? 0) + weightedMatchPoints(p, weights))
      }
      return Array.from(byGW.entries()).sort((a, b) => a[0] - b[0]).map(([gw, pts]) => ({ gw, pts }))
    }
    const buildGWMatchSeries = (ps: PredRow[]) => {
      const byGW = new Map<number, { matchId: string; label: string; pts: number; matchDate: string }[]>()
      for (const p of ps) {
        const match = matchMap.get(p.match_id)
        const gw = match?.gw_number
        if (gw == null || !match) continue
        const home = getTeam(match.home_team).code
        const away = getTeam(match.away_team).code
        const row = {
          matchId: p.match_id,
          label: `${home}-${away}`,
          pts: weightedMatchPoints(p, weights),
          matchDate: match.match_date,
        }
        const list = byGW.get(gw) ?? []
        list.push(row)
        byGW.set(gw, list)
      }
      const out = new Map<number, { idx: number; label: string; cum: number }[]>()
      byGW.forEach((items, gw) => {
        const unique = new Map<string, { label: string; pts: number; matchDate: string }>()
        for (const item of items) unique.set(item.matchId, item)
        const sorted = Array.from(unique.values()).sort((a, b) => a.matchDate.localeCompare(b.matchDate))
        let cum = 0
        out.set(gw, sorted.map((item, idx) => {
          cum += item.pts
          return { idx: idx + 1, label: item.label, cum }
        }))
      })
      return out
    }
    const gwSeriesA = buildGWSeries(psA)
    const gwSeriesB = buildGWSeries(psB)
    const gwTotalsA = buildGWTotals(psA)
    const gwTotalsB = buildGWTotals(psB)
    const gwMatchSeriesA = buildGWMatchSeries(psA)
    const gwMatchSeriesB = buildGWMatchSeries(psB)
    const availableGws = Array.from(new Set([
      ...gwSeriesA.map((g) => g.gw),
      ...gwSeriesB.map((g) => g.gw),
      ...gwTotalsA.map((g) => g.gw),
      ...gwTotalsB.map((g) => g.gw),
    ])).sort((a, b) => a - b)

    return {
      stats: { a: calc(aId), b: calc(bId), winA, winB, tie, common },
      catStats,
      commonMatches: commonMatches.slice(0, 15),
      formA: sortByDate(psA).slice(0, 5),
      formB: sortByDate(psB).slice(0, 5),
      gwSeriesA,
      gwSeriesB,
      gwTotalsA,
      gwTotalsB,
      gwMatchSeriesA,
      gwMatchSeriesB,
      availableGws,
    }
  }, [rows, aId, bId, weights, matchMap])

  const a = members.find((m) => m.id === aId)
  const b = members.find((m) => m.id === bId)

  useEffect(() => {
    if (availableGws.length === 0) return
    if (!availableGws.includes(parseInt(selectedGw))) setSelectedGw(String(availableGws[0]))
  }, [availableGws, selectedGw])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* page header */}
      <div>
        <p style={{ ...eyebrow, color: 'rgb(var(--primary))', marginBottom: 4 }}>Compare</p>
        <h1 style={{ fontSize: 21, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: 'rgb(var(--textp))' }}>
          Head to head
        </h1>
      </div>
      <EmptyState icon={<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>} title="Couldn't load data" desc={error} />
    </div>
  )

  // Record bar totals
  const total = stats.winA + stats.tie + stats.winB || 1
  const winAPct = (stats.winA / total) * 100
  const tiePct = (stats.tie / total) * 100
  const winBPct = (stats.winB / total) * 100

  // SVG chart
  const W = 600, H = 200, padL = 6, padR = 6, padT = 12, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const numericSelectedGw = parseInt(selectedGw)
  const seasonDomain = Array.from(new Set([...gwSeriesA.map((g) => g.gw), ...gwSeriesB.map((g) => g.gw)])).sort((a, b) => a - b)
  const gameweekDomain = Array.from(new Set([...gwTotalsA.map((g) => g.gw), ...gwTotalsB.map((g) => g.gw)])).sort((a, b) => a - b)
  const specificSeriesA = gwMatchSeriesA.get(numericSelectedGw) ?? []
  const specificSeriesB = gwMatchSeriesB.get(numericSelectedGw) ?? []
  const specificDomain = Array.from(new Set([...specificSeriesA.map((g) => g.idx), ...specificSeriesB.map((g) => g.idx)])).sort((a, b) => a - b)

  const chartMode = raceView
  const xDomain = chartMode === 'season' ? seasonDomain : chartMode === 'gameweek' ? gameweekDomain : specificDomain
  const maxY = chartMode === 'season'
    ? Math.max(...gwSeriesA.map((g) => g.cum), ...gwSeriesB.map((g) => g.cum), 1)
    : chartMode === 'gameweek'
    ? Math.max(...gwTotalsA.map((g) => g.pts), ...gwTotalsB.map((g) => g.pts), 1)
    : Math.max(...specificSeriesA.map((g) => g.cum), ...specificSeriesB.map((g) => g.cum), 1)

  function seriesPoints<T extends { xKey: number; yVal: number }>(series: T[]) {
    if (series.length === 0) return []
    const valueMap = new Map(series.map((s) => [s.xKey, s.yVal]))
    return xDomain
      .filter((xKey) => valueMap.has(xKey))
      .map((xKey, i, arr) => ({
        x: padL + (i / Math.max(arr.length - 1, 1)) * chartW,
        y: padT + chartH - (valueMap.get(xKey)! / maxY) * chartH,
        key: xKey,
      }))
  }

  const ptsA_pts = chartMode === 'season'
    ? seriesPoints(gwSeriesA.map((g) => ({ xKey: g.gw, yVal: g.cum })))
    : chartMode === 'gameweek'
    ? seriesPoints(gwTotalsA.map((g) => ({ xKey: g.gw, yVal: g.pts })))
    : seriesPoints(specificSeriesA.map((g) => ({ xKey: g.idx, yVal: g.cum })))
  const ptsB_pts = chartMode === 'season'
    ? seriesPoints(gwSeriesB.map((g) => ({ xKey: g.gw, yVal: g.cum })))
    : chartMode === 'gameweek'
    ? seriesPoints(gwTotalsB.map((g) => ({ xKey: g.gw, yVal: g.pts })))
    : seriesPoints(specificSeriesB.map((g) => ({ xKey: g.idx, yVal: g.cum })))

  const pathA = smoothPath(ptsA_pts)
  const pathB = smoothPath(ptsB_pts)

  const xLabels = xDomain.map((value, i, arr) => ({
    value,
    x: padL + (i / Math.max(arr.length - 1, 1)) * chartW,
  }))

  function ptsColor(pts: number): string {
    if (pts >= 8) return 'rgb(var(--success))'
    if (pts > 0) return 'rgb(var(--gold))'
    return 'rgb(var(--coral))'
  }

  function matchPtsColor(pts: number): string {
    if (pts >= 8) return 'rgb(var(--success))'
    if (pts > 0) return 'rgb(var(--gold))'
    return 'rgb(var(--faint))'
  }

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div>
        <p style={{ ...eyebrow, color: 'rgb(var(--primary))', marginBottom: 4 }}>Compare</p>
        <h1 style={{ fontSize: 21, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: 'rgb(var(--textp))' }}>
          Head to head
        </h1>
      </div>

      {members.length < 2 ? (
        <EmptyState
          icon={<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          title="Not enough players"
          desc="You need at least two members in this league to compare."
        />
      ) : (
        <>
          {/* Player selectors */}
          <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select id="player-a" label="Player A" value={aId} onChange={setAId}>
                <option value="">Select…</option>
                {members.filter((m) => m.id !== bId).map((m) => <option key={m.id} value={m.id}>{m.username ?? '?'}</option>)}
              </Select>
              <Select id="player-b" label="Player B" value={bId} onChange={setBId}>
                <option value="">Select…</option>
                {members.filter((m) => m.id !== aId).map((m) => <option key={m.id} value={m.id}>{m.username ?? '?'}</option>)}
              </Select>
            </div>
          </div>

          {a && b && aId !== bId && (
            <>
              {/* Versus header card */}
              <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  {/* Left: YOU */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    {a.avatar_url ? (
                      <Avatar name={a.username ?? '?'} src={a.avatar_url} size={60} />
                    ) : (
                      <div style={{
                        width: 60, height: 60, borderRadius: 18,
                        background: 'linear-gradient(145deg,rgb(var(--heroFrom)),rgb(var(--heroTo)))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, fontWeight: 800, color: 'rgb(var(--primary))',
                      }}>
                        {initials(a.username)}
                      </div>
                    )}
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--textp))' }}>{a.username}</span>
                      {aId === currentUserId && (
                        <span style={{
                          fontSize: '8.5px', fontWeight: 700, color: 'rgb(var(--primary))',
                          background: 'rgba(var(--primary),0.16)', padding: '2px 6px',
                          borderRadius: 999, verticalAlign: 'middle',
                        }}>YOU</span>
                      )}
                    </div>
                    <p style={{ fontSize: 30, fontWeight: 800, color: 'rgb(var(--primary))', lineHeight: 1.1, fontFamily: 'Schibsted Grotesk, sans-serif', marginTop: 4 }}>
                      {stats.a.pts}
                    </p>
                    <p style={{ ...eyebrow, color: 'rgb(var(--faint))', marginTop: 2 }}>points</p>
                  </div>

                  {/* Center: record */}
                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <p style={{ ...eyebrow, color: 'rgb(var(--faint))', marginBottom: 8 }}>Head-to-head</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: 'rgb(var(--primary))', fontFamily: 'Schibsted Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{stats.winA}</span>
                      <span style={{ fontSize: 13, color: 'rgb(var(--faint))' }}>–</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'rgb(var(--texts))', fontFamily: 'Schibsted Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{stats.tie}</span>
                      <span style={{ fontSize: 13, color: 'rgb(var(--faint))' }}>–</span>
                      <span style={{ fontSize: 26, fontWeight: 800, color: 'rgb(var(--blue))', fontFamily: 'Schibsted Grotesk, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{stats.winB}</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'rgb(var(--faint))', marginTop: 4 }}>{stats.common} common matches</p>
                  </div>

                  {/* Right: opponent */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    {b.avatar_url ? (
                      <Avatar name={b.username ?? '?'} src={b.avatar_url} size={60} />
                    ) : (
                      <div style={{
                        width: 60, height: 60, borderRadius: 18,
                        background: 'rgba(var(--blue),0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, fontWeight: 800, color: 'rgb(var(--blue))',
                      }}>
                        {initials(b.username)}
                      </div>
                    )}
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--textp))', marginTop: 10 }}>{b.username}</p>
                    <p style={{ fontSize: 30, fontWeight: 800, color: 'rgb(var(--blue))', lineHeight: 1.1, fontFamily: 'Schibsted Grotesk, sans-serif', marginTop: 4 }}>
                      {stats.b.pts}
                    </p>
                    <p style={{ ...eyebrow, color: 'rgb(var(--faint))', marginTop: 2 }}>points</p>
                  </div>
                </div>

                {/* Record bar */}
                <div style={{ display: 'flex', gap: 2, height: 9, borderRadius: 999, overflow: 'hidden' }}>
                  {stats.winA > 0 && (
                    <div style={{ width: `${winAPct}%`, background: 'rgb(var(--primary))', borderRadius: 999 }} />
                  )}
                  {stats.tie > 0 && (
                    <div style={{ width: `${tiePct}%`, background: 'rgb(var(--surface3))', borderRadius: 999 }} />
                  )}
                  {stats.winB > 0 && (
                    <div style={{ width: `${winBPct}%`, background: 'rgb(var(--blue))', borderRadius: 999 }} />
                  )}
                  {stats.common === 0 && (
                    <div style={{ flex: 1, background: 'rgb(var(--surface3))', borderRadius: 999 }} />
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--primary))' }}>{stats.winA} won</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--texts))' }}>{stats.tie} tied</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--blue))' }}>{stats.winB} won</span>
                </div>
              </div>

              {/* Season points race chart */}
              {(gwSeriesA.length > 0 || gwSeriesB.length > 0) && (
                <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: 'rgb(var(--textp))' }}>
                        Season points race
                      </p>
                      <p style={{ fontSize: 11, color: 'rgb(var(--texts))', marginTop: 2 }}>
                        {raceView === 'season'
                          ? 'Cumulative points, gameweek by gameweek'
                          : raceView === 'gameweek'
                          ? 'Each player’s points haul in every gameweek'
                          : `Inside GW${selectedGw}, match by match`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))' }}>
                        {(['season', 'gameweek', 'specific'] as const).map((mode) => {
                          const active = raceView === mode
                          const label = mode === 'season' ? 'Season' : mode === 'gameweek' ? 'By GW' : 'Specific GW'
                          return (
                            <button
                              key={mode}
                              onClick={() => setRaceView(mode)}
                              style={{
                                height: 30,
                                padding: '0 12px',
                                borderRadius: 999,
                                border: 'none',
                                cursor: 'pointer',
                                background: active ? 'rgb(var(--textp))' : 'transparent',
                                color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                                fontSize: 11.5,
                                fontWeight: 700,
                                transition: 'all 0.15s',
                              }}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                      {raceView === 'specific' && availableGws.length > 0 && (
                        <div style={{ minWidth: 118 }}>
                          <Select id="race-gw" label="" value={selectedGw} onChange={setSelectedGw}>
                            {availableGws.map((gw) => <option key={gw} value={String(gw)}>{`GW${gw}`}</option>)}
                          </Select>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 11, height: 3, background: 'rgb(var(--primary))', borderRadius: 2 }} />
                          <span style={{ fontSize: 11, color: 'rgb(var(--texts))' }}>You</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 11, height: 3, background: 'rgb(var(--blue))', borderRadius: 2 }} />
                          <span style={{ fontSize: 11, color: 'rgb(var(--texts))' }}>Opponent</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
                    {/* Grid lines */}
                    {[0, 0.33, 0.66, 1].map((f, i) => {
                      const y = padT + chartH * (1 - f)
                      return <line key={i} x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgb(var(--border))" strokeWidth={0.8} />
                    })}
                    {/* Path B */}
                    {pathB && (
                      <path d={pathB} fill="none" stroke="rgb(var(--blue))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {/* Path A */}
                    {pathA && (
                      <path d={pathA} fill="none" stroke="rgb(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {/* Terminal dot A */}
                    {ptsA_pts.length > 0 && (
                      <circle cx={ptsA_pts[ptsA_pts.length - 1].x} cy={ptsA_pts[ptsA_pts.length - 1].y} r={4.5} fill="rgb(var(--primary))" />
                    )}
                    {/* Terminal dot B */}
                    {ptsB_pts.length > 0 && (
                      <circle cx={ptsB_pts[ptsB_pts.length - 1].x} cy={ptsB_pts[ptsB_pts.length - 1].y} r={4.5} fill="rgb(var(--blue))" />
                    )}
                    {/* GW labels */}
                    {xLabels.map(({ value, x }) => (
                      <text key={value} x={x} y={H - 4} textAnchor="middle" fontSize={10} fill="rgb(var(--faint))">
                        {raceView === 'specific' ? value : `GW${value}`}
                      </text>
                    ))}
                  </svg>
                  {raceView === 'specific' && xDomain.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${xDomain.length}, minmax(0, 1fr))`, gap: 8, marginTop: 10 }}>
                      {xDomain.map((idx) => {
                        const label = specificSeriesA.find((g) => g.idx === idx)?.label ?? specificSeriesB.find((g) => g.idx === idx)?.label ?? `Match ${idx}`
                        return (
                          <div key={idx} style={{ fontSize: 10.5, color: 'rgb(var(--faint))', textAlign: 'center', lineHeight: 1.25 }}>
                            {label}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 2-col lower grid */}
              {stats.common > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  {/* Left: Category accuracy */}
                  {catStats.some((c) => c.totalA > 0 || c.totalB > 0) && (
                    <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: 20 }}>
                      <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: 'rgb(var(--textp))', marginBottom: 16 }}>
                        Category accuracy
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {catStats.map(({ label, pctA, pctB }) => (
                          <div key={label}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: pctA >= pctB ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>
                                {Math.round(pctA)}%
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--texts))', whiteSpace: 'nowrap' }}>{label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: pctB >= pctA ? 'rgb(var(--blue))' : 'rgb(var(--texts))' }}>
                                {Math.round(pctB)}%
                              </span>
                            </div>
                            {/* Diverging bars */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0, height: 7 }}>
                              {/* Left bar: right-aligned primary */}
                              <div style={{ overflow: 'hidden', display: 'flex', justifyContent: 'flex-end', background: 'rgb(var(--surface2))', borderRadius: '999px 0 0 999px' }}>
                                <div style={{ width: `${pctA}%`, height: '100%', background: 'rgb(var(--primary))', borderRadius: '999px 0 0 999px' }} />
                              </div>
                              {/* Divider */}
                              <div style={{ background: 'rgb(var(--border))', width: 1 }} />
                              {/* Right bar: left-aligned blue */}
                              <div style={{ overflow: 'hidden', display: 'flex', justifyContent: 'flex-start', background: 'rgb(var(--surface2))', borderRadius: '0 999px 999px 0' }}>
                                <div style={{ width: `${pctB}%`, height: '100%', background: 'rgb(var(--blue))', borderRadius: '0 999px 999px 0' }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Right col: recent form + key stats stacked */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Recent form */}
                    {(formA.length > 0 || formB.length > 0) && (
                      <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: 20 }}>
                        <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: 'rgb(var(--textp))', marginBottom: 12 }}>
                          Recent form
                        </p>
                        {/* You row */}
                        <div style={{ marginBottom: 10 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--texts))', marginBottom: 6 }}>You</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {formA.map((p, i) => {
                              const pts = weightedMatchPoints(p, weights)
                              return (
                                <div key={i} style={{
                                  width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: ptsColor(pts), fontSize: 11, fontWeight: 700,
                                  fontFamily: 'Schibsted Grotesk, sans-serif', color: '#fff',
                                }}>
                                  {pts}
                                </div>
                              )
                            })}
                            {Array.from({ length: 5 - formA.length }).map((_, i) => (
                              <div key={`ea-${i}`} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgb(var(--surface2))', border: '1px solid rgba(var(--border),0.5)' }} />
                            ))}
                          </div>
                        </div>
                        {/* Opponent row */}
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--texts))', marginBottom: 6 }}>{b.username}</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {formB.map((p, i) => {
                              const pts = weightedMatchPoints(p, weights)
                              return (
                                <div key={i} style={{
                                  width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: ptsColor(pts), fontSize: 11, fontWeight: 700,
                                  fontFamily: 'Schibsted Grotesk, sans-serif', color: '#fff',
                                }}>
                                  {pts}
                                </div>
                              )
                            })}
                            {Array.from({ length: 5 - formB.length }).map((_, i) => (
                              <div key={`eb-${i}`} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgb(var(--surface2))', border: '1px solid rgba(var(--border),0.5)' }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key stats */}
                    <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: 20 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {([
                          ['Accuracy', `${stats.a.acc}%`, `${stats.b.acc}%`, stats.a.acc, stats.b.acc],
                          ['Exact scores', stats.a.exact, stats.b.exact, stats.a.exact, stats.b.exact],
                          ['Scored', stats.a.scored, stats.b.scored, stats.a.scored, stats.b.scored],
                        ] as [string, string | number, string | number, number, number][]).map(([label, av, bv, an, bn]) => (
                          <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
                            <span style={{ textAlign: 'right', fontSize: 15, fontWeight: 800, fontFamily: 'Schibsted Grotesk, sans-serif', color: an >= bn ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>{av}</span>
                            <span style={{ ...eyebrow, color: 'rgb(var(--faint))', whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</span>
                            <span style={{ textAlign: 'left', fontSize: 15, fontWeight: 800, fontFamily: 'Schibsted Grotesk, sans-serif', color: bn >= an ? 'rgb(var(--blue))' : 'rgb(var(--texts))' }}>{bv}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state: no common matches */}
              {stats.common === 0 && (
                <EmptyState
                  icon={<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
                  title="No shared scored matches yet"
                  desc="Once both players have scored predictions for the same fixture, their comparison will appear here."
                />
              )}

              {/* Match by match */}
              {commonMatches.length > 0 && (
                <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgb(var(--border))' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', color: 'rgb(var(--textp))' }}>Match by match</p>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'rgb(var(--texts))' }}>
                      {commonMatches.length} of {stats.common}
                    </span>
                  </div>
                  {/* Rows */}
                  {commonMatches.map(({ match_id, match, pa, pb, ptsA, ptsB }) => {
                    const home = match ? getTeam(match.home_team) : null
                    const away = match ? getTeam(match.away_team) : null
                    return (
                      <div key={match_id} style={{
                        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center', padding: '12px 22px',
                        borderTop: '1px solid rgba(var(--border),0.55)',
                      }}>
                        {/* Left: your pts + pick */}
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'Schibsted Grotesk, sans-serif', color: matchPtsColor(ptsA) }}>{ptsA}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgb(var(--primary))', marginLeft: 7 }}>
                            {pa.pred_home ?? '?'}-{pa.pred_away ?? '?'}
                          </span>
                        </div>

                        {/* Center: flags + score */}
                        <div style={{ minWidth: 120, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {home && <FlagChip code={home.code} w={26} h={18} r={4} />}
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))' }}>
                            {match?.real_home_score != null ? `${match.real_home_score}–${match.real_away_score}` : 'vs'}
                          </span>
                          {away && <FlagChip code={away.code} w={26} h={18} r={4} />}
                        </div>

                        {/* Right: their pick + pts */}
                        <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgb(var(--blue))', marginRight: 7 }}>
                            {pb.pred_home ?? '?'}-{pb.pred_away ?? '?'}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'Schibsted Grotesk, sans-serif', color: matchPtsColor(ptsB) }}>{ptsB}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
