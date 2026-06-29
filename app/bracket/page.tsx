'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam, TEAMS } from '@/lib/teams'
import { Skeleton, EmptyState, TrophyIcon, Countdown, LockIcon } from '@/components/ui'
// Suspense removed — wrapping a useEffect-based component has no effect
import FlagChip from '@/components/FlagChip'
import { getActiveLeague } from '@/lib/league'
import { TOURNAMENT_POINTS } from '@/lib/scoring'
import ThemeToggle from '@/components/ThemeToggle'
import { useUrlState } from '@/lib/url-state'
import { TeamLink } from '@/components/TeamLink'

/* ---------- types ---------- */
interface TournamentPred {
  champion: string | null
  runner_up: string | null
  semi: string[]
  quarter: string[]
  r32: string[]
}

type BracketPhase = 'pre' | 'r32'
const EMPTY_PRED: TournamentPred = { champion: null, runner_up: null, semi: [], quarter: [], r32: [] }
const ALL_TEAMS = Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name))

// Fixed R32 bracket matchups — position determines who meets who in R16, QF, SF, Final
// slots 0&1 → R16[0], slots 2&3 → R16[1], R16[0]&R16[1] → QF[0], etc.
const R32_FIXTURES: readonly [string, string][] = [
  ['GER', 'PAR'], // 0   Left half
  ['FRA', 'SWE'], // 1
  ['RSA', 'CAN'], // 2
  ['NED', 'MAR'], // 3
  ['POR', 'CRO'], // 4
  ['ESP', 'AUT'], // 5
  ['USA', 'BIH'], // 6
  ['BEL', 'SEN'], // 7
  ['BRA', 'JPN'], // 8   Right half
  ['CIV', 'NOR'], // 9
  ['MEX', 'ECU'], // 10
  ['ENG', 'COD'], // 11
  ['ARG', 'CPV'], // 12
  ['AUS', 'EGY'], // 13
  ['SUI', 'ALG'], // 14
  ['COL', 'GHA'], // 15
] as const

interface BracketResults {
  champion: string | null
  runner_up: string | null
  semi: string[]
  quarter: string[]
  r32: string[]  // 16 teams that advanced from R32 (stored as top16 in bracket_results table)
  settled: boolean
}

/* ---------- inline-style helpers ---------- */
const EB: React.CSSProperties = {
  fontSize: '10.5px',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  fontWeight: 600,
}

/* ---------- SVG icons ---------- */
function TrophySVG({ size = 38, color = 'rgb(var(--gold))' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 18h6M10 18v-3M14 18v-3M8 21h8" />
    </svg>
  )
}

function MedalSVG({ size = 22, color = 'rgb(var(--texts))' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14" r="6" />
      <path d="M8 2h8M9 2l-2 5M15 2l2 5" />
      <path d="M12 10v4l2 2" />
    </svg>
  )
}

function CheckSVG() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--primary))"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

function InfoSVG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgb(var(--primary))"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="0.6" fill="rgb(var(--primary))" stroke="none" />
    </svg>
  )
}

/* ---------- compute points secured from user picks + results ---------- */
function computePoints(pred: TournamentPred, results: BracketResults): { secured: number; possible: number } {
  let secured = 0
  const possible =
    TOURNAMENT_POINTS.r32 * 16 +
    TOURNAMENT_POINTS.quarter * 8 +
    TOURNAMENT_POINTS.semi * 4 +
    TOURNAMENT_POINTS.runner_up +
    TOURNAMENT_POINTS.champion

  if (results.settled) {
    for (const code of pred.r32) {
      if (results.r32.includes(code)) secured += TOURNAMENT_POINTS.r32
    }
    for (const code of pred.quarter) {
      if (results.quarter.includes(code)) secured += TOURNAMENT_POINTS.quarter
    }
    for (const code of pred.semi) {
      if (results.semi.includes(code)) secured += TOURNAMENT_POINTS.semi
    }
    if (pred.runner_up && results.runner_up && pred.runner_up === results.runner_up)
      secured += TOURNAMENT_POINTS.runner_up
    if (pred.champion && results.champion && pred.champion === results.champion)
      secured += TOURNAMENT_POINTS.champion
  }

  return { secured, possible }
}

/* ---------- bracket diagram helpers ---------- */
type BracketMatchup = {
  topCode: string | null
  botCode: string | null
  winnerCode?: string | null
}

// Build bracket matchups from user picks (8 QF teams -> 4 SFs -> 2 finalists -> champion)
// We show the user's picks in the bracket
function buildBracketMatchups(pred: TournamentPred): {
  qf: BracketMatchup[]
  sf: BracketMatchup[]
  fin: BracketMatchup
} {
  const quarter = pred.quarter.slice(0, 8)
  while (quarter.length < 8) quarter.push(null as unknown as string)

  const qf: BracketMatchup[] = [
    { topCode: quarter[0] ?? null, botCode: quarter[1] ?? null, winnerCode: pred.semi[0] ?? null },
    { topCode: quarter[2] ?? null, botCode: quarter[3] ?? null, winnerCode: pred.semi[1] ?? null },
    { topCode: quarter[4] ?? null, botCode: quarter[5] ?? null, winnerCode: pred.semi[2] ?? null },
    { topCode: quarter[6] ?? null, botCode: quarter[7] ?? null, winnerCode: pred.semi[3] ?? null },
  ]

  const semis = pred.semi.slice(0, 4)
  while (semis.length < 4) semis.push(null as unknown as string)

  const sf: BracketMatchup[] = [
    { topCode: semis[0] ?? null, botCode: semis[1] ?? null, winnerCode: null },
    { topCode: semis[2] ?? null, botCode: semis[3] ?? null, winnerCode: null },
  ]

  const leftFinalist = [pred.champion, pred.runner_up].find((code) => code && (semis[0] === code || semis[1] === code)) ?? null
  const rightFinalist = [pred.champion, pred.runner_up].find((code) => code && (semis[2] === code || semis[3] === code)) ?? null
  sf[0].winnerCode = leftFinalist
  sf[1].winnerCode = rightFinalist

  const fin: BracketMatchup = {
    topCode: leftFinalist,
    botCode: rightFinalist,
    winnerCode: pred.champion ?? null,
  }

  return { qf, sf, fin }
}

/* ---------- bracket card (small) ---------- */
function BracketTeamRow({
  code, isWinner, hasBorder,
}: { code: string | null; isWinner: boolean; hasBorder: boolean }) {
  const team = code ? getTeam(code) : null
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 0',
      borderBottom: hasBorder ? '1px solid rgba(var(--border),0.6)' : 'none',
    }}>
      {code
        ? <FlagChip code={code} w={20} h={14} r={3} />
        : <span style={{ display: 'inline-block', width: 20, height: 14, borderRadius: 3, background: 'rgb(var(--surface3))', flexShrink: 0 }} />
      }
      <span style={{
        fontSize: '12.5px',
        fontWeight: 700,
        fontFamily: 'Schibsted Grotesk, sans-serif',
        color: isWinner ? 'rgb(var(--primary))' : 'rgb(var(--faint))',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {team ? (team.code) : 'TBD'}
      </span>
      {isWinner && code && <CheckSVG />}
    </div>
  )
}

