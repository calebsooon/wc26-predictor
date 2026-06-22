'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import {
  Button, Avatar, Skeleton, EmptyState, TrophyIcon, LockIcon, Modal,
} from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { TeamLink } from '@/components/TeamLink'
import { BarChart, DonutChart, RankLine } from '@/components/charts'
import { getTeam } from '@/lib/teams'
import { weightedMatchPoints, weightedGroupPoints, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { subscribeToPush, unsubscribeFromPush, getPushState } from '@/lib/push'
import { useColorblind, setColorblind, useColorblindScope, setColorblindScope, type ColorblindScope } from '@/lib/prefs'
import { getActiveLeague, isMoneyLeague } from '@/lib/league'
import { computePrizeSnapshot, formatPrize, prizeTone, GW_SHORT } from '@/lib/prizes'

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface Profile { id: string; username: string; avatar_url: string | null; is_admin: boolean }
interface TournamentPred {
  champion: string | null
  runner_up: string | null
  semi: string[]
  quarter: string[]
  pts_champion: number | null
  pts_runner_up: number | null
  pts_semi: number | null
  pts_quarter: number | null
}
interface GroupPred {
  group_name: string
  ranked_codes: string[]
  points_awarded: number | null
}
interface ScoredPred {
  match_id: string
  points_awarded: number
  pred_home: number | null
  pred_away: number | null
  pts_outcome: number | null; pts_exact: number | null; pts_goal_diff: number | null
  pts_total_goals: number | null; pts_team_goals: number | null; pts_btts: number | null
  pts_first_team: number | null; pts_first_scorer: number | null
  matches?: {
    id: string; match_date: string; home_team: string; away_team: string
    real_home_score: number | null; real_away_score: number | null
    group_name: string | null; gw_number: number | null
  } | null
}

/* ─── Badge icon SVGs ───────────────────────────────────────────────────────── */
const BADGE_ICONS: Record<string, React.ReactNode> = {
  sniper: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="3" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/></svg>,
  boot: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 18h6M10 18v-3M14 18v-3M8 21h8"/></svg>,
  genius: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>,
  merchant: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>,
  prophet: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>,
  fraud: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.364 5.636 5.636 18.364M5.636 5.636l12.728 12.728"/></svg>,
}

/* ─── Pencil icon ───────────────────────────────────────────────────────────── */
function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

/* ─── Eyebrow style helper ──────────────────────────────────────────────────── */
const eyebrow: React.CSSProperties = {
  fontSize: '10.5px',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  fontWeight: 600,
  color: 'rgb(var(--texts))',
}

const eyebrowPrimary: React.CSSProperties = {
  ...eyebrow,
  color: 'rgb(var(--primary))',
}

/* ─── Category list ─────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { key: 'pts_outcome' as const, label: 'Outcome' },
  { key: 'pts_btts' as const, label: 'BTTS' },
  { key: 'pts_total_goals' as const, label: 'Total goals' },
  { key: 'pts_first_team' as const, label: 'First goal' },
  { key: 'pts_goal_diff' as const, label: 'Goal diff' },
  { key: 'pts_exact' as const, label: 'Exact score' },
]

/* ─── PushToggle ─────────────────────────────────────────────────────────────── */
function PushToggle({ userId }: { userId: string }) {
  const [state, setState] = useState<'unsupported' | 'denied' | 'granted' | 'default' | 'loading'>('loading')

  useEffect(() => {
    getPushState().then(setState)
  }, [])

  async function enable() {
    setState('loading')
    const ok = await subscribeToPush(userId)
    setState(ok ? 'granted' : await getPushState())
  }

  async function disable() {
    setState('loading')
    await unsubscribeFromPush(userId)
    setState('default')
  }

  if (state === 'loading') return null
  if (state === 'unsupported') return null

  return (
    <div style={{ borderTop: '1px solid rgb(var(--border))', paddingTop: 16 }}>
      <p style={{ ...eyebrow, marginBottom: 6 }}>Push notifications</p>
      {state === 'denied' ? (
        <p style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Blocked in browser settings — enable in site permissions to receive match alerts.</p>
      ) : state === 'granted' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Match results will be sent to this device.</p>
          <Button size="sm" variant="outline" onClick={disable}>Turn off</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Get notified when results are scored.</p>
          <Button size="sm" onClick={enable}>Enable</Button>
        </div>
      )}
    </div>
  )
}

/* ─── ColorblindToggle ────────────────────────────────────────────────────────── */
const CB_SCOPES: { key: ColorblindScope; label: string; desc: string }[] = [
  { key: 'graph', label: 'Leaderboard graph only', desc: 'Only the rank-race chart uses the colour-blind-safe palette.' },
  { key: 'all', label: 'Across the whole app', desc: 'Also remaps the green / amber / red points colours everywhere.' },
]

