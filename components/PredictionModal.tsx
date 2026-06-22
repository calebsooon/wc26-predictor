'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import { POINTS, weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { getActiveLeague } from '@/lib/league'
import { DialogShell, SearchIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { normalisePosition, POSITION_ORDER } from '@/lib/teams'
import { fmtTime } from '@/lib/date-format'

/* ─── Types ──────────────────────────────────────────────────────── */
interface PlayerRow {
  id: number
  name: string
  jersey_number: number | null
  position: string | null
  team_code: string
}

interface OtherPred {
  user_id: string
  pred_home: number
  pred_away: number
  pred_total_goals: number | null
  pred_goal_diff: number | null
  pred_btts: boolean | null
  pred_first_scorer_id: number | null
  pred_no_scorer: boolean | null
  pred_first_goal_team: string | null
  points_awarded: number | null
  pts_outcome: number | null
  pts_exact: number | null
  pts_goal_diff: number | null
  pts_total_goals: number | null
  pts_team_goals: number | null
  pts_btts: number | null
  pts_first_team: number | null
  pts_first_scorer: number | null
  profiles: { username: string; avatar_url: string | null } | null
}

/* ─── Lock/time helpers ──────────────────────────────────────────── */
function fmtCountdown(secs: number): string {
  if (secs <= 0) return 'Locked'
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60), s = secs % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/* ─── Avatar initials ────────────────────────────────────────────── */
function Av({ name, src, you, size = 32 }: { name: string; src?: string | null; you?: boolean; size?: number }) {
  const [err, setErr] = useState(false)
  const color = you ? 'rgb(var(--primary))' : 'rgb(var(--textp))'
  const bg = you ? 'rgb(var(--primary))' : 'rgb(var(--surface3))'
  const textColor = you ? 'rgb(4,38,20)' : 'rgb(var(--textp))'
  const r = Math.round(size * 0.28)
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} width={size} height={size}
        className="object-cover shrink-0" style={{ borderRadius: r, border: `2px solid ${color}` }}
        onError={() => setErr(true)} />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: r, background: bg, color: textColor, border: `1.5px solid ${you ? 'rgb(var(--primary))' : 'rgb(var(--border))'}` }}
      className="grid place-items-center font-bold shrink-0 text-sm uppercase">
      {name[0] ?? '?'}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────── */
export interface PredictionModalProps {
  matchId: string
  onClose: () => void
}