function SmallBracketCard({
  matchup, isFinal, top, left,
}: { matchup: BracketMatchup; isFinal: boolean; top: number; left: number }) {
  return (
    <div style={{
      position: 'absolute',
      top,
      left,
      width: 170,
      height: 64,
      background: 'rgb(var(--surface2))',
      border: `1px solid ${isFinal ? 'rgba(var(--gold),0.4)' : 'rgb(var(--border))'}`,
      borderRadius: 11,
      padding: '0 11px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
      <BracketTeamRow
        code={matchup.topCode}
        isWinner={!!(matchup.winnerCode && matchup.winnerCode === matchup.topCode)}
        hasBorder
      />
      <BracketTeamRow
        code={matchup.botCode}
        isWinner={!!(matchup.winnerCode && matchup.winnerCode === matchup.botCode)}
        hasBorder={false}
      />
    </div>
  )
}

/* ---------- correctness badge ---------- */
function CorrectnessBadge({ code, settled, correct }: { code: string | null; settled: boolean; correct: boolean | null }) {
  if (!settled || code === null) {
    return (
      <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgb(var(--texts))' }}>+{TOURNAMENT_POINTS.quarter}</span>
    )
  }
  if (correct) {
    return (
      <span style={{
        fontSize: '10.5px',
        fontWeight: 700,
        color: 'rgb(var(--primary))',
        background: 'rgba(var(--primary),0.14)',
        padding: '4px 9px',
        borderRadius: 999,
      }}>
        ✓ +{TOURNAMENT_POINTS.quarter}
      </span>
    )
  }
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgb(var(--coral))' }}>✕ 0</span>
  )
}

function SemiCorrectnessBadge({ code, settled, correct }: { code: string | null; settled: boolean; correct: boolean | null }) {
  if (!settled || code === null) {
    return <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgb(var(--texts))' }}>+{TOURNAMENT_POINTS.semi}</span>
  }
  if (correct) {
    return (
      <span style={{
        fontSize: '10.5px',
        fontWeight: 700,
        color: 'rgb(var(--primary))',
        background: 'rgba(var(--primary),0.14)',
        padding: '4px 9px',
        borderRadius: 999,
      }}>
        ✓ +{TOURNAMENT_POINTS.semi}
      </span>
    )
  }
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgb(var(--coral))' }}>✕ 0</span>
  )
}