function ColorblindToggle({ userId }: { userId: string }) {
  const on = useColorblind()
  const scope = useColorblindScope()
  const supabase = createClient()

  function toggle() {
    const next = !on
    setColorblind(next) // local cache + live update
    supabase.from('profiles').update({ colorblind: next }).eq('id', userId).then(() => {}) // cross-device source of truth
  }
  function chooseScope(next: ColorblindScope) {
    if (next === scope) return
    setColorblindScope(next)
    supabase.from('profiles').update({ colorblind_scope: next }).eq('id', userId).then(() => {})
  }

  return (
    <div style={{ borderTop: '1px solid rgb(var(--border))', paddingTop: 16 }}>
      <p style={{ ...eyebrow, marginBottom: 6 }}>Colour-blind mode</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Use a high-contrast, colour-blind-safe palette so results stay easy to tell apart.</p>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Toggle colour-blind mode"
          onClick={toggle}
          style={{
            flexShrink: 0, width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: on ? 'rgb(var(--primary))' : 'rgb(var(--surface2))',
            position: 'relative', transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 999,
            background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }} />
        </button>
      </div>

      {on && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgb(var(--texts))', marginBottom: 8 }}>Apply to</p>
          <div role="radiogroup" aria-label="Colour-blind mode scope" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CB_SCOPES.map((s) => {
              const active = scope === s.key
              return (
                <button
                  key={s.key}
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseScope(s.key)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', cursor: 'pointer',
                    padding: '10px 12px', borderRadius: 12,
                    border: `1px solid ${active ? 'rgb(var(--primary))' : 'rgb(var(--border))'}`,
                    background: active ? 'rgba(var(--primary),0.08)' : 'rgb(var(--surface2))',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{
                    flexShrink: 0, marginTop: 2, width: 16, height: 16, borderRadius: 999,
                    border: `2px solid ${active ? 'rgb(var(--primary))' : 'rgb(var(--texts))'}`,
                    display: 'grid', placeItems: 'center',
                  }}>
                    {active && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'rgb(var(--primary))' }} />}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))' }}>{s.label}</span>
                    <span style={{ fontSize: 11.5, color: 'rgb(var(--texts))', lineHeight: 1.4 }}>{s.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── CropModal ─────────────────────────────────────────────────────────────── */
const CROP_SIZE = 280

function CropModal({ src, onConfirm, onClose }: { src: string; onConfirm: (blob: Blob) => void; onClose: () => void }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    setDragging(true)
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging || !dragStart.current) return
    setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.mx, y: dragStart.current.oy + e.clientY - dragStart.current.my })
  }
  function onMouseUp() { setDragging(false) }
  function onWheel(e: React.WheelEvent) { e.preventDefault(); setScale((s) => Math.max(0.5, Math.min(4, s - e.deltaY * 0.002))) }

  function confirm() {
    const img = imgRef.current; if (!img) return
    const OUT = 400
    const canvas = document.createElement('canvas')
    canvas.width = OUT; canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    ctx.beginPath(); ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2); ctx.clip()
    const ratio = OUT / CROP_SIZE
    const base = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight)
    const dw = img.naturalWidth * base * scale, dh = img.naturalHeight * base * scale
    ctx.drawImage(img, (OUT - dw) / 2 + offset.x * ratio, (OUT - dh) / 2 + offset.y * ratio, dw, dh)
    canvas.toBlob((b) => { if (b) onConfirm(b) }, 'image/jpeg', 0.92)
  }

  return (
    <Modal open onClose={onClose} title="Crop photo" maxWidth="max-w-sm">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-texts">Drag to reposition · scroll or slider to zoom</p>
        <div
          style={{ width: CROP_SIZE, height: CROP_SIZE, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgb(var(--primary))', cursor: dragging ? 'grabbing' : 'grab', position: 'relative', userSelect: 'none', flexShrink: 0 }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={(el) => { imgRef.current = el }} src={src} alt="" draggable={false}
            style={{ position: 'absolute', top: '50%', left: '50%', maxWidth: 'none', transform: `translate(-50%,-50%) translate(${offset.x}px,${offset.y}px) scale(${scale})`, transformOrigin: 'center center', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        </div>
        <input type="range" min={0.5} max={3} step={0.01} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ width: CROP_SIZE }} />
        <div className="flex gap-3 w-full justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm}>Save photo</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */
export default function ProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editOpen, setEditOpen] = useState(false)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [preds, setPreds] = useState<ScoredPred[]>([])
  const [rank, setRank] = useState<number | null>(null)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [leagueName, setLeagueName] = useState<string | null>(null)
  const [isMoney, setIsMoney] = useState(false)
  const [tournamentPred, setTournamentPred] = useState<TournamentPred | null>(null)
  const [groupPreds, setGroupPreds] = useState<GroupPred[]>([])
  const [rankSeries, setRankSeries] = useState<number[]>([])
  const [snapshotLabels, setSnapshotLabels] = useState<string[]>([])
  const [rankChartMode, setRankChartMode] = useState<'season' | 'byGW' | 'specificGW'>('season')
  const [selectedRankGw, setSelectedRankGw] = useState<number>(1)
  const [netPool, setNetPool] = useState<number | null>(null)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [uploadPct, setUploadPct] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }

        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, is_admin')
          .eq('id', user.id)
          .single()
        if (profErr) throw profErr
        if (data) {
          const p = data as Profile
          setProfile(p)
          setUsername(p.username ?? '')
          setAvatarUrl(p.avatar_url ?? null)
        }

        const [{ data: mine, error: mineErr }, { data: tp }, { data: gp }, leagueData] = await Promise.all([
          supabase
            .from('predictions')
            .select('match_id, points_awarded, pred_home, pred_away, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, matches(id, match_date, home_team, away_team, real_home_score, real_away_score, group_name, gw_number)')
            .eq('user_id', user.id)
            .not('points_awarded', 'is', null),
          supabase.from('tournament_predictions').select('*').eq('user_id', user.id).eq('phase', 'pre').maybeSingle(),
          supabase.from('group_predictions').select('group_name, ranked_codes, points_awarded').eq('user_id', user.id).order('group_name'),
          getActiveLeague(supabase, user.id),
        ])
        if (mineErr) throw mineErr
        setPreds((mine ?? []) as unknown as ScoredPred[])
        if (tp) setTournamentPred(tp as TournamentPred)
        if (gp) setGroupPreds((gp ?? []) as GroupPred[])

        const { weights: w, memberIds, league } = leagueData
        setWeights(w)
        setLeagueName(league?.name ?? null)
        setIsMoney(isMoneyLeague(league))

        const ids = memberIds.length ? memberIds : [user.id]
        const [{ data: all, error: allErr }, { data: gwMatches }] = await Promise.all([
          supabase
            .from('predictions')
            .select('user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, matches(gw_number)')
            .not('points_awarded', 'is', null)
            .in('user_id', ids),
          supabase.from('matches').select('gw_number, real_home_score').not('gw_number', 'is', null),
        ])
        setTotalPlayers(ids.length)
        let myRank: number | null = null
        if (!allErr) {
          const agg = new Map<string, number>()
          type AllRow = ScoredPred & { user_id: string; matches: { gw_number: number | null }[] | null }
          const allRows = (all ?? []) as unknown as AllRow[]
          for (const r of allRows) {
            agg.set(r.user_id, (agg.get(r.user_id) ?? 0) + weightedMatchPoints(r, w))
          }
          const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
          const idx = sorted.findIndex(([uid]) => uid === user.id)
          myRank = idx >= 0 ? idx + 1 : null

          if (isMoneyLeague(league) && myRank != null) {
            const gwMatchStatus = new Map<number, { total: number; scored: number }>()
            for (const m of (gwMatches ?? []) as { gw_number: number | null; real_home_score: number | null }[]) {
              if (!m.gw_number) continue
              const cur = gwMatchStatus.get(m.gw_number) ?? { total: 0, scored: 0 }
              cur.total++; if (m.real_home_score !== null) cur.scored++
              gwMatchStatus.set(m.gw_number, cur)
            }
            const predsForCalc = allRows.map((r) => ({
              user_id: r.user_id,
              points_awarded: weightedMatchPoints(r, w),
              pts_outcome: r.pts_outcome,
              gw_number: (r.matches?.[0]?.gw_number) ?? null,
            }))
            const snap = computePrizeSnapshot({ userId: user.id, allScoredPreds: predsForCalc, gwMatchStatus, overallRank: myRank })
            setNetPool(snap.settledNet)
          }
        }
        setRank(myRank)

        // Fetch rank snapshots for rank movement chart
        if (league?.id) {
          const { data: snaps, error: snapsErr } = await supabase
            .from('rank_snapshots')
            .select('rank, snapshot_at')
            .eq('user_id', user.id)
            .eq('league_id', league.id)
            .order('snapshot_at', { ascending: true })
            .limit(20)
          if (!snapsErr && snaps && snaps.length > 0) {
            const typed = snaps as { rank: number; snapshot_at: string }[]
            setRankSeries(typed.map((s) => s.rank))
            setSnapshotLabels(typed.map((s) => new Date(s.snapshot_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })))
          } else if (myRank) {
            setRankSeries([myRank])
          }
        } else if (myRank) {
          setRankSeries([myRank])
        }

      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ─── Derived stats ─────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const scored = preds.length
    const totalPts = preds.reduce((s, p) => s + weightedMatchPoints(p, weights), 0)
    const exact = preds.filter((p) => (p.pts_exact ?? 0) > 0).length
    const correctOutcome = preds.filter((p) => (p.pts_outcome ?? 0) > 0).length
    const acc = scored ? Math.round((correctOutcome / scored) * 100) : 0

    const cats = CATEGORIES.map((c) => {
      const earned = preds.filter((p) => (p[c.key] ?? 0) > 0).length
      return { ...c, pct: scored ? Math.round((earned / scored) * 100) : 0, earned }
    })

    // Streak: consecutive matches with pts > 0 (from most recent)
    const sorted = [...preds].sort((a, b) =>
      new Date(b.matches?.match_date ?? 0).getTime() - new Date(a.matches?.match_date ?? 0).getTime()
    )
    let streak = 0
    for (const p of sorted) {
      if (weightedMatchPoints(p, weights) > 0) streak++
      else break
    }

    return { scored, totalPts, exact, acc, correctOutcome, cats, streak }
  }, [preds, weights])

  const gwPoints = useMemo(() => {
    const map = new Map<number, number>()
    for (const p of preds) {
      const gw = p.matches?.gw_number
      if (gw == null) continue
      map.set(gw, (map.get(gw) ?? 0) + weightedMatchPoints(p, weights))
    }
    return Array.from({ length: 8 }, (_, i) => map.get(i + 1) ?? 0)
  }, [preds, weights])

  const gwLabels = [1,2,3,4,5,6,7,8].map((gw) => GW_SHORT[gw] ?? `GW${gw}`)

  const badges = useMemo(() => {
    const c = (key: keyof ScoredPred) => preds.filter((p) => ((p[key] as number) ?? 0) > 0).length
    return [
      { id: 'sniper', name: 'Scoreline Sniper', desc: '5 exact scores', earned: stats.exact >= 5 },
      { id: 'boot', name: 'Golden Boot Guru', desc: '3 first scorers', earned: c('pts_first_scorer') >= 3 },
      { id: 'genius', name: 'Group Stage Genius', desc: '100 points', earned: stats.totalPts >= 100 },
      { id: 'merchant', name: 'Upset Merchant', desc: '60% over 20 picks', earned: stats.scored >= 20 && stats.acc >= 60 },
      { id: 'prophet', name: 'First Blood Prophet', desc: '10 first-goal calls', earned: c('pts_first_team') >= 10 },
      { id: 'fraud', name: 'Fraud Watch', desc: 'Sub-30% accuracy', earned: stats.scored >= 10 && stats.acc < 30 },
      { id: 'hothand', name: 'Hot Hand', desc: '5+ correct outcomes in a row', earned: stats.streak >= 5 },
      { id: 'highroller', name: 'High Roller', desc: '12+ pts in a single match', earned: preds.some((p) => weightedMatchPoints(p, weights) >= 12) },
    ]
  }, [preds, stats, weights])

  const unlockedCount = badges.filter((b) => b.earned).length

  /* ─── Rank movement data ─────────────────────────────────────────────────── */
  const rankFirst = rankSeries[0] ?? rank ?? 1
  const rankLast = rankSeries[rankSeries.length - 1] ?? rank ?? 1
  const rankDelta = rankFirst - rankLast // positive = climbed

  /* ─── Per-GW points for chart tabs ──────────────────────────────────────── */
  const gwPointsMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of preds) {
      const gw = p.matches?.gw_number; if (!gw) continue
      m.set(gw, (m.get(gw) ?? 0) + weightedMatchPoints(p, weights))
    }
    return m
  }, [preds, weights])

  const allGws = useMemo(() => Array.from(gwPointsMap.keys()).sort((a, b) => a - b), [gwPointsMap])

  const gwPointsSeries = useMemo(() => allGws.map((gw) => gwPointsMap.get(gw) ?? 0), [allGws, gwPointsMap])

  const specificGwMatches = useMemo(() => {
    return preds
      .filter((p) => p.matches?.gw_number === selectedRankGw)
      .sort((a, b) => (a.matches?.match_date ?? '').localeCompare(b.matches?.match_date ?? ''))
  }, [preds, selectedRankGw])

  /* ─── Lucky vs skilled split ────────────────────────────────────────────── */
  const { skillPts, luckPts } = useMemo(() => {
    let skill = 0, luck = 0
    for (const p of preds) {
      skill += (p.pts_outcome ?? 0) + (p.pts_exact ?? 0) + (p.pts_goal_diff ?? 0) + (p.pts_total_goals ?? 0) + (p.pts_btts ?? 0)
      luck += (p.pts_first_team ?? 0) + (p.pts_first_scorer ?? 0)
    }
    return { skillPts: skill, luckPts: luck }
  }, [preds])

  /* ─── Accuracy improvement per GW ───────────────────────────────────────── */
  const gwAccuracy = useMemo(() => {
    const byGW = new Map<number, { correct: number; scored: number }>()
    for (const p of preds) {
      const gw = p.matches?.gw_number; if (!gw) continue
      const cur = byGW.get(gw) ?? { correct: 0, scored: 0 }
      cur.scored++
      if ((p.pts_outcome ?? 0) > 0) cur.correct++
      byGW.set(gw, cur)
    }
    const gws = Array.from(byGW.keys()).sort((a, b) => a - b)
    return {
      labels: gws.map((g) => GW_SHORT[g] ?? `GW${g}`),
      series: gws.map((g) => { const d = byGW.get(g)!; return d.scored > 0 ? Math.round((d.correct / d.scored) * 100) : 0 }),
    }
  }, [preds])

  /* ─── Donut chart segments ───────────────────────────────────────────────── */
  const missed = Math.max(0, stats.scored - stats.correctOutcome - stats.exact)
  const donutSegments = stats.scored > 0 ? [
    { value: stats.exact, color: 'rgb(var(--blue))' },
    { value: stats.correctOutcome, color: 'rgb(var(--primary))' },
    { value: missed, color: 'rgb(var(--surface3))' },
  ] : [{ value: 1, color: 'rgb(var(--surface3))' }]

  /* ─── Handlers ───────────────────────────────────────────────────────────── */
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !profile) return
    if (file.size > 20 * 1024 * 1024) {
      toast.error(`Image must be under 20 MB`)
      e.target.value = ''
      return
    }
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  async function handleCropConfirm(blob: Blob) {
    if (!profile) return
    setCropSrc(null)
    if (fileRef.current) fileRef.current.value = ''
    setUploading(true)
    setUploadPct(0)
    const pctTicker = setInterval(() => {
      setUploadPct((prev) => Math.min(prev + Math.random() * 14, 85))
    }, 180)
    const path = `${profile.id}/avatar.jpg`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    clearInterval(pctTicker)
    if (upErr) { setUploadPct(0); toast.error(`Upload failed: ${upErr.message}`); setUploading(false); return }
    setUploadPct(100)
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const busted = `${publicUrl}?t=${Date.now()}`
    const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: busted }).eq('id', profile.id)
    if (dbErr) { toast.error(`DB update failed: ${dbErr.message}`); setUploading(false); return }
    setAvatarUrl(busted)
    setProfile((prev) => (prev ? { ...prev, avatar_url: busted } : prev))
    window.dispatchEvent(new CustomEvent('matchday:profile-updated', { detail: { avatar_url: busted } }))
    toast.success('Avatar updated!')
    setTimeout(() => setUploadPct(0), 500)
    setUploading(false)
  }

  function handleCropClose() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function saveUsername() {
    if (!profile) return
    const t = username.trim(); if (!t) return
    setSaving(true)
    const { error: saveErr } = await supabase.from('profiles').update({ username: t }).eq('id', profile.id)
    setSaving(false)
    if (saveErr) toast.error(saveErr.message)
    else {
      setProfile((prev) => (prev ? { ...prev, username: t } : prev))
      window.dispatchEvent(new CustomEvent('matchday:profile-updated', { detail: { username: t } }))
      toast.success('Username saved!')
      setEditOpen(false)
    }
  }

  /* ─── Loading / error states ─────────────────────────────────────────────── */
  if (loading || !profile) {
    if (error) return (
      <div style={{ padding: '20px' }}>
        <EmptyState icon={<TrophyIcon size={22} />} title="Couldn't load profile" desc={error} />
      </div>
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 4 }}>
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-28 rounded-[18px]" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[0,1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-[16px]" />)}
        </div>
        <Skeleton className="h-56 rounded-[18px]" />
      </div>
    )
  }

  const scoredMatches = preds.filter((p) => p.matches)

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={eyebrowPrimary}>Your season</p>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, marginTop: 2, color: 'rgb(var(--textp))' }}>Profile</h1>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', borderRadius: 12,
            border: '1px solid rgb(var(--border))',
            background: 'transparent',
            color: 'rgb(var(--textp))',
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <PencilIcon size={14} />
          Edit profile
        </button>
      </div>

      {/* ── Identity card ── */}
      <div style={{
        background: 'rgb(var(--card))',
        border: '1px solid rgb(var(--border))',
        borderRadius: 18,
        boxShadow: 'var(--card-shadow)',
        padding: '22px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Green gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(120deg,rgba(var(--primary),0.10),transparent 50%)',
          pointerEvents: 'none',
        }} />

        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: 20, flexShrink: 0,
          background: 'linear-gradient(145deg,rgb(var(--heroFrom)),rgb(var(--heroTo)))',
          boxShadow: '0 10px 26px -10px rgba(15,122,72,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, fontWeight: 800, color: '#eafff3',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={profile.username} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 20 }} />
          ) : (
            (profile.username?.[0] ?? '?').toUpperCase()
          )}
        </div>

        {/* Name + sub */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))', lineHeight: 1.2 }}>{profile.username}</p>
          <p style={{ fontSize: 13, color: 'rgb(var(--texts))', margin: 0, marginTop: 3 }}>
            {leagueName ?? 'MatchDay'}
          </p>
        </div>

        {/* Right stats — hidden on mobile, shown on sm+ */}
        <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 0, position: 'relative', flexShrink: 0 }}>
          {/* Rank */}
          <div style={{ padding: '0 18px', textAlign: 'center' }}>
            <p style={eyebrow}>Rank</p>
            <p style={{ fontSize: 22, fontWeight: 800, margin: 0, marginTop: 2, color: 'rgb(var(--gold))', lineHeight: 1 }}>
              {rank ? `#${rank}` : '–'}
            </p>
          </div>
          <div style={{ width: 1, height: 36, background: 'rgb(var(--border))' }} />
          {/* Streak */}
          <div style={{ padding: '0 18px', textAlign: 'center' }}>
            <p style={eyebrow}>Streak</p>
            <p style={{ fontSize: 22, fontWeight: 800, margin: 0, marginTop: 2, color: 'rgb(var(--textp))', lineHeight: 1 }}>
              {stats.streak}
            </p>
          </div>
          {isMoney && <div style={{ width: 1, height: 36, background: 'rgb(var(--border))' }} />}
          {isMoney && (
            <div style={{ padding: '0 18px', textAlign: 'center' }}>
              <p style={eyebrow}>Settled</p>
              <p style={{ fontSize: 22, fontWeight: 800, margin: 0, marginTop: 2, lineHeight: 1, color: netPool == null ? 'rgb(var(--texts))' : prizeTone(netPool) === 'green' ? 'rgb(var(--success))' : prizeTone(netPool) === 'red' ? 'rgb(var(--error))' : 'rgb(var(--textp))' }}>
                {netPool != null ? formatPrize(netPool) : '–'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 4 stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[14px]">
        {/* Total points */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 16, boxShadow: 'var(--card-shadow)',
          padding: '16px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0', background: 'rgb(var(--primary))' }} />
          <p style={eyebrow}>Total points</p>
          <p style={{ fontSize: 28, fontWeight: 800, margin: 0, marginTop: 6, color: 'rgb(var(--primary))', lineHeight: 1 }}>{stats.totalPts}</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 5 }}>across {stats.scored} matches</p>
        </div>
        {/* Rank */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 16, boxShadow: 'var(--card-shadow)',
          padding: '16px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0', background: 'rgb(var(--gold))' }} />
          <p style={eyebrow}>Rank</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
            <p style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'rgb(var(--gold))', lineHeight: 1 }}>
              {rank ? `#${rank}` : '–'}
            </p>
            {rankDelta > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgb(var(--primary))' }}>▲{rankDelta}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 5 }}>of {totalPlayers} players</p>
        </div>
        {/* Exact scores */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 16, boxShadow: 'var(--card-shadow)',
          padding: '16px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0', background: 'rgb(var(--blue))' }} />
          <p style={eyebrow}>Exact scores</p>
          <p style={{ fontSize: 28, fontWeight: 800, margin: 0, marginTop: 6, color: 'rgb(var(--blue))', lineHeight: 1 }}>{stats.exact}</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 5 }}>
            {stats.scored > 0 ? `${Math.round((stats.exact / stats.scored) * 100)}% of all picks` : 'no picks yet'}
          </p>
        </div>
        {/* Outcome accuracy */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 16, boxShadow: 'var(--card-shadow)',
          padding: '16px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <p style={eyebrow}>Outcome accuracy</p>
          <p style={{ fontSize: 28, fontWeight: 800, margin: 0, marginTop: 6, color: 'rgb(var(--textp))', lineHeight: 1 }}>{stats.acc}%</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 5 }}>{stats.correctOutcome} correct calls</p>
        </div>
      </div>

      {/* ── Points by gameweek + Accuracy donut ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1.55fr_1fr] gap-[18px]">
        {/* Left: bar chart */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>Points by gameweek</p>
              <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 2 }}>Your haul across all 8 gameweeks</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'rgb(var(--primary))', lineHeight: 1 }}>{stats.totalPts}</p>
              <p style={{ fontSize: 11, color: 'rgb(var(--texts))', margin: 0, marginTop: 1 }}>total pts</p>
            </div>
          </div>
          <BarChart series={gwPoints} labels={gwLabels} accent="rgb(var(--primary))" showVals />
        </div>

        {/* Right: donut */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>Accuracy</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 2, marginBottom: 14 }}>{stats.scored} predictions scored</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <DonutChart
              segments={donutSegments}
              total={stats.scored || 1}
              centerValue={`${stats.acc}%`}
              centerLabel="hit rate"
              size={156}
              thickness={17}
            />
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(var(--blue))', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Exact scorelines</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'rgb(var(--textp))' }}>{stats.exact}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(var(--primary))', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Right outcome</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'rgb(var(--textp))' }}>{stats.correctOutcome}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgb(var(--surface3))', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>Missed</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'rgb(var(--textp))' }}>{missed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rank movement + Category accuracy ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
        {/* Left: rank movement */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>
                  {rankChartMode === 'season' ? 'Rank movement' : rankChartMode === 'byGW' ? 'Points by round' : `${GW_SHORT[selectedRankGw] ?? `GW${selectedRankGw}`} breakdown`}
                </p>
                <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginTop: 2 }}>
                  {rankChartMode === 'season'
                    ? (rankSeries.length > 1 ? `${ordinal(rankFirst)} → ${ordinal(rankLast)}` : rank ? `Currently ${ordinal(rank)}` : 'No rank data yet')
                    : rankChartMode === 'byGW'
                    ? 'Points earned each gameweek'
                    : 'Match-by-match points'}
                </p>
              </div>
              {rankChartMode === 'season' && rankDelta > 0 && (
                <div style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(var(--primary),0.13)', color: 'rgb(var(--primary))', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  ▲ {rankDelta}
                </div>
              )}
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))' }}>
                {(['season', 'byGW', 'specificGW'] as const).map((mode) => {
                  const active = rankChartMode === mode
                  const label = mode === 'season' ? 'Season' : mode === 'byGW' ? 'By GW' : 'Specific GW'
                  return (
                    <button key={mode} onClick={() => setRankChartMode(mode)} style={{
                      height: 28, padding: '0 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: active ? 'rgb(var(--textp))' : 'transparent',
                      color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                      fontSize: 11.5, fontWeight: 700, transition: 'all 0.15s',
                    }}>{label}</button>
                  )
                })}
              </div>
              {rankChartMode === 'specificGW' && allGws.length > 0 && (
                <select
                  value={selectedRankGw}
                  onChange={(e) => setSelectedRankGw(Number(e.target.value))}
                  style={{ height: 30, borderRadius: 8, border: '1px solid rgb(var(--border))', background: 'rgb(var(--surface))', color: 'rgb(var(--textp))', fontSize: 12, padding: '0 8px', cursor: 'pointer' }}
                >
                  {allGws.map((gw) => <option key={gw} value={gw}>{GW_SHORT[gw] ?? `GW${gw}`}</option>)}
                </select>
              )}
            </div>
          </div>
          {rankChartMode === 'season' ? (
            <RankLine
              ranks={rankSeries.length >= 2 ? rankSeries : (rank ? [rank, rank] : [1, 1])}
              total={totalPlayers || undefined}
              labels={snapshotLabels.length >= 2 ? snapshotLabels : undefined}
            />
          ) : rankChartMode === 'byGW' ? (
            allGws.length > 0
              ? <BarChart series={gwPointsSeries} labels={allGws.map((g) => GW_SHORT[g] ?? `GW${g}`)} showVals />
              : <p style={{ fontSize: 13, color: 'rgb(var(--texts))', textAlign: 'center', paddingTop: 40 }}>No scored gameweeks yet</p>
          ) : (
            specificGwMatches.length > 0
              ? <BarChart
                  series={specificGwMatches.map((p) => weightedMatchPoints(p, weights))}
                  labels={specificGwMatches.map((p) => `${p.matches?.home_team ?? '?'}-${p.matches?.away_team ?? '?'}`)}
                  showVals
                />
              : <p style={{ fontSize: 13, color: 'rgb(var(--texts))', textAlign: 'center', paddingTop: 40 }}>No predictions for {GW_SHORT[selectedRankGw] ?? `GW${selectedRankGw}`}</p>
          )}
        </div>

        {/* Right: category accuracy */}
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))', marginBottom: 14 }}>Accuracy by category</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.cats.map((c) => {
              const color = c.pct >= 60
                ? 'rgb(var(--primary))'
                : c.pct >= 40
                  ? 'rgb(var(--blue))'
                  : 'rgb(var(--coral))'
              return (
                <div key={c.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'rgb(var(--textp))', fontWeight: 600 }}>{c.label}</span>
                    <span style={{ fontSize: 12, color, fontWeight: 700 }}>{c.pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgb(var(--surface2))', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${c.pct}%`,
                      background: color,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Lucky vs Skilled + Improvement trend ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
        {/* Lucky vs Skilled */}
        <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))', marginBottom: 4 }}>Skill vs luck breakdown</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginBottom: 16 }}>Outcome/score/diff/goals = skill · First goal/scorer = luck</p>
          {stats.totalPts > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Skill', pts: skillPts, color: 'rgb(var(--primary))' },
                { label: 'Luck', pts: luckPts, color: 'rgb(var(--amber))' },
              ].map(({ label, pts, color }) => {
                const pct = stats.totalPts > 0 ? Math.round((pts / stats.totalPts) * 100) : 0
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgb(var(--textp))' }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{pts} pts <span style={{ color: 'rgb(var(--texts))', fontWeight: 500 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgb(var(--surface2))', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
              <p style={{ fontSize: 11, color: 'rgb(var(--texts))', margin: 0 }}>
                {luckPts > skillPts ? 'Riding your luck — first scorer picks are carrying you.' : skillPts > luckPts * 2 ? 'Fundamentally solid — your score/outcome reads are the backbone.' : 'Balanced mix of reading games and backing the right scorers.'}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'rgb(var(--texts))', textAlign: 'center', paddingTop: 32 }}>No scored predictions yet</p>
          )}
        </div>

        {/* Accuracy trend per GW */}
        <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))', marginBottom: 4 }}>Accuracy trend</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0, marginBottom: 16 }}>Outcome hit rate per gameweek — are you improving?</p>
          {gwAccuracy.series.length >= 2 ? (
            <BarChart series={gwAccuracy.series} labels={gwAccuracy.labels} accent="rgb(var(--blue))" showVals />
          ) : (
            <p style={{ fontSize: 13, color: 'rgb(var(--texts))', textAlign: 'center', paddingTop: 32 }}>Need at least 2 gameweeks of data</p>
          )}
        </div>
      </div>

      {/* ── Badges ── */}
      <div style={{
        background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
        borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>Badges</p>
          <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0 }}>{unlockedCount} of 6 unlocked</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-[10px]">
          {badges.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center', gap: 9, padding: '16px 10px', borderRadius: 14,
                border: b.earned ? '1px solid rgba(var(--gold),0.3)' : '1px solid rgb(var(--border))',
                background: b.earned ? 'rgba(var(--gold),0.06)' : 'rgb(var(--surface))',
                opacity: b.earned ? 1 : 0.55,
                transition: 'opacity 0.2s',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: b.earned ? 'rgba(var(--gold),0.1)' : 'rgb(var(--surface2))',
                color: b.earned ? 'rgb(var(--gold))' : 'rgb(var(--faint))',
              }}>
                {b.earned ? (BADGE_ICONS[b.id] ?? <TrophyIcon size={20} />) : <LockIcon size={18} />}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgb(var(--textp))', lineHeight: 1.2 }}>{b.name}</span>
              <span style={{ fontSize: 10, color: 'rgb(var(--texts))' }}>{b.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bracket picks ── */}
      <div style={{
        background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
        borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>Bracket game picks</p>
            <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: '2px 0 0' }}>Your tournament picks in the refreshed layout.</p>
          </div>
        </div>
        {!tournamentPred || (!tournamentPred.champion && !tournamentPred.runner_up && !tournamentPred.semi?.length && !tournamentPred.quarter?.length) ? (
          <EmptyState icon={<TrophyIcon size={20} />} title="No bracket picks yet" desc="Open Bracket to set your champion and knockout picks." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Champion', value: tournamentPred.champion },
                { label: 'Runner-up', value: tournamentPred.runner_up },
              ].map((row) => row.value ? (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 12, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))' }}>
                  <TeamLink code={row.value}><FlagChip code={row.value} w={28} h={20} r={5} /></TeamLink>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ ...eyebrow, margin: 0 }}>{row.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))' }}>{getTeam(row.value).name}</p>
                  </div>
                </div>
              ) : null)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Semi-finalists', values: tournamentPred.semi ?? [] },
                { label: 'Quarter-finalists', values: tournamentPred.quarter ?? [] },
              ].map((row) => row.values.length > 0 ? (
                <div key={row.label} style={{ padding: '12px 13px', borderRadius: 12, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))' }}>
                  <p style={{ ...eyebrow, margin: 0 }}>{row.label}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
                    {row.values.map((code) => (
                      <div key={`${row.label}-${code}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 999, background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))' }}>
                        <TeamLink code={code}><FlagChip code={code} w={22} h={16} r={4} /></TeamLink>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgb(var(--textp))' }}>{getTeam(code).name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null)}
            </div>
          </div>
        )}
      </div>

      {/* ── Group picks ── */}
      <div style={{
        background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
        borderRadius: 18, boxShadow: 'var(--card-shadow)', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>Group predictions</p>
            <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: '2px 0 0' }}>Your submitted group rankings and settled points.</p>
          </div>
        </div>
        {groupPreds.length === 0 ? (
          <EmptyState icon={<LockIcon size={18} />} title="No group predictions yet" desc="Open Groups to rank each group from 1st to 4th." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-[12px]">
            {groupPreds.map((gp) => (
              <div key={gp.group_name} style={{ borderRadius: 14, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))', padding: '12px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'rgb(var(--textp))' }}>Group {gp.group_name}</p>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                    background: gp.points_awarded != null ? 'rgba(var(--primary),0.12)' : 'rgb(var(--card))',
                    color: gp.points_awarded != null ? 'rgb(var(--primary))' : 'rgb(var(--texts))',
                    border: '1px solid rgb(var(--border))',
                  }}>
                    {gp.points_awarded != null ? `+${weightedGroupPoints(gp.points_awarded, weights)}` : 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {gp.ranked_codes.slice(0, 4).map((code, idx) => (
                    <div key={`${gp.group_name}-${code}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 16, fontSize: 12, fontWeight: 800, color: idx < 2 ? 'rgb(var(--gold))' : 'rgb(var(--texts))' }}>{idx + 1}</span>
                      <TeamLink code={code}><FlagChip code={code} w={22} h={16} r={4} /></TeamLink>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgb(var(--textp))' }}>{getTeam(code).name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Match history ── */}
      {scoredMatches.length > 0 && (
        <div style={{
          background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))',
          borderRadius: 18, boxShadow: 'var(--card-shadow)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px' }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'rgb(var(--textp))' }}>Match history</p>
            <p style={{ fontSize: 12, color: 'rgb(var(--texts))', margin: 0 }}>{scoredMatches.length} scored</p>
          </div>
          {scoredMatches
            .sort((a, b) => new Date(b.matches!.match_date).getTime() - new Date(a.matches!.match_date).getTime())
            .map((p) => {
              const m = p.matches!
              const pts = weightedMatchPoints(p, weights)
              const ptsBg = pts >= 8
                ? 'rgba(var(--primary),0.15)'
                : pts > 0
                  ? 'rgba(var(--gold),0.15)'
                  : 'rgb(var(--surface2))'
              const ptsColor = pts >= 8
                ? 'rgb(var(--primary))'
                : pts > 0
                  ? 'rgb(var(--gold))'
                  : 'rgb(var(--faint))'
              return (
                <div
                  key={p.match_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 22px',
                    borderTop: '1px solid rgba(var(--border),0.55)',
                  }}
                >
                  {/* Score — opens the match */}
                  <Link href={`/match/${p.match_id}`} aria-label={`Open ${m.home_team} versus ${m.away_team}`} style={{ display: 'flex', alignItems: 'center', gap: 6, width: 150, flexShrink: 0, cursor: 'pointer' }}>
                    <FlagChip code={m.home_team} w={28} h={19} r={4} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--textp))', fontVariantNumeric: 'tabular-nums' }}>
                      {m.real_home_score}–{m.real_away_score}
                    </span>
                    <FlagChip code={m.away_team} w={28} h={19} r={4} />
                  </Link>
                  {/* Teams */}
                  <span style={{ flex: 1, fontSize: 12.5, color: 'rgb(var(--texts))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.home_team} vs {m.away_team}
                  </span>
                  {/* My pick */}
                  {p.pred_home != null && p.pred_away != null && (
                    <span style={{ fontSize: 12, color: 'rgb(var(--texts))', whiteSpace: 'nowrap' }}>
                      you {p.pred_home}–{p.pred_away}
                    </span>
                  )}
                  {/* Points chip */}
                  <div style={{
                    width: 48, textAlign: 'center', padding: '4px 0',
                    borderRadius: 8,
                    background: ptsBg,
                    color: ptsColor,
                    fontSize: 12, fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {pts > 0 ? `+${pts}` : pts}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ── Edit profile modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile" maxWidth="max-w-sm">
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={profile.username} src={avatarUrl} size={56} />
            <div>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? `Uploading ${Math.round(uploadPct)}%` : 'Change photo'}
              </Button>
              {uploading && (
                <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgb(var(--surface2))', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: 'rgb(var(--primary))', width: `${uploadPct}%`, transition: 'width 0.18s ease' }} />
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            {cropSrc && <CropModal src={cropSrc} onConfirm={handleCropConfirm} onClose={handleCropClose} />}
          </div>

          {/* Username */}
          <div>
            <p style={{ ...eyebrow, marginBottom: 6 }}>Display name</p>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={40}
              placeholder="Username"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px', borderRadius: 12,
                border: '1px solid rgb(var(--border))',
                background: 'rgb(var(--surface))',
                color: 'rgb(var(--textp))',
                fontSize: 14, outline: 'none',
              }}
            />
          </div>

          {/* Push notifications */}
          <PushToggle userId={profile.id} />

          {/* Accessibility */}
          <ColorblindToggle userId={profile.id} />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveUsername} disabled={saving || !username.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ─── Ordinal helper ─────────────────────────────────────────────────────────── */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