export default function PredictionModal({ matchId, onClose }: PredictionModalProps) {
  const supabase = createClient()

  // Match data
  const [match, setMatch] = useState<{
    id: string; home_team: string; away_team: string; match_date: string
    real_home_score: number | null; real_away_score: number | null
    is_locked: boolean; group_name: string | null; round_name: string | null
    gameweek: number | null
  } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [allowGdManual, setAllowGdManual] = useState(true)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [others, setOthers] = useState<OtherPred[]>([])
  const [revealPredictions, setRevealPredictions] = useState(false)
  const [loading, setLoading] = useState(true)

  // Prediction state
  const [h, setH] = useState<number | null>(null)
  const [a, setA] = useState<number | null>(null)
  const [firstTeam, setFirstTeam] = useState<string | null>(null)
  const [scorerId, setScorerId] = useState<number | 'none' | null>(null)
  const [predTotalGoals, setPredTotalGoals] = useState<number | null>(null)
  const [predGoalDiff, setPredGoalDiff] = useState<number | null>(null)
  const [predBtts, setPredBtts] = useState<boolean | null>(null)
  const [tgManual, setTgManual] = useState(false)
  const [gdManual, setGdManual] = useState(false)
  const [bttsManual, setBttsManual] = useState(false)
  const [scorerQuery, setScorerQuery] = useState('')
  const [saving, setSaving] = useState(false)

  // Countdown
  const [secsLeft, setSecsLeft] = useState<number>(0)

  // Load data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: m } = await supabase.from('matches').select('*, rounds(name)').eq('id', matchId).single()
      if (!m) { setLoading(false); return }
      const dbm = { ...m as Record<string, unknown>, round_name: (m as { rounds?: { name: string } }).rounds?.name ?? null } as typeof match
      setMatch(dbm as NonNullable<typeof match>)
      const kickoffMs = new Date((dbm as { match_date: string }).match_date).getTime()
      setSecsLeft(Math.max(0, Math.floor((kickoffMs - Date.now()) / 1000)))

      const home = getTeam((dbm as { home_team: string }).home_team)
      const away = getTeam((dbm as { away_team: string }).away_team)

      const [{ data: pl }, { data: mine }, leagueResult] = await Promise.all([
        supabase.from('players').select('id, name, team_name, jersey_number, position')
          .in('team_name', [home.playerKey, away.playerKey])
          .order('jersey_number', { ascending: true, nullsFirst: false }),
        supabase.from('predictions')
          .select('pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer')
          .eq('user_id', user.id).eq('match_id', matchId).maybeSingle(),
        getActiveLeague(supabase, user.id),
      ])

      type PlRow = { id: number; name: string; team_name: string; jersey_number: number | null; position: string | null }
      setPlayers((pl ?? []).map((p) => {
        const r = p as PlRow
        return { id: r.id, name: r.name, jersey_number: r.jersey_number, position: r.position ?? null, team_code: r.team_name === home.playerKey ? (dbm as { home_team: string }).home_team : (dbm as { away_team: string }).away_team }
      }))

      if (mine) {
        const p = mine as Record<string, unknown>
        setH(p.pred_home as number); setA(p.pred_away as number)
        setFirstTeam((p.pred_first_goal_team as string) ?? null)
        setScorerId(p.pred_no_scorer ? 'none' : ((p.pred_first_scorer_id as number) ?? null))
        const ph = p.pred_home as number, pa = p.pred_away as number
        if (p.pred_total_goals != null) {
          setPredTotalGoals(p.pred_total_goals as number)
          if ((p.pred_total_goals as number) !== ph + pa) setTgManual(true)
        }
        if (p.pred_goal_diff != null) {
          setPredGoalDiff(p.pred_goal_diff as number)
          if ((p.pred_goal_diff as number) !== ph - pa) setGdManual(true)
        }
        if (p.pred_btts != null) { setPredBtts(p.pred_btts as boolean); setBttsManual(true) }
      }

      setAllowGdManual(leagueResult.allowGdManual)
      setWeights(leagueResult.weights)
      setRevealPredictions(leagueResult.league?.reveal_predictions === true)

      // Load others' predictions
      const { memberIds } = leagueResult
      const predSelect = 'user_id, pred_home, pred_away, pred_total_goals, pred_goal_diff, pred_btts, pred_first_scorer_id, pred_no_scorer, pred_first_goal_team, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'
      const predBase = supabase.from('predictions').select(predSelect).eq('match_id', matchId)
      const { data: predRows } = await (memberIds.length ? predBase.in('user_id', memberIds) : predBase)
      const predUserIds = (predRows ?? []).map((p) => (p as { user_id: string }).user_id)
      const profileMap = new Map<string, { username: string; avatar_url: string | null }>()
      if (predUserIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', predUserIds)
        for (const pr of profs ?? []) {
          const row = pr as { id: string; username: string; avatar_url: string | null }
          profileMap.set(row.id, { username: row.username, avatar_url: row.avatar_url })
        }
      }
      setOthers((predRows ?? []).map((p) => ({
        ...p, profiles: profileMap.get((p as { user_id: string }).user_id) ?? null,
      })) as unknown as OtherPred[])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  // Live countdown
  useEffect(() => {
    if (!match) return
    const id = setInterval(() => {
      setSecsLeft(Math.max(0, Math.floor((new Date(match.match_date).getTime() - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(id)
  }, [match])

  // Auto-derive totals/BTTS/GD from scoreline
  useEffect(() => {
    if (!tgManual && h != null && a != null) setPredTotalGoals(h + a)
  }, [h, a, tgManual])
  useEffect(() => {
    if (!gdManual && h != null && a != null) setPredGoalDiff(h - a)
  }, [h, a, gdManual])
  useEffect(() => {
    if (!bttsManual && h != null && a != null) setPredBtts(h > 0 && a > 0)
  }, [h, a, bttsManual])

  async function submit() {
    if (!userId || !match || h == null || a == null || saving) return
    setSaving(true)
    const { error } = await supabase.from('predictions').upsert({
      user_id: userId, match_id: matchId,
      pred_home: h, pred_away: a,
      pred_first_goal_team: firstTeam,
      pred_first_scorer_id: typeof scorerId === 'number' && scorerId !== -1 ? scorerId : null,
      pred_no_scorer: scorerId === 'none',
      pred_total_goals: predTotalGoals,
      pred_goal_diff: allowGdManual ? predGoalDiff : null,
      pred_btts: bttsManual ? predBtts : null,
    }, { onConflict: 'user_id,match_id' })
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    const home = getTeam(match.home_team), away = getTeam(match.away_team)
    toast.success(`Locked in — ${home.code} ${h}–${a} ${away.code}`)
    onClose()
  }

  /* ─── Derived display values ─────────────────────── */
  const locked = !match ? false : (!!match.real_home_score || match.real_home_score === 0) ? true : match.is_locked || secsLeft <= 0
  // League admins can reveal everyone's picks before kickoff. When that's on and the
  // match is still open, show the League predictions panel alongside the editable form.
  const revealPre = !locked && revealPredictions
  const scored = match != null && match.real_home_score !== null && match.real_away_score !== null
  const home = match ? getTeam(match.home_team) : null
  const away = match ? getTeam(match.away_team) : null

  const isUrgent = !locked && secsLeft < 3600 && secsLeft > 0

  // Sort players by position
  const sortedPlayers = [...players].sort((pa, pb) => {
    const po = (POSITION_ORDER[normalisePosition(pa.position)] ?? 9) - (POSITION_ORDER[normalisePosition(pb.position)] ?? 9)
    return po !== 0 ? po : (pa.jersey_number ?? 99) - (pb.jersey_number ?? 99)
  })

  // Filtered scorer list
  // Special sentinel IDs: -1 = own goal, -2 = no scorer
  const SCORER_OG = -1
  const SCORER_NONE = -2
  const q = scorerQuery.toLowerCase()
  const specialCards: PlayerRow[] = [
    { id: SCORER_OG, name: 'Own goal', jersey_number: null, position: null, team_code: '' },
    { id: SCORER_NONE, name: 'No scorer', jersey_number: null, position: null, team_code: '' },
  ]
  const scorerPool = [
    ...specialCards.filter((p) => !q || p.name.toLowerCase().includes(q)),
    ...sortedPlayers.filter((p) => p.team_code === match?.home_team).filter((p) => !q || p.name.toLowerCase().includes(q)),
    ...sortedPlayers.filter((p) => p.team_code === match?.away_team).filter((p) => !q || p.name.toLowerCase().includes(q)),
  ]

  // Consensus (most common pick)
  function mode<T>(arr: T[]): T | undefined {
    const c = new Map<string, number>()
    let best: T | undefined, bn = 0
    arr.forEach((x) => {
      const k = String(x); const n = (c.get(k) ?? 0) + 1; c.set(k, n)
      if (n > bn) { bn = n; best = x }
    })
    return best
  }

  const consensusScore = others.length
    ? mode(others.map((o) => `${o.pred_home}–${o.pred_away}`))
    : ''
  const consensusScorerName = others.length
    ? (() => {
      const m = mode(others.map((o) => o.pred_first_scorer_id))
      if (m == null) return 'No pick'
      if (m === -1) return 'Own goal'
      const p = players.find((pl) => pl.id === m)
      return p ? p.name : 'No scorer'
    })()
    : ''

  const groupLabel = match
    ? match.group_name
      ? `Group ${match.group_name}`
      : (match.round_name ?? 'Knockout')
    : ''
  const timeLabel = match ? fmtTime(match.match_date) : ''

  const isEditing = h != null && a != null && others.some((o) => o.user_id === userId)

  /* ─── Render ─────────────────────────────────────── */
  return (
    <DialogShell
      open
      onClose={onClose}
      ariaLabel="Match prediction"
      maxWidth="max-w-[560px]"
      zIndexClassName="z-[60]"
      portal
      align="center"
      panelClassName="max-h-[90vh] overflow-y-auto rounded-[20px] border border-border bg-card shadow-2xl"
    >
        {/* ── Card Header (always visible) ─────────── */}
        <div style={{
          padding: '20px 22px',
          borderBottom: '1px solid rgb(var(--border))',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Gradient overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg,rgba(var(--primary),0.10),transparent 55%)',
            pointerEvents: 'none',
          }} />

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 15,
              right: 15,
              width: 32,
              height: 32,
              borderRadius: 9,
              border: '1px solid rgb(var(--border))',
              background: 'rgb(var(--surface2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              fontSize: 18,
              color: 'rgb(var(--texts))',
              lineHeight: 1,
            }}
          >
            ×
          </button>

          <div style={{ position: 'relative' }}>
            {loading ? (
              <div style={{ height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
              </div>
            ) : match ? (
              <>
                {/* Group + time badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  <span style={{
                    color: 'rgb(var(--blue))',
                    background: 'rgba(var(--blue),0.14)',
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}>{groupLabel}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgb(var(--faint))',
                    fontFamily: 'Schibsted Grotesk, sans-serif',
                  }}>{timeLabel}</span>
                </div>

                {/* Teams row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 24,
                }}>
                  {/* Home team */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    width: 120,
                  }}>
                    <FlagChip code={match.home_team} w={50} h={34} r={7} />
                    <span style={{
                      fontSize: 15,
                      fontWeight: 700,
                      textAlign: 'center',
                      color: 'rgb(var(--textp))',
                    }}>{home?.name}</span>
                  </div>

                  {/* VS or score */}
                  <span style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: 'rgb(var(--textp))',
                    fontFamily: 'Schibsted Grotesk, sans-serif',
                  }}>
                    {scored ? `${match.real_home_score}–${match.real_away_score}` : 'vs'}
                  </span>

                  {/* Away team */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    width: 120,
                  }}>
                    <FlagChip code={match.away_team} w={50} h={34} r={7} />
                    <span style={{
                      fontSize: 15,
                      fontWeight: 700,
                      textAlign: 'center',
                      color: 'rgb(var(--textp))',
                    }}>{away?.name}</span>
                  </div>
                </div>

                {/* Status banner */}
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                  {!locked ? (
                    /* Open state banner */
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      justifyContent: 'center',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: isUrgent ? 'rgb(var(--coral))' : 'rgb(var(--amber))',
                    }}>
                      {/* Clock icon */}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 3" />
                      </svg>
                      {secsLeft > 0 ? `Locks in ${fmtCountdown(secsLeft)}` : 'Open to predict'}
                    </div>
                  ) : (
                    /* Locked / settled pill */
                    <div style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      ...(scored
                        ? {
                          background: 'rgba(var(--primary),0.12)',
                          color: 'rgb(var(--primary))',
                          border: '1px solid rgba(var(--primary),0.25)',
                        }
                        : {
                          background: 'rgba(var(--amber),0.12)',
                          color: 'rgb(var(--amber))',
                          border: '1px solid rgba(var(--amber),0.3)',
                        }),
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {scored ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Final {match.real_home_score}–{match.real_away_score} · predictions revealed
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Predictions locked
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ textAlign: 'center', color: 'rgb(var(--texts))', padding: '32px 0' }}>Match not found.</p>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────── */}
        {!loading && match && (
          <>
            {/* ── OPEN STATE: prediction form ─────── */}
            {!locked && (
              <div style={{
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}>
                {/* Score stepper */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 20,
                }}>
                  {/* Home stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      onClick={() => setH((v) => Math.max(0, (v ?? 0) - 1))}
                      style={{
                        width: 38,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid rgb(var(--border))',
                        background: 'rgb(var(--surface2))',
                        fontSize: 18,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'rgb(var(--textp))',
                      }}
                    >−</button>
                    <span style={{
                      fontSize: 40,
                      fontWeight: 800,
                      color: 'rgb(var(--primary))',
                      fontFamily: 'Schibsted Grotesk, sans-serif',
                      minWidth: 40,
                      textAlign: 'center',
                      lineHeight: 1,
                    }}>{h ?? '–'}</span>
                    <button
                      onClick={() => setH((v) => Math.min(20, (v ?? 0) + 1))}
                      style={{
                        width: 38,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid rgb(var(--border))',
                        background: 'rgb(var(--surface2))',
                        fontSize: 18,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'rgb(var(--textp))',
                      }}
                    >+</button>
                  </div>

                  {/* Center dash */}
                  <span style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: 'rgb(var(--faint))',
                  }}>–</span>

                  {/* Away stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      onClick={() => setA((v) => Math.max(0, (v ?? 0) - 1))}
                      style={{
                        width: 38,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid rgb(var(--border))',
                        background: 'rgb(var(--surface2))',
                        fontSize: 18,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'rgb(var(--textp))',
                      }}
                    >−</button>
                    <span style={{
                      fontSize: 40,
                      fontWeight: 800,
                      color: 'rgb(var(--primary))',
                      fontFamily: 'Schibsted Grotesk, sans-serif',
                      minWidth: 40,
                      textAlign: 'center',
                      lineHeight: 1,
                    }}>{a ?? '–'}</span>
                    <button
                      onClick={() => setA((v) => Math.min(20, (v ?? 0) + 1))}
                      style={{
                        width: 38,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid rgb(var(--border))',
                        background: 'rgb(var(--surface2))',
                        fontSize: 18,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'rgb(var(--textp))',
                      }}
                    >+</button>
                  </div>
                </div>

                {/* Derived stats grid */}
                {h != null && a != null && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 10,
                  }}>
                    {/* Total goals stepper */}
                    <div style={{
                      background: 'rgb(var(--surface2))',
                      border: `1px solid ${tgManual ? 'rgba(var(--primary),0.5)' : 'rgb(var(--border))'}`,
                      borderRadius: 12,
                      padding: '10px 8px',
                      textAlign: 'center',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      {tgManual && (
                        <button
                          onClick={() => { setTgManual(false); setPredTotalGoals(h + a) }}
                          title="Reset to auto"
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'rgb(var(--primary))',
                            background: 'rgba(var(--primary),0.12)',
                            border: 'none',
                            borderRadius: 4,
                            padding: '1px 5px',
                            cursor: 'pointer',
                            lineHeight: 1.6,
                          }}
                        >auto</button>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => { const cur = predTotalGoals ?? (h + a); setTgManual(true); setPredTotalGoals(Math.max(0, cur - 1)) }}
                          style={{
                            width: 28, height: 24, borderRadius: 6,
                            border: '1px solid rgb(var(--border))',
                            background: 'rgb(var(--surface3))',
                            fontSize: 15, fontWeight: 700, cursor: 'pointer',
                            color: 'rgb(var(--textp))', lineHeight: 1,
                          }}
                        >−</button>
                        <span style={{
                          fontSize: 20,
                          fontWeight: 800,
                          fontFamily: 'Schibsted Grotesk, sans-serif',
                          color: tgManual ? 'rgb(var(--primary))' : 'rgb(var(--textp))',
                          minWidth: 20,
                          textAlign: 'center',
                        }}>{predTotalGoals ?? (h + a)}</span>
                        <button
                          onClick={() => { const cur = predTotalGoals ?? (h + a); setTgManual(true); setPredTotalGoals(Math.min(30, cur + 1)) }}
                          style={{
                            width: 28, height: 24, borderRadius: 6,
                            border: '1px solid rgb(var(--border))',
                            background: 'rgb(var(--surface3))',
                            fontSize: 15, fontWeight: 700, cursor: 'pointer',
                            color: 'rgb(var(--textp))', lineHeight: 1,
                          }}
                        >+</button>
                      </div>
                      <div style={{
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.13em',
                        fontWeight: 600,
                        color: 'rgb(var(--faint))',
                      }}>Total goals</div>
                    </div>

                    {/* BTTS */}
                    <div
                      onClick={() => { setBttsManual(true); setPredBtts(!(predBtts ?? (h > 0 && a > 0))) }}
                      style={{
                        background: 'rgb(var(--surface2))',
                        border: `1px solid ${bttsManual ? 'rgba(var(--primary),0.5)' : 'rgb(var(--border))'}`,
                        borderRadius: 12,
                        padding: 11,
                        textAlign: 'center',
                        cursor: 'pointer',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        minHeight: 80,
                      }}
                    >
                      {bttsManual && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setBttsManual(false); setPredBtts(h > 0 && a > 0) }}
                          title="Reset to auto"
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'rgb(var(--primary))',
                            background: 'rgba(var(--primary),0.12)',
                            border: 'none',
                            borderRadius: 4,
                            padding: '1px 5px',
                            cursor: 'pointer',
                            lineHeight: 1.6,
                          }}
                        >auto</button>
                      )}
                      <div style={{
                        fontSize: 20,
                        fontWeight: 800,
                        fontFamily: 'Schibsted Grotesk, sans-serif',
                        color: (predBtts ?? (h > 0 && a > 0)) ? 'rgb(var(--primary))' : 'rgb(var(--textp))',
                      }}>{(predBtts ?? (h > 0 && a > 0)) ? 'Yes' : 'No'}</div>
                      <div style={{
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.13em',
                        fontWeight: 600,
                        color: 'rgb(var(--faint))',
                      }}>BTTS</div>
                    </div>

                    {/* Goal diff stepper (only when allowGdManual) */}
                    <div style={{
                      background: 'rgb(var(--surface2))',
                      border: `1px solid ${gdManual && allowGdManual ? 'rgba(var(--primary),0.5)' : 'rgb(var(--border))'}`,
                      borderRadius: 12,
                      padding: '10px 8px',
                      textAlign: 'center',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      {gdManual && allowGdManual && (
                        <button
                          onClick={() => { setGdManual(false); setPredGoalDiff(h - a) }}
                          title="Reset to auto"
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'rgb(var(--primary))',
                            background: 'rgba(var(--primary),0.12)',
                            border: 'none',
                            borderRadius: 4,
                            padding: '1px 5px',
                            cursor: 'pointer',
                            lineHeight: 1.6,
                          }}
                        >auto</button>
                      )}
                      {allowGdManual ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => { const cur = predGoalDiff ?? (h - a); setGdManual(true); setPredGoalDiff(cur - 1) }}
                            style={{
                              width: 28, height: 24, borderRadius: 6,
                              border: '1px solid rgb(var(--border))',
                              background: 'rgb(var(--surface3))',
                              fontSize: 15, fontWeight: 700, cursor: 'pointer',
                              color: 'rgb(var(--textp))', lineHeight: 1,
                            }}
                          >−</button>
                          <span style={{
                            fontSize: 20,
                            fontWeight: 800,
                            fontFamily: 'Schibsted Grotesk, sans-serif',
                            color: gdManual ? 'rgb(var(--primary))' : 'rgb(var(--textp))',
                            minWidth: 24,
                            textAlign: 'center',
                          }}>{predGoalDiff ?? (h - a)}</span>
                          <button
                            onClick={() => { const cur = predGoalDiff ?? (h - a); setGdManual(true); setPredGoalDiff(cur + 1) }}
                            style={{
                              width: 28, height: 24, borderRadius: 6,
                              border: '1px solid rgb(var(--border))',
                              background: 'rgb(var(--surface3))',
                              fontSize: 15, fontWeight: 700, cursor: 'pointer',
                              color: 'rgb(var(--textp))', lineHeight: 1,
                            }}
                          >+</button>
                        </div>
                      ) : (
                        <div style={{
                          fontSize: 20,
                          fontWeight: 800,
                          fontFamily: 'Schibsted Grotesk, sans-serif',
                          color: 'rgb(var(--textp))',
                        }}>{predGoalDiff ?? (h - a)}</div>
                      )}
                      <div style={{
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.13em',
                        fontWeight: 600,
                        color: 'rgb(var(--faint))',
                      }}>Goal diff</div>
                    </div>
                  </div>
                )}

                {/* First goal team +2 */}
                <div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'rgb(var(--texts))',
                    marginBottom: 8,
                  }}>
                    First goal team <span style={{ color: 'rgb(var(--primary))' }}>+{POINTS.firstTeam}</span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 9,
                  }}>
                    {[
                      { id: match.home_team, label: home?.name ?? 'Home' },
                      { id: null, label: 'No goal' },
                      { id: match.away_team, label: away?.name ?? 'Away' },
                    ].map((opt) => {
                      const active = firstTeam === opt.id
                      return (
                        <button
                          key={String(opt.id)}
                          onClick={() => setFirstTeam(opt.id)}
                          style={{
                            height: 42,
                            borderRadius: 11,
                            fontSize: 13,
                            fontWeight: active ? 700 : 600,
                            border: `1px solid ${active ? 'rgb(var(--primary))' : 'rgb(var(--border))'}`,
                            background: active ? 'rgba(var(--primary),0.12)' : 'rgb(var(--surface2))',
                            color: active ? 'rgb(var(--primary))' : 'rgb(var(--texts))',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* First scorer +4 */}
                {players.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'rgb(var(--texts))',
                      marginBottom: 8,
                    }}>
                      First scorer <span style={{ color: 'rgb(var(--primary))' }}>+{POINTS.firstScorer} pts</span>
                    </div>

                    {/* Search input */}
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <span style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'rgb(var(--faint))',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                        <SearchIcon size={14} />
                      </span>
                      <input
                        type="text"
                        placeholder="Search players…"
                        value={scorerQuery}
                        onChange={(e) => setScorerQuery(e.target.value)}
                        style={{
                          width: '100%',
                          height: 40,
                          padding: '0 12px 0 36px',
                          borderRadius: 11,
                          border: '1px solid rgb(var(--border))',
                          background: 'rgb(var(--surface2))',
                          fontSize: 13,
                          color: 'rgb(var(--textp))',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Player grid — no scroll, show all */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3,1fr)',
                      gap: 8,
                    }}>
                      {scorerPool.map((p) => {
                        const isOg = p.id === SCORER_OG
                        const isNone = p.id === SCORER_NONE
                        const isSpecial = isOg || isNone
                        const selected = isNone ? scorerId === 'none' : scorerId === p.id
                        const isHome = p.team_code === match.home_team
                        const teamCode = isSpecial ? '' : (isHome ? match.home_team : match.away_team)
                        function handleClick() {
                          if (isNone) setScorerId('none')
                          else setScorerId(p.id)
                        }
                        return (
                          <button
                            key={p.id}
                            onClick={handleClick}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 7,
                              padding: '12px 6px',
                              borderRadius: 13,
                              border: `1.5px solid ${selected ? 'rgb(var(--primary))' : 'rgb(var(--border))'}`,
                              background: selected ? 'rgba(var(--primary),0.10)' : 'rgb(var(--surface2))',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {/* Jersey circle or icon */}
                            <div style={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: selected ? 'rgb(var(--primary))' : 'rgb(var(--surface3))',
                              color: selected ? 'rgb(4,38,20)' : 'rgb(var(--texts))',
                            }}>
                              {isOg ? (
                                <span style={{ fontSize: 20 }}>⚽</span>
                              ) : (
                                <span style={{
                                  fontSize: 16,
                                  fontWeight: 800,
                                  fontFamily: 'Schibsted Grotesk, sans-serif',
                                }}>{isSpecial ? '—' : (p.jersey_number ?? '–')}</span>
                              )}
                            </div>
                            {/* Flag */}
                            {teamCode && <FlagChip code={teamCode} w={18} h={12} r={2} />}
                            {/* Name */}
                            <span style={{
                              fontSize: 11.5,
                              fontWeight: 700,
                              textAlign: 'center',
                              color: 'rgb(var(--textp))',
                              lineHeight: 1.2,
                            }}>{p.name}</span>
                            {/* Team abbrev */}
                            {teamCode && (
                              <span style={{
                                fontSize: 8.5,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                fontWeight: 600,
                                color: 'rgb(var(--faint))',
                              }}>{teamCode}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {scorerPool.length === 0 && (
                      <p style={{ textAlign: 'center', fontSize: 12, color: 'rgb(var(--faint))', padding: '12px 0' }}>
                        No players match your search.
                      </p>
                    )}
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={submit}
                  disabled={h == null || a == null || saving}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 13,
                    background: 'rgb(var(--primary))',
                    color: 'rgb(4,38,20)',
                    fontSize: 14,
                    fontWeight: 700,
                    marginTop: 4,
                    cursor: h == null || a == null || saving ? 'not-allowed' : 'pointer',
                    border: 'none',
                    opacity: h == null || a == null || saving ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {saving ? 'Saving…' : isEditing ? 'Update prediction' : 'Lock in full prediction'}
                </button>
              </div>
            )}

            {/* ── LOCKED / SETTLED STATE — also shown pre-game when reveal is on ── */}
            {(locked || revealPre) && (
              <div style={{
                padding: '18px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                {/* Pre-game reveal notice */}
                {revealPre && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'rgb(var(--texts))',
                    background: 'rgb(var(--surface2))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 10,
                    padding: '8px 11px',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    This league reveals picks before kickoff — everyone&apos;s predictions are visible now.
                  </div>
                )}

                {/* Summary pills row */}
                {others.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{
                      background: 'rgb(var(--surface2))',
                      border: '1px solid rgb(var(--border))',
                      borderRadius: 11,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <div style={{ width: 12, height: 12, background: 'rgb(var(--blue))', borderRadius: 3, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--texts))' }}>Most picked</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))' }}>{consensusScore}</span>
                    </div>
                    <div style={{
                      background: 'rgb(var(--surface2))',
                      border: '1px solid rgb(var(--border))',
                      borderRadius: 11,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <div style={{ width: 12, height: 12, background: 'rgb(var(--gold))', borderRadius: 3, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgb(var(--texts))' }}>Top scorer pick</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgb(var(--textp))' }}>{consensusScorerName}</span>
                    </div>
                  </div>
                )}

                {/* League predictions header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--textp))' }}>League predictions</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgb(var(--texts))',
                    background: 'rgb(var(--surface2))',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 6,
                    padding: '2px 7px',
                  }}>{others.length}</span>
                </div>

                {/* Prediction rows */}
                {others.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {[...others].sort((oa, ob) => {
                      const pa = oa.points_awarded != null ? weightedMatchPoints(oa, weights) : -Infinity
                      const pb = ob.points_awarded != null ? weightedMatchPoints(ob, weights) : -Infinity
                      return pb - pa
                    }).map((o) => {
                      const isYou = o.user_id === userId
                      const scorerP = players.find((p) => p.id === o.pred_first_scorer_id)
                      const scorerLabel = o.pred_no_scorer ? 'No scorer' : o.pred_first_scorer_id === -1 ? 'Own goal' : scorerP ? scorerP.name : '—'
                      const totalGoals = o.pred_total_goals ?? (o.pred_home + o.pred_away)
                      const goalDiff = o.pred_goal_diff ?? (o.pred_home - o.pred_away)
                      const effectiveBtts = o.pred_btts ?? (o.pred_home > 0 && o.pred_away > 0)
                      const btts = effectiveBtts ? 'Yes' : 'No'
                      const pts = o.points_awarded != null ? weightedMatchPoints(o, weights) : null
                      const ptsColor = pts == null
                        ? 'rgb(var(--texts))'
                        : pts >= 8
                          ? 'rgb(var(--success))'
                          : pts > 0
                            ? 'rgb(var(--gold))'
                            : 'rgb(var(--faint))'
                      const ptsText = pts != null ? `${pts > 0 ? '+' : ''}${pts}` : '—'
                      return (
                        <div
                          key={o.user_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 11,
                            padding: '10px 12px',
                            borderRadius: 12,
                            background: isYou ? 'rgba(var(--primary),0.10)' : 'transparent',
                            border: `1px solid ${isYou ? 'rgba(var(--primary),0.3)' : 'rgb(var(--border))'}`,
                          }}
                        >
                          {/* Avatar */}
                          <Av name={o.profiles?.username ?? '?'} src={o.profiles?.avatar_url} you={isYou} size={30} />

                          {/* Name + YOU badge + scorer */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'rgb(var(--textp))',
                            }}>
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>{o.profiles?.username ?? 'Player'}</span>
                              {isYou && (
                                <span style={{
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  color: 'rgb(var(--primary))',
                                  background: 'rgba(var(--primary),0.15)',
                                  padding: '2px 6px',
                                  borderRadius: 999,
                                  flexShrink: 0,
                                }}>YOU</span>
                              )}
                            </div>
                            <div style={{
                              fontSize: 10.5,
                              color: 'rgb(var(--texts))',
                              marginTop: 1,
                            }}>
                              TG {totalGoals} · GD {goalDiff > 0 ? `+${goalDiff}` : goalDiff} · BTTS {btts} · ⚽ {scorerLabel}
                            </div>
                            {(() => {
                              const fgt = o.pred_first_goal_team
                              if (!fgt) return null
                              const fgtTeam = getTeam(fgt)
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                  <FlagChip code={fgt} w={14} h={10} r={2} />
                                  <span style={{ fontSize: 10.5, color: 'rgb(var(--texts))' }}>
                                    First team: <span style={{ fontWeight: 600, color: 'rgb(var(--textp))' }}>{fgtTeam?.name ?? fgt}</span>
                                  </span>
                                </div>
                              )
                            })()}
                          </div>

                          {/* Mini scoreline */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <FlagChip code={match.home_team} w={18} h={12} r={3} />
                            <span style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: 'rgb(var(--textp))',
                            }}>{o.pred_home}–{o.pred_away}</span>
                            <FlagChip code={match.away_team} w={18} h={12} r={3} />
                          </div>

                          {/* Points */}
                          <span style={{
                            width: 46,
                            textAlign: 'right',
                            fontSize: 13,
                            fontWeight: 700,
                            color: scored ? ptsColor : 'rgb(var(--texts))',
                            flexShrink: 0,
                          }}>{ptsText}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'rgb(var(--texts))',
                    padding: '24px 0',
                  }}>No predictions made yet.</p>
                )}
              </div>
            )}
          </>
        )}
    </DialogShell>
  )
}