/* ---------- main inner component ---------- */
function BracketPageInner() {
  const supabase = useMemo(() => createClient(), [])
  const { searchParams, replaceUrl } = useUrlState()
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<BracketPhase>(searchParams.get('phase') === 'pre' ? 'pre' : 'r32')
  const [predsByPhase, setPredsByPhase] = useState<Record<BracketPhase, TournamentPred>>({
    pre: EMPTY_PRED,
    r32: EMPTY_PRED,
  })
  const [realResults, setRealResults] = useState<{ r32: string[]; quarter: string[]; semi: string[]; runner_up: string | null; champion: string | null }>({ r32: [], quarter: [], semi: [], runner_up: null, champion: null })
  const [draft, setDraft] = useState<TournamentPred>(EMPTY_PRED)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bracketResults, setBracketResults] = useState<BracketResults>({ champion: null, runner_up: null, semi: [], quarter: [], r32: [], settled: false })
  // Phase deadlines: 'pre' locks at the tournament's first kickoff, 'r32' at the
  // first knockout kickoff. Mirrors the DB-level write guard.
  const [deadlines, setDeadlines] = useState<{ pre: string | null; r32: string | null }>({ pre: null, r32: null })

  useEffect(() => {
    setPhase(searchParams.get('phase') === 'pre' ? 'pre' : 'r32')
  }, [searchParams])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Load active league context
      await getActiveLeague(supabase, user.id)

      // Pre-tournament phase locks at the first match; r32 has no auto-deadline
      // (admin controls it via bracket_enabled on the league).
      const { data: mData } = await supabase
        .from('matches')
        .select('match_date')
        .order('match_date')
        .limit(1)
      const allMatches = (mData as { match_date: string }[] | null) ?? []
      setDeadlines({
        pre: allMatches.length ? allMatches[0].match_date : null,
        r32: null,
      })

      // Load tournament predictions for both phases (include scored pts columns)
      const { data: predData } = await supabase
        .from('tournament_predictions')
        .select('phase, champion, runner_up, semi, quarter, r32, pts_champion, pts_runner_up, pts_semi, pts_quarter, pts_r32')
        .eq('user_id', user.id)
        .in('phase', ['pre', 'r32'])

      if (predData) {
        const next: Record<BracketPhase, TournamentPred> = {
          pre: EMPTY_PRED,
          r32: EMPTY_PRED,
        }
        for (const row of predData as Record<string, unknown>[]) {
          const rowPhase = row.phase === 'r32' ? 'r32' : 'pre'
          next[rowPhase] = {
            champion: (row.champion as string) ?? null,
            runner_up: (row.runner_up as string) ?? null,
            semi: (row.semi as string[]) ?? [],
            quarter: (row.quarter as string[]) ?? [],
            r32: (row.r32 as string[]) ?? [],
          }
        }
        setPredsByPhase(next)
        setDraft(next.r32)
      }

      // Load real bracket results (set by admin in bracket_results table).
      // Also check if this user's pts columns have been populated by score-tournament.
      const r32Row = predData?.find((r: Record<string, unknown>) => r.phase === 'r32') as Record<string, unknown> | undefined
      const hasScoring = r32Row && (r32Row.pts_champion != null || r32Row.pts_r32 != null || r32Row.pts_quarter != null)

      const { data: brData } = await supabase
        .from('bracket_results')
        .select('champion, runner_up, semi, quarter, top16')
        .eq('id', 'wc2026')
        .maybeSingle()

      const br = brData as Record<string, unknown> | null
      const brChampion = br?.champion as string | null ?? null
      const brRunnerUp = br?.runner_up as string | null ?? null
      const brSemi = (br?.semi as string[]) ?? []
      const brQuarter = (br?.quarter as string[]) ?? []
      const brR32 = (br?.top16 as string[]) ?? []

      const settled = !!hasScoring || !!(brChampion || brRunnerUp || brSemi.length > 0 || brR32.length > 0)

      setBracketResults({ champion: brChampion, runner_up: brRunnerUp, semi: brSemi, quarter: brQuarter, r32: brR32, settled })
      setRealResults({ r32: brR32, quarter: brQuarter, semi: brSemi, runner_up: brRunnerUp, champion: brChampion })

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setDraft(predsByPhase[phase] ?? EMPTY_PRED)
    setSaveMsg(null)
  }, [phase, predsByPhase])

  const pred = draft
  const phaseDeadline = deadlines[phase]
  const locked = phaseDeadline != null && new Date(phaseDeadline) <= new Date()
  const { secured, possible } = computePoints(pred, bracketResults)
  const { qf, sf, fin } = buildBracketMatchups(pred)
  const hasAnyPhaseData = Object.values(predsByPhase).some((p) => p.champion || p.runner_up || p.semi.length > 0 || p.quarter.length > 0 || p.r32.length > 0)
  const phaseSaved = predsByPhase[phase]
  const isDirty = JSON.stringify(draft) !== JSON.stringify(phaseSaved)

  const championTeam = pred.champion ? getTeam(pred.champion) : null
  const runnerUpTeam = pred.runner_up ? getTeam(pred.runner_up) : null

  function toggleCode(key: 'r32' | 'quarter' | 'semi', code: string, max: number) {
    if (locked) return
    setDraft((prev) => {
      const cur = prev[key]
      const next = cur.includes(code)
        ? cur.filter((c) => c !== code)
        : cur.length < max
        ? [...cur, code]
        : cur
      const nextDraft = { ...prev, [key]: next }
      if (key === 'r32') {
        // R32 picks constrain everything downstream
        nextDraft.quarter = nextDraft.quarter.filter((c) => next.includes(c))
        nextDraft.semi = nextDraft.semi.filter((c) => nextDraft.quarter.includes(c))
        if (nextDraft.runner_up && !nextDraft.semi.includes(nextDraft.runner_up)) nextDraft.runner_up = null
        if (nextDraft.champion && !nextDraft.semi.includes(nextDraft.champion)) nextDraft.champion = null
      }
      if (key === 'quarter') {
        nextDraft.semi = nextDraft.semi.filter((c) => next.includes(c))
        if (nextDraft.runner_up && !nextDraft.semi.includes(nextDraft.runner_up)) nextDraft.runner_up = null
        if (nextDraft.champion && !nextDraft.semi.includes(nextDraft.champion)) nextDraft.champion = null
      }
      if (key === 'semi') {
        if (nextDraft.runner_up && !next.includes(nextDraft.runner_up)) nextDraft.runner_up = null
        if (nextDraft.champion && !next.includes(nextDraft.champion)) nextDraft.champion = null
      }
      return nextDraft
    })
  }

  async function saveBracket() {
    if (locked) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSaving(true)
    setSaveMsg(null)
    const payload: TournamentPred = {
      r32: draft.r32.slice(0, 16),
      quarter: draft.quarter.slice(0, 8),
      semi: draft.semi.slice(0, 4),
      runner_up: draft.runner_up,
      champion: draft.champion,
    }
    const { error } = await supabase.from('tournament_predictions').upsert({
      user_id: user.id,
      phase,
      r32: payload.r32,
      quarter: payload.quarter,
      semi: payload.semi,
      runner_up: payload.runner_up,
      champion: payload.champion,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,phase' })
    setSaving(false)
    if (error) {
      setSaveMsg(error.message)
      return
    }
    setPredsByPhase((prev) => ({ ...prev, [phase]: payload }))
    setSaveMsg('Saved')
    if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current)
    saveMsgTimer.current = setTimeout(() => setSaveMsg(null), 3000)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-40 rounded-[20px]" />
        <Skeleton className="h-24 rounded-[16px]" />
        <Skeleton className="h-32 rounded-[16px]" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottom: '1px solid rgb(var(--border))' }}>
        <div>
          <div style={{ ...EB, color: 'rgb(var(--primary))', marginBottom: 8 }}>Knockout picks</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', lineHeight: 1, margin: 0 }}>Bracket</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))' }}>
            {([
              { key: 'pre' as BracketPhase, label: 'Pre-tournament' },
              { key: 'r32' as BracketPhase, label: 'Post-group stage' },
            ]).map((option) => {
              const active = phase === option.key
              const phaseHasData = predsByPhase[option.key].champion || predsByPhase[option.key].runner_up || predsByPhase[option.key].semi.length > 0 || predsByPhase[option.key].quarter.length > 0 || predsByPhase[option.key].r32.length > 0
              return (
                <button
                  key={option.key}
                  onClick={() => {
                    setPhase(option.key)
                    replaceUrl({ phase: option.key === 'pre' ? null : option.key })
                  }}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'rgb(var(--textp))' : 'transparent',
                    color: active ? 'rgb(var(--bg))' : 'rgb(var(--texts))',
                    fontSize: '11px',
                    fontWeight: 700,
                    opacity: phaseHasData || active ? 1 : 0.6,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          {locked ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999,
              fontSize: '11px', fontWeight: 700, color: 'rgb(var(--coral))',
              background: 'rgba(var(--coral),0.12)', border: '1px solid rgba(var(--coral),0.25)', whiteSpace: 'nowrap',
            }}>
              <LockIcon size={11} /> Locked
            </span>
          ) : phaseDeadline ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999,
              fontSize: '11px', fontWeight: 700, color: 'rgb(var(--texts))',
              background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))', whiteSpace: 'nowrap',
            }}>
              Locks in <Countdown kickoff={phaseDeadline} />
            </span>
          ) : null}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: '11px',
            fontWeight: 700,
            color: 'rgb(var(--gold))',
            background: 'rgba(var(--gold),0.12)',
            border: '1px solid rgba(var(--gold),0.25)',
            whiteSpace: 'nowrap',
          }}>
            {secured} / {possible} pts secured
          </span>
          <ThemeToggle />
        </div>
      </div>

      {/* ── R32 phase: visual bracket picker ── */}
      {phase === 'r32' && (
        <BracketPickerR32
          saved={predsByPhase.r32}
          locked={locked}
          realResults={realResults}
          onSave={async (payload) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return { error: { message: 'Not signed in' } }
            const { error } = await supabase.from('tournament_predictions').upsert({
              user_id: user.id,
              phase: 'r32',
              r32: payload.r32,
              quarter: payload.quarter,
              semi: payload.semi,
              runner_up: payload.runner_up,
              champion: payload.champion,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,phase' })
            return { error: error ? { message: error.message } : null }
          }}
          onSaved={(payload) => {
            setPredsByPhase((prev) => ({ ...prev, r32: payload }))
          }}
        />
      )}

      {/* ── Pre phase: old tile-based picker ── */}
      {phase === 'pre' && (
      <div style={{
        background: 'rgb(var(--card))',
        border: '1px solid rgb(var(--border))',
        borderRadius: 18,
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Schibsted Grotesk, sans-serif' }}>
              Pre-tournament bracket
            </div>
            <div style={{ fontSize: 12, color: 'rgb(var(--texts))', marginTop: 3 }}>
              Pick who advances at each stage: R32 → R16 → QF → SF → Champion.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: draft.r32.length === 16 ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>
              R32 {draft.r32.length}/16
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: draft.quarter.length === 8 ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>
              R16 {draft.quarter.length}/8
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: draft.semi.length === 4 ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>
              QF {draft.semi.length}/4
            </span>
          </div>
        </div>

        {locked ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 14,
            padding: '14px 16px',
            background: 'rgba(var(--coral),0.08)',
            border: '1px solid rgba(var(--coral),0.25)',
            color: 'rgb(var(--coral))',
            fontSize: 13,
            fontWeight: 600,
          }}>
            <LockIcon size={16} />
            <span>The pre-tournament bracket is locked — the tournament has kicked off. Your picks below are final.</span>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PickerSection
              title="Round of 32 — who advances?"
              sub="Select 16 teams from the 32 qualified (+1 pt each)"
              selected={draft.r32}
              max={16}
              options={ALL_TEAMS.map((t) => t.code)}
              onToggle={(code) => toggleCode('r32', code, 16)}
            />
            <PickerSection
              title="Round of 16 — who reaches QF?"
              sub="Select 8 from your R32 picks (+2 pts each)"
              selected={draft.quarter}
              max={8}
              options={draft.r32}
              onToggle={(code) => toggleCode('quarter', code, 8)}
              emptyLabel="Pick R32 advancers first"
            />
            <PickerSection
              title="Quarter-finals — who reaches SF?"
              sub="Select 4 from your R16 picks (+3 pts each)"
              selected={draft.semi}
              max={4}
              options={draft.quarter}
              onToggle={(code) => toggleCode('semi', code, 4)}
              emptyLabel="Pick R16 advancers first"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SinglePickSection
              title="Finalist (+5 pts)"
              value={draft.runner_up}
              options={draft.semi}
              onSelect={(code) => setDraft((prev) => ({ ...prev, runner_up: code || null, champion: prev.champion === code ? null : prev.champion }))}
              emptyLabel="Pick semi-finalists first"
            />
            <SinglePickSection
              title="Champion (+10 pts)"
              value={draft.champion}
              options={draft.semi.filter((code) => code !== draft.runner_up)}
              onSelect={(code) => setDraft((prev) => ({ ...prev, champion: code || null }))}
              emptyLabel="Pick semi-finalists first"
            />
            <div style={{ background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))', borderRadius: 14, padding: '14px 15px' }}>
              <div style={{ ...EB, color: 'rgb(var(--texts))', marginBottom: 10 }}>Save bracket</div>
              <div style={{ fontSize: 12, color: 'rgb(var(--texts))', lineHeight: 1.5, marginBottom: 12 }}>
                Fill all stages to score: 16 R32 advancers, 8 R16 advancers, 4 QF advancers, finalist and champion.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={saveBracket}
                  disabled={saving || draft.r32.length !== 16 || draft.quarter.length !== 8 || draft.semi.length !== 4 || !draft.runner_up || !draft.champion}
                  style={{
                    height: 40,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: saving ? 'default' : 'pointer',
                    background: 'rgb(var(--primary))',
                    color: 'rgb(4,38,20)',
                    fontSize: 13,
                    fontWeight: 800,
                    opacity: saving || draft.r32.length !== 16 || draft.quarter.length !== 8 || draft.semi.length !== 4 || !draft.runner_up || !draft.champion ? 0.55 : 1,
                  }}
                >
                  {saving ? 'Saving…' : isDirty ? 'Save bracket' : 'Saved'}
                </button>
                <button
                  onClick={() => setDraft(phaseSaved)}
                  disabled={!isDirty || saving}
                  style={{
                    height: 40,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: '1px solid rgb(var(--border))',
                    background: 'rgb(var(--card))',
                    color: 'rgb(var(--textp))',
                    fontSize: 12.5,
                    fontWeight: 700,
                    opacity: !isDirty || saving ? 0.5 : 1,
                  }}
                >
                  Reset
                </button>
                {saveMsg && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: saveMsg === 'Saved' ? 'rgb(var(--primary))' : 'rgb(var(--coral))' }}>
                    {saveMsg === 'Saved' ? 'Saved' : saveMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      )}

      {/* ── Champion hero card ── */}
      {pred.champion ? (
        <div style={{
          borderRadius: 20,
          padding: 26,
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg,rgba(var(--gold),0.18),rgba(var(--gold),0.04))',
          border: '1px solid rgba(var(--gold),0.3)',
        }}>
          {/* Watermark trophy */}
          <div style={{ position: 'absolute', top: -40, right: -20, opacity: 0.10, color: 'rgb(var(--gold))', pointerEvents: 'none' }}>
            <TrophySVG size={200} color="currentColor" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 22, position: 'relative' }}>
            {/* Trophy icon box */}
            <div style={{
              width: 74,
              height: 74,
              borderRadius: 20,
              background: 'rgba(var(--gold),0.18)',
              color: 'rgb(var(--gold))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TrophySVG size={38} />
            </div>

            {/* Champion info */}
            <div style={{ flex: 1 }}>
              <div style={{ ...EB, color: 'rgb(var(--gold))' }}>Your champion pick</div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 13 }}>
                <FlagChip code={pred.champion} w={52} h={35} r={7} />
                <span style={{
                  fontSize: 30,
                  fontWeight: 800,
                  fontFamily: 'Schibsted Grotesk, sans-serif',
                  lineHeight: 1,
                }}>
                  {championTeam?.name ?? pred.champion}
                </span>
              </div>
            </div>

            {/* Points if win */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'rgb(var(--gold))', lineHeight: 1 }}>
                +{TOURNAMENT_POINTS.champion}
              </div>
              <div style={{ ...EB, color: 'rgb(var(--faint))', marginTop: 6 }}>if they win it</div>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<TrophyIcon size={22} />}
          title={`No ${phase === 'pre' ? 'pre-tournament' : 'post-group stage'} bracket yet`}
          desc={phase === 'pre'
            ? 'Lock in your tournament winner prediction before the first match kicks off.'
            : 'This reset bracket will appear after the group stage once picks are available.'}
        />
      )}

      {/* ── Runner-up row ── */}
      {pred.runner_up && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'rgb(var(--card))',
          border: '1px solid rgb(var(--border))',
          borderRadius: 16,
          padding: '18px 20px',
          transition: 'border-color 0.15s, transform 0.15s',
          cursor: 'default',
        }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(var(--primary),0.5)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgb(var(--border))'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          {/* Medal icon box */}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: 'rgb(var(--surface2))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <MedalSVG size={22} color="rgb(var(--texts))" />
          </div>

          <FlagChip code={pred.runner_up} w={42} h={28} r={6} />

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', lineHeight: 1.2 }}>
              {runnerUpTeam?.name ?? pred.runner_up}
            </div>
            <div style={{ fontSize: 12, color: 'rgb(var(--texts))', marginTop: 2 }}>Runner-up</div>
          </div>

          <div style={{ fontSize: 18, fontWeight: 800, color: 'rgb(var(--texts))', flexShrink: 0 }}>
            +{TOURNAMENT_POINTS.runner_up}
          </div>
        </div>
      )}

      {/* ── Semi-finalists ── */}
      {pred.semi.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...EB, color: 'rgb(var(--texts))' }}>Semi-finalists</div>
            <div style={{ ...EB, color: 'rgb(var(--primary))' }}>
              +{TOURNAMENT_POINTS.semi} each · {pred.semi.filter(c => bracketResults.semi.includes(c)).length * TOURNAMENT_POINTS.semi} pts
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {pred.semi.map((code, i) => {
              const team = code ? getTeam(code) : null
              const settled = bracketResults.settled
              const correct = settled ? bracketResults.semi.includes(code) : null
              const hasCorrect = correct === true
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  background: 'rgb(var(--card))',
                  borderRadius: 14,
                  padding: '15px 16px',
                  border: hasCorrect ? '1px solid rgba(var(--primary),0.3)' : '1px solid rgb(var(--border))',
                }}>
                  <FlagChip code={code} w={38} h={26} r={6} />
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {team?.name ?? code}
                  </span>
                  <SemiCorrectnessBadge code={code} settled={settled} correct={correct} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Quarter-finalists ── */}
      {pred.quarter.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ ...EB, color: 'rgb(var(--texts))' }}>Quarter-finalists</div>
            <div style={{ ...EB, color: 'rgb(var(--primary))' }}>
              +{TOURNAMENT_POINTS.quarter} each · {pred.quarter.filter(c => bracketResults.quarter.includes(c)).length * TOURNAMENT_POINTS.quarter} pts
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {pred.quarter.map((code, i) => {
              const team = code ? getTeam(code) : null
              const settled = bracketResults.settled
              const correct = settled ? bracketResults.quarter.includes(code) : null
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  background: 'rgb(var(--card))',
                  borderRadius: 14,
                  padding: '15px 16px',
                  border: correct === true ? '1px solid rgba(var(--primary),0.3)' : '1px solid rgb(var(--border))',
                }}>
                  <FlagChip code={code} w={36} h={24} r={5} />
                  <span style={{
                    fontSize: '14.5px',
                    fontWeight: 700,
                    fontFamily: 'Schibsted Grotesk, sans-serif',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: correct === false ? 'rgb(var(--coral))' : undefined,
                  }}>
                    {team?.name ?? code}
                  </span>
                  <CorrectnessBadge code={code} settled={settled} correct={correct} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Physical bracket card ── */}
      {(pred.champion || pred.runner_up || pred.semi.length > 0 || pred.quarter.length > 0) && (
        <div style={{
          background: 'rgb(var(--card))',
          border: '1px solid rgb(var(--border))',
          borderRadius: 18,
          padding: '20px 22px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Schibsted Grotesk, sans-serif' }}>Your bracket</div>
              <div style={{ fontSize: 12, color: 'rgb(var(--texts))', marginTop: 3 }}>How your knockout picks play out — winners advance →</div>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 11px',
              borderRadius: 999,
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgb(var(--gold))',
              background: 'rgba(var(--gold),0.13)',
              border: '1px solid rgba(var(--gold),0.25)',
              whiteSpace: 'nowrap',
            }}>
              Champion +{TOURNAMENT_POINTS.champion}
            </span>
          </div>

          {/* Bracket diagram */}
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ position: 'relative', width: 782, height: 380 }}>
              {/* Round labels */}
              {(['Quarter-finals', 'Semi-finals', 'Final', 'Champion'] as const).map((label, col) => (
                <div key={label} style={{
                  position: 'absolute',
                  left: col * 204,
                  top: 0,
                  width: 170,
                  ...EB,
                  color: 'rgb(var(--texts))',
                }}>
                  {label}
                </div>
              ))}

              {/* SVG connector lines */}
              <svg
                style={{ position: 'absolute', top: 0, left: 0, width: 782, height: 380, pointerEvents: 'none' }}
                viewBox="0 0 782 380"
              >
                {/* QF1 → SF1 */}
                <path d="M170 74 H187" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M170 156 H187" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M187 74 V156" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M187 115 H204" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                {/* QF2 → SF2 */}
                <path d="M170 238 H187" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M170 320 H187" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M187 238 V320" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M187 279 H204" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                {/* SF1+SF2 → Final */}
                <path d="M374 115 H391" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M374 279 H391" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M391 115 V279" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M391 197 H408" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                {/* Final → Champion */}
                <path d="M578 197 H612" stroke="rgb(var(--border))" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>

              {/* QF cards */}
              <SmallBracketCard matchup={qf[0]} isFinal={false} top={42} left={0} />
              <SmallBracketCard matchup={qf[1]} isFinal={false} top={124} left={0} />
              <SmallBracketCard matchup={qf[2]} isFinal={false} top={206} left={0} />
              <SmallBracketCard matchup={qf[3]} isFinal={false} top={288} left={0} />

              {/* SF cards */}
              <SmallBracketCard matchup={sf[0]} isFinal={false} top={83} left={204} />
              <SmallBracketCard matchup={sf[1]} isFinal={false} top={247} left={204} />

              {/* Final card */}
              <SmallBracketCard matchup={fin} isFinal top={165} left={408} />

              {/* Champion node */}
              <div style={{
                position: 'absolute',
                left: 612,
                top: 149,
                width: 170,
                height: 96,
                borderRadius: 15,
                background: 'linear-gradient(145deg,rgba(var(--gold),0.22),rgba(var(--gold),0.05))',
                border: '1px solid rgba(var(--gold),0.45)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}>
                <TrophySVG size={24} color="rgb(var(--gold))" />
                {pred.champion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <FlagChip code={pred.champion} w={28} h={19} r={4} />
                    <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Schibsted Grotesk, sans-serif' }}>
                      {championTeam?.name ?? pred.champion}
                    </span>
                  </div>
                )}
                {!pred.champion && (
                  <span style={{ fontSize: 12, color: 'rgb(var(--faint))' }}>TBD</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Real bracket results ── */}
      {(realResults.r32.length > 0 || realResults.quarter.length > 0 || realResults.champion) && (
        <div style={{
          background: 'rgb(var(--card))',
          border: '1px solid rgb(var(--border))',
          borderRadius: 18,
          padding: '18px 20px',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Schibsted Grotesk, sans-serif', marginBottom: 14 }}>
            Real results
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {realResults.champion && (
              <div>
                <div style={{ ...EB, color: 'rgb(var(--gold))', marginBottom: 6 }}>Champion</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FlagChip code={realResults.champion} w={28} h={19} r={4} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{getTeam(realResults.champion)?.name ?? realResults.champion}</span>
                  {pred.champion === realResults.champion && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgb(var(--primary))' }}>✓ +{TOURNAMENT_POINTS.champion} pts</span>}
                </div>
              </div>
            )}
            {realResults.runner_up && (
              <div>
                <div style={{ ...EB, color: 'rgb(var(--texts))', marginBottom: 6 }}>Runner-up</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FlagChip code={realResults.runner_up} w={24} h={16} r={3} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{getTeam(realResults.runner_up)?.name ?? realResults.runner_up}</span>
                  {pred.runner_up === realResults.runner_up && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgb(var(--primary))' }}>✓ +{TOURNAMENT_POINTS.runner_up} pts</span>}
                </div>
              </div>
            )}
            {realResults.semi.length > 0 && (
              <div>
                <div style={{ ...EB, color: 'rgb(var(--texts))', marginBottom: 6 }}>Semi-finalists</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {realResults.semi.map((code) => {
                    const hit = pred.semi.includes(code)
                    return (
                      <span key={code} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 9px', borderRadius: 999,
                        border: `1px solid ${hit ? 'rgba(var(--primary),0.3)' : 'rgb(var(--border))'}`,
                        background: hit ? 'rgba(var(--primary),0.08)' : 'rgb(var(--surface2))',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        <FlagChip code={code} w={18} h={12} r={2} />
                        {getTeam(code)?.name ?? code}
                        {hit && <span style={{ color: 'rgb(var(--primary))' }}>✓</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {realResults.quarter.length > 0 && (
              <div>
                <div style={{ ...EB, color: 'rgb(var(--texts))', marginBottom: 6 }}>Quarter-finalists (R16 advancers)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {realResults.quarter.map((code) => {
                    const hit = pred.quarter.includes(code)
                    return (
                      <span key={code} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 9px', borderRadius: 999,
                        border: `1px solid ${hit ? 'rgba(var(--primary),0.3)' : 'rgb(var(--border))'}`,
                        background: hit ? 'rgba(var(--primary),0.08)' : 'rgb(var(--surface2))',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        <FlagChip code={code} w={18} h={12} r={2} />
                        {getTeam(code)?.name ?? code}
                        {hit && <span style={{ color: 'rgb(var(--primary))' }}>✓</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {realResults.r32.length > 0 && (
              <div>
                <div style={{ ...EB, color: 'rgb(var(--texts))', marginBottom: 6 }}>R32 advancers (to R16)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {realResults.r32.map((code) => {
                    const hit = pred.r32.includes(code)
                    return (
                      <span key={code} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 9px', borderRadius: 999,
                        border: `1px solid ${hit ? 'rgba(var(--primary),0.3)' : 'rgb(var(--border))'}`,
                        background: hit ? 'rgba(var(--primary),0.08)' : 'rgb(var(--surface2))',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <FlagChip code={code} w={18} h={12} r={2} />
                        {getTeam(code)?.name ?? code}
                        {hit && <span style={{ color: 'rgb(var(--primary))' }}>✓</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Info banner + leaderboard link ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{
          flex: 1,
          background: 'rgba(var(--primary),0.07)',
          border: '1px solid rgba(var(--primary),0.2)',
          borderRadius: 14,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <InfoSVG size={18} />
          <p style={{ fontSize: 13, color: 'rgb(var(--textp))', margin: 0, lineHeight: 1.5 }}>
            {hasAnyPhaseData
              ? <>Bracket picks locked. <strong>{secured} of {possible} pts</strong> secured so far.</>
              : <>Bracket picks are not available yet for this phase.</>}
          </p>
        </div>
        <a href="/bracket-leaderboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 16px', borderRadius: 12,
          border: '1px solid rgb(var(--border))',
          background: 'rgb(var(--card))',
          color: 'rgb(var(--textp))',
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Standings →
        </a>
      </div>
    </div>
  )
}

/* ---------- bracket cascade helper ---------- */
function cascade(
  r32: (string | null)[],
  r16: (string | null)[],
  qf: (string | null)[],
  sf: (string | null)[],
  champ: string | null,
): { r16: (string | null)[]; qf: (string | null)[]; sf: (string | null)[]; champ: string | null } {
  const nr16 = r16.map((p, i) => (p && [r32[2 * i], r32[2 * i + 1]].includes(p) ? p : null))
  const nqf = qf.map((p, i) => (p && [nr16[2 * i], nr16[2 * i + 1]].includes(p) ? p : null))
  const nsf = sf.map((p, i) => (p && [nqf[2 * i], nqf[2 * i + 1]].includes(p) ? p : null))
  const nchamp = nsf.includes(champ) ? champ : null
  return { r16: nr16, qf: nqf, sf: nsf, champ: nchamp }
}

/* ---------- bracket match card ---------- */
function BracketMatchCard({
  team1, team2, winner, realWinner, onPick, locked,
}: {
  team1: string | null; team2: string | null
  winner: string | null; realWinner?: string | null
  onPick: (code: string) => void; locked?: boolean
}) {
  return (
    <div style={{ border: '1px solid rgb(var(--border))', borderRadius: 11, overflow: 'hidden', background: 'rgb(var(--card))' }}>
      {([team1, team2] as (string | null)[]).map((code, i) => {
        const team = code ? getTeam(code) : null
        const isWinner = !!code && winner === code
        const isLoser = !!winner && !!code && !isWinner
        const isActual = !!realWinner && realWinner === code
        return (
          <div
            key={i}
            onClick={() => !locked && code && team1 && team2 && onPick(code)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              background: isWinner ? 'rgba(var(--primary),0.10)' : 'transparent',
              borderBottom: i === 0 ? '1px solid rgba(var(--border),0.7)' : 'none',
              cursor: !locked && code && team1 && team2 ? 'pointer' : 'default',
              opacity: isLoser ? 0.38 : 1,
              transition: 'background 0.1s, opacity 0.1s',
              userSelect: 'none',
            }}
          >
            {code
              ? <FlagChip code={code} w={20} h={14} r={3} />
              : <span style={{ width: 20, height: 14, borderRadius: 3, background: 'rgb(var(--surface3))', display: 'inline-block', flexShrink: 0 }} />
            }
            <span style={{
              fontSize: 12, fontWeight: isWinner ? 800 : 600, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: isWinner ? 'rgb(var(--primary))' : isLoser ? 'rgb(var(--faint))' : 'rgb(var(--textp))',
            }}>
              {team?.name ?? (code ?? 'TBD')}
            </span>
            {isWinner && <CheckSVG />}
            {isActual && !isWinner && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgb(var(--gold))', background: 'rgba(var(--gold),0.15)', padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}>✓</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- bracket round header ---------- */
function RoundHeader({ label, done, total, pts }: { label: string; done: number; total: number; pts: number }) {
  const complete = done === total
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Schibsted Grotesk, sans-serif' }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: 'rgb(var(--primary))', background: 'rgba(var(--primary),0.12)',
          padding: '2px 7px', borderRadius: 999,
        }}>+{pts} each</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: complete ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>
        {done}/{total}
      </span>
    </div>
  )
}

/* ---------- bracket picker for r32 phase ---------- */
function BracketPickerR32({
  saved, locked, realResults,
  onSave, onSaved,
}: {
  saved: TournamentPred
  locked: boolean
  realResults: { r32: string[]; quarter: string[]; semi: string[]; runner_up: string | null; champion: string | null }
  onSave: (payload: TournamentPred) => Promise<{ error: { message: string } | null }>
  onSaved: (payload: TournamentPred) => void
}) {
  const [r32w, setR32w] = useState<(string | null)[]>(Array(16).fill(null))
  const [r16w, setR16w] = useState<(string | null)[]>(Array(8).fill(null))
  const [qfw, setQfw] = useState<(string | null)[]>(Array(4).fill(null))
  const [sfw, setSfw] = useState<(string | null)[]>(Array(2).fill(null))
  const [champ, setChamp] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const saveMsgRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load saved picks into positional state whenever saved changes
  useEffect(() => {
    const newR32 = R32_FIXTURES.map(([t1, t2]) =>
      saved.r32.find((t) => t === t1 || t === t2) ?? null,
    )
    const newR16 = Array(8).fill(null).map((_: null, i: number) => {
      const possible = [newR32[2 * i], newR32[2 * i + 1]]
      return saved.quarter.find((t) => possible.includes(t)) ?? null
    })
    const newQf = Array(4).fill(null).map((_: null, i: number) => {
      const possible = [newR16[2 * i], newR16[2 * i + 1]]
      return saved.semi.find((t) => possible.includes(t)) ?? null
    })
    const newSf: (string | null)[] = [
      [newQf[0], newQf[1]].find((t) => t && (t === saved.champion || t === saved.runner_up)) ?? null,
      [newQf[2], newQf[3]].find((t) => t && (t === saved.champion || t === saved.runner_up)) ?? null,
    ]
    setR32w(newR32)
    setR16w(newR16)
    setQfw(newQf)
    setSfw(newSf)
    setChamp(saved.champion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  function pickR32(slot: number, code: string) {
    if (locked) return
    const newR32 = [...r32w]
    newR32[slot] = newR32[slot] === code ? null : code
    const { r16, qf, sf, champ: nc } = cascade(newR32, r16w, qfw, sfw, champ)
    setR32w(newR32); setR16w(r16); setQfw(qf); setSfw(sf); setChamp(nc)
  }

  function pickR16(slot: number, code: string) {
    if (locked) return
    const newR16 = [...r16w]
    newR16[slot] = newR16[slot] === code ? null : code
    const { qf, sf, champ: nc } = cascade(r32w, newR16, qfw, sfw, champ)
    setR16w(newR16); setQfw(qf); setSfw(sf); setChamp(nc)
  }

  function pickQF(slot: number, code: string) {
    if (locked) return
    const newQf = [...qfw]
    newQf[slot] = newQf[slot] === code ? null : code
    const { sf, champ: nc } = cascade(r32w, r16w, newQf, sfw, champ)
    setQfw(newQf); setSfw(sf); setChamp(nc)
  }

  function pickSF(slot: number, code: string) {
    if (locked) return
    const newSf = [...sfw]
    newSf[slot] = newSf[slot] === code ? null : code
    const nc = newSf.includes(champ) ? champ : null
    setSfw(newSf); setChamp(nc)
  }

  function pickChamp(code: string) {
    if (locked) return
    setChamp((prev) => (prev === code ? null : code))
  }

  async function save() {
    setSaving(true)
    setSaveMsg(null)
    const runner_up = sfw.find((w) => w && w !== champ) ?? null
    const payload: TournamentPred = {
      r32: r32w.filter((x): x is string => x !== null),
      quarter: r16w.filter((x): x is string => x !== null),
      semi: qfw.filter((x): x is string => x !== null),
      runner_up,
      champion: champ,
    }
    const { error } = await onSave(payload)
    setSaving(false)
    if (error) { setSaveMsg(error.message); return }
    onSaved(payload)
    setSaveMsg('Saved')
    if (saveMsgRef.current) clearTimeout(saveMsgRef.current)
    saveMsgRef.current = setTimeout(() => setSaveMsg(null), 3000)
  }

  const r32done = r32w.filter(Boolean).length
  const r16done = r16w.filter(Boolean).length
  const qfdone = qfw.filter(Boolean).length
  const sfdone = sfw.filter(Boolean).length
  const finalDone = !!champ

  // Find real winner of each R32 match (for display)
  const realR32Winners = R32_FIXTURES.map(([t1, t2]) =>
    realResults.r32.includes(t1) ? t1 : realResults.r32.includes(t2) ? t2 : null,
  )
  const realR16Winners = Array(8).fill(null).map((_: null, i: number) => {
    const t1 = realR32Winners[2 * i], t2 = realR32Winners[2 * i + 1]
    return realResults.quarter.includes(t1 ?? '') ? t1 : realResults.quarter.includes(t2 ?? '') ? t2 : null
  })
  const realQFWinners = Array(4).fill(null).map((_: null, i: number) => {
    const t1 = realR16Winners[2 * i], t2 = realR16Winners[2 * i + 1]
    return realResults.semi.includes(t1 ?? '') ? t1 : realResults.semi.includes(t2 ?? '') ? t2 : null
  })
  const realSFWinners: (string | null)[] = [
    [realQFWinners[0], realQFWinners[1]].find((t) => t && (t === realResults.champion || t === realResults.runner_up)) ?? null,
    [realQFWinners[2], realQFWinners[3]].find((t) => t && (t === realResults.champion || t === realResults.runner_up)) ?? null,
  ]

  const canSave = !locked && !saving && r32done === 16 && r16done === 8 && qfdone === 4 && sfdone === 2 && finalDone

  const gridStyle: React.CSSProperties = { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {locked && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          borderRadius: 14, padding: '13px 16px',
          background: 'rgba(var(--coral),0.08)', border: '1px solid rgba(var(--coral),0.25)',
          color: 'rgb(var(--coral))', fontSize: 13, fontWeight: 600,
        }}>
          <LockIcon size={16} />
          <span>Bracket is locked — the knockout stage has begun. Your picks are final.</span>
        </div>
      )}

      {/* R32 */}
      <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 16, padding: '16px 18px' }}>
        <RoundHeader label="Round of 32" done={r32done} total={16} pts={TOURNAMENT_POINTS.r32} />
        <div style={gridStyle}>
          {R32_FIXTURES.map(([t1, t2], i) => (
            <BracketMatchCard
              key={i}
              team1={t1} team2={t2}
              winner={r32w[i]}
              realWinner={realR32Winners[i]}
              onPick={(code) => pickR32(i, code)}
              locked={locked}
            />
          ))}
        </div>
      </div>

      {/* R16 */}
      <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 16, padding: '16px 18px', opacity: r32done === 0 ? 0.5 : 1 }}>
        <RoundHeader label="Round of 16" done={r16done} total={8} pts={TOURNAMENT_POINTS.quarter} />
        <div style={gridStyle}>
          {Array(8).fill(null).map((_: null, i: number) => (
            <BracketMatchCard
              key={i}
              team1={r32w[2 * i]} team2={r32w[2 * i + 1]}
              winner={r16w[i]}
              realWinner={realR16Winners[i]}
              onPick={(code) => pickR16(i, code)}
              locked={locked}
            />
          ))}
        </div>
      </div>

      {/* QF */}
      <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 16, padding: '16px 18px', opacity: r16done === 0 ? 0.5 : 1 }}>
        <RoundHeader label="Quarter-Finals" done={qfdone} total={4} pts={TOURNAMENT_POINTS.semi} />
        <div style={gridStyle}>
          {Array(4).fill(null).map((_: null, i: number) => (
            <BracketMatchCard
              key={i}
              team1={r16w[2 * i]} team2={r16w[2 * i + 1]}
              winner={qfw[i]}
              realWinner={realQFWinners[i]}
              onPick={(code) => pickQF(i, code)}
              locked={locked}
            />
          ))}
        </div>
      </div>

      {/* SF */}
      <div style={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 16, padding: '16px 18px', opacity: qfdone === 0 ? 0.5 : 1 }}>
        <RoundHeader label="Semi-Finals" done={sfdone} total={2} pts={TOURNAMENT_POINTS.runner_up} />
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          {Array(2).fill(null).map((_: null, i: number) => (
            <BracketMatchCard
              key={i}
              team1={qfw[2 * i]} team2={qfw[2 * i + 1]}
              winner={sfw[i]}
              realWinner={realSFWinners[i]}
              onPick={(code) => pickSF(i, code)}
              locked={locked}
            />
          ))}
        </div>
      </div>

      {/* Final + Champion */}
      <div style={{
        borderRadius: 16, padding: '16px 18px',
        background: 'linear-gradient(135deg,rgba(var(--gold),0.15),rgba(var(--gold),0.04))',
        border: '1px solid rgba(var(--gold),0.35)',
        opacity: sfdone === 0 ? 0.5 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrophySVG size={18} />
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Schibsted Grotesk, sans-serif' }}>Final — pick the champion</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--gold))', background: 'rgba(var(--gold),0.15)', padding: '2px 7px', borderRadius: 999 }}>+{TOURNAMENT_POINTS.champion}</span>
          </div>
          {finalDone && <CheckSVG />}
        </div>
        <div style={{ maxWidth: 280 }}>
          <BracketMatchCard
            team1={sfw[0]} team2={sfw[1]}
            winner={champ}
            realWinner={realResults.champion}
            onPick={pickChamp}
            locked={locked}
          />
        </div>
      </div>

      {/* Save */}
      {!locked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              height: 42, padding: '0 20px', borderRadius: 11,
              border: 'none', cursor: canSave ? 'pointer' : 'default',
              background: 'rgb(var(--primary))', color: 'rgb(4,38,20)',
              fontSize: 13, fontWeight: 800, opacity: canSave ? 1 : 0.45,
            }}
          >
            {saving ? 'Saving…' : 'Save bracket'}
          </button>
          {saveMsg && (
            <span style={{ fontSize: 12, fontWeight: 700, color: saveMsg === 'Saved' ? 'rgb(var(--primary))' : 'rgb(var(--coral))' }}>
              {saveMsg}
            </span>
          )}
          {!canSave && !saving && (
            <span style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>
              Fill all rounds to save
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PickerSection({
  title, sub, selected, max, options, onToggle, emptyLabel,
}: {
  title: string
  sub: string
  selected: string[]
  max: number
  options: string[]
  onToggle: (code: string) => void
  emptyLabel?: string
}) {
  return (
    <div style={{ background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))', borderRadius: 14, padding: '14px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'Schibsted Grotesk, sans-serif' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: 'rgb(var(--texts))', marginTop: 2 }}>{sub}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: selected.length === max ? 'rgb(var(--primary))' : 'rgb(var(--texts))' }}>
          {selected.length}/{max}
        </span>
      </div>
      {options.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>{emptyLabel ?? 'Nothing available yet'}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((code) => {
            const active = selected.includes(code)
            const team = getTeam(code)
            return (
              <div key={code} style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                <button
                  onClick={() => onToggle(code)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 9px',
                    borderRadius: '999px 0 0 999px',
                    border: active ? '1px solid rgba(var(--primary),0.32)' : '1px solid rgb(var(--border))',
                    background: active ? 'rgba(var(--primary),0.10)' : 'rgb(var(--card))',
                    color: active ? 'rgb(var(--primary))' : 'rgb(var(--textp))',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <FlagChip code={code} w={20} h={14} r={4} />
                  <span>{team.name}</span>
                </button>
                <TeamLink
                  code={code}
                  className="inline-flex items-center px-2 text-[10px] font-bold text-texts hover:text-primary"
                  style={{
                    border: active ? '1px solid rgba(var(--primary),0.32)' : '1px solid rgb(var(--border))',
                    borderLeft: 'none',
                    borderRadius: '0 999px 999px 0',
                    background: active ? 'rgba(var(--primary),0.10)' : 'rgb(var(--card))',
                  }}
                >
                  Squad
                </TeamLink>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SinglePickSection({
  title, value, options, onSelect, emptyLabel,
}: {
  title: string
  value: string | null
  options: string[]
  onSelect: (code: string) => void
  emptyLabel?: string
}) {
  return (
    <div style={{ background: 'rgb(var(--surface2))', border: '1px solid rgb(var(--border))', borderRadius: 14, padding: '14px 15px' }}>
      <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'Schibsted Grotesk, sans-serif', marginBottom: 10 }}>{title}</div>
      {options.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgb(var(--texts))' }}>{emptyLabel ?? 'Nothing available yet'}</div>
      ) : (
        <select
          value={value ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          style={{
            width: '100%',
            height: 42,
            borderRadius: 10,
            border: '1px solid rgb(var(--border))',
            background: 'rgb(var(--card))',
            color: 'rgb(var(--textp))',
            padding: '0 12px',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <option value="">Select {title.toLowerCase()}</option>
          {options.map((code) => (
            <option key={code} value={code}>{getTeam(code).name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export default function BracketPage() {
  return <BracketPageInner />
}
