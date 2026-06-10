'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Countdown } from '@/components/Countdown'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Match {
  id: string
  match_date: string          // stored as UTC in DB; PDF times were SGT (UTC+8)
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  gameweek: number | null
}

interface Round {
  id: string
  name: string
  order: number
  matches: Match[]
}

interface PredState {
  pred_home: string
  pred_away: string
  saving: boolean
}

interface OtherPred {
  username: string
  pred_home: number
  pred_away: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

// FIFA WC 2026 brand palette – one colour per group A–L
const GROUP_COLOR: Record<string, string> = {
  A: '#E8192C', B: '#7C1FA0', C: '#1A3BC1', D: '#006D77',
  E: '#166534', F: '#E85D04', G: '#A855F7', H: '#06B6D4',
  I: '#A3C720', J: '#BE185D', K: '#B45309', L: '#3730A3',
}

const POINT_BADGE: Record<number, { label: string; style: string }> = {
  3: { label: '3 pts', style: 'background:#E8192C;color:#fff' },
  2: { label: '2 pts', style: 'background:#7C1FA0;color:#fff' },
  1: { label: '1 pt',  style: 'background:#B45309;color:#fff' },
  0: { label: '0 pts', style: 'background:#e5e7eb;color:#6b7280' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchIsLocked(m: Match) {
  return m.is_locked || new Date(m.match_date) <= new Date()
}

function calcPoints(ph: number, pa: number, rh: number, ra: number): number {
  if (ph === rh && pa === ra) return 3
  if (ph - pa === rh - ra) return 2
  if (Math.sign(ph - pa) === Math.sign(rh - ra)) return 1
  return 0
}

// All times stored as UTC; display in SGT (UTC+8) to match PDF schedule
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Singapore', hour12: false,
  }).format(new Date(iso))
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GroupBadge({ group }: { group: string }) {
  const color = GROUP_COLOR[group] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider text-white"
      style={{ background: color }}
    >
      GRP {group}
    </span>
  )
}

function ScoreInput({
  value, disabled, onChange,
}: { value: string | number; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder="—"
      className={`w-10 h-10 text-center rounded-lg border text-sm font-bold transition-colors
        ${disabled
          ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
          : 'bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent'
        }`}
      style={!disabled ? { '--tw-ring-color': '#E8192C' } as React.CSSProperties : undefined}
    />
  )
}

function MatchCard({
  match, pred, others, locked, onChange,
}: {
  match: Match
  pred: PredState | undefined
  others: OtherPred[]
  locked: boolean
  onChange: (id: string, field: 'pred_home' | 'pred_away', val: string) => void
}) {
  const hasResult = match.real_home_score !== null && match.real_away_score !== null
  const hasPred   = pred && pred.pred_home !== '' && pred.pred_away !== ''
  const points    = hasResult && hasPred
    ? calcPoints(Number(pred!.pred_home), Number(pred!.pred_away), match.real_home_score!, match.real_away_score!)
    : null
  const badge     = points !== null ? POINT_BADGE[points] : null
  const color     = match.group_name ? GROUP_COLOR[match.group_name] : '#6b7280'

  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-opacity ${locked ? 'opacity-90' : ''}`}>
      {/* Colour accent bar */}
      <div className="h-0.5 w-full" style={{ background: color }} />

      <div className="p-3 sm:p-4">
        {/* Top row: date | countdown | badge */}
        <div className="flex items-center justify-between mb-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {match.group_name && <GroupBadge group={match.group_name} />}
            <span className="text-xs text-gray-400 truncate">{fmtDate(match.match_date)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!locked && <Countdown matchDate={match.match_date} />}
            {badge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: badge.style.split(';')[0].replace('background:','') }}>
                {badge.label}
              </span>
            )}
            {pred?.saving && <span className="text-[10px] text-blue-400 animate-pulse">saving…</span>}
          </div>
        </div>

        {/* Teams + inputs */}
        <div className="flex items-center gap-2">
          <span className={`flex-1 text-right text-sm font-semibold truncate ${locked ? 'text-gray-400' : 'text-gray-900'}`}>
            {match.home_team}
          </span>
          <div className="flex items-center gap-1.5">
            <ScoreInput value={pred?.pred_home ?? ''} disabled={locked} onChange={v => onChange(match.id, 'pred_home', v)} />
            <span className="text-gray-200 font-light text-xs select-none">—</span>
            <ScoreInput value={pred?.pred_away ?? ''} disabled={locked} onChange={v => onChange(match.id, 'pred_away', v)} />
          </div>
          <span className={`flex-1 text-left text-sm font-semibold truncate ${locked ? 'text-gray-400' : 'text-gray-900'}`}>
            {match.away_team}
          </span>
        </div>

        {/* Real result */}
        {hasResult && (
          <p className="text-center text-xs text-gray-400 mt-2">
            Result: <span className="font-semibold text-gray-600">{match.real_home_score} – {match.real_away_score}</span>
          </p>
        )}

        {/* Others' predictions */}
        {locked && others.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Others&apos; picks</p>
            <div className="flex flex-wrap gap-1.5">
              {others.map(o => {
                const op = hasResult ? calcPoints(o.pred_home, o.pred_away, match.real_home_score!, match.real_away_score!) : null
                const ob = op !== null ? POINT_BADGE[op] : null
                return (
                  <span key={o.username} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5">
                    <span className="text-gray-500">{o.username}</span>
                    <span className="font-bold text-gray-700">{o.pred_home}–{o.pred_away}</span>
                    {ob && (
                      <span className="text-[9px] font-bold px-1 rounded-full text-white"
                        style={{ background: ob.style.split(';')[0].replace('background:','') }}>
                        {ob.label}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const supabase = createClient()
  const [rounds, setRounds]   = useState<Round[]>([])
  const [preds, setPreds]     = useState<Record<string, PredState>>({})
  const [others, setOthers]   = useState<Record<string, OtherPred[]>>({})
  const [userId, setUserId]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: roundData } = await supabase
        .from('rounds')
        .select(`id, name, "order", matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek)`)
        .order('"order"')
        .order('match_date', { referencedTable: 'matches' })

      if (roundData) setRounds(roundData as unknown as Round[])

      const { data: myData } = await supabase
        .from('predictions')
        .select('match_id, pred_home, pred_away')
        .eq('user_id', user.id)

      if (myData) {
        const map: Record<string, PredState> = {}
        for (const p of myData) {
          map[p.match_id] = { pred_home: String(p.pred_home), pred_away: String(p.pred_away), saving: false }
        }
        setPreds(map)
      }

      if (roundData) {
        const allMatches = (roundData as unknown as Round[]).flatMap(r => r.matches ?? [])
        const lockedIds  = allMatches.filter(matchIsLocked).map(m => m.id)
        if (lockedIds.length > 0) {
          const { data: otherData } = await supabase
            .from('predictions')
            .select('match_id, pred_home, pred_away, profiles(username)')
            .in('match_id', lockedIds)
            .neq('user_id', user.id)

          if (otherData) {
            const map: Record<string, OtherPred[]> = {}
            for (const p of otherData as unknown as { match_id: string; pred_home: number; pred_away: number; profiles: { username: string } | null }[]) {
              if (!map[p.match_id]) map[p.match_id] = []
              map[p.match_id].push({ username: p.profiles?.username ?? '?', pred_home: p.pred_home, pred_away: p.pred_away })
            }
            setOthers(map)
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  function handleChange(matchId: string, field: 'pred_home' | 'pred_away', rawVal: string) {
    if (rawVal !== '' && !/^\d{0,2}$/.test(rawVal)) return
    const current = preds[matchId] ?? { pred_home: '', pred_away: '', saving: false }
    const ph = field === 'pred_home' ? rawVal : current.pred_home
    const pa = field === 'pred_away' ? rawVal : current.pred_away

    setPreds(prev => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { pred_home: '', pred_away: '' }), [field]: rawVal, saving: true },
    }))

    if (timers.current[matchId]) clearTimeout(timers.current[matchId])
    timers.current[matchId] = setTimeout(async () => {
      if (ph === '' || pa === '' || !userId) return
      await supabase.from('predictions').upsert(
        { user_id: userId, match_id: matchId, pred_home: Number(ph), pred_away: Number(pa) },
        { onConflict: 'user_id,match_id' }
      )
      setPreds(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: false } }))
    }, 500)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading predictions…</p>
      </div>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">My Predictions</h1>

      {rounds.map(round => {
        const matches = round.matches ?? []
        if (matches.length === 0) return null

        // For group stage: split by gameweek; otherwise render flat
        const isGroupStage = round.name === 'Group Stage'
        const gameweeks = isGroupStage
          ? [1, 2, 3]
          : [null]

        return (
          <section key={round.id}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              {round.name}
            </h2>

            {gameweeks.map(gw => {
              const gwMatches = gw === null
                ? matches
                : matches.filter(m => m.gameweek === gw)
              if (gwMatches.length === 0) return null

              return (
                <div key={gw ?? 'all'} className="mb-6">
                  {gw !== null && (
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px flex-1 bg-gray-100" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-300">
                        Gameweek {gw}
                      </span>
                      <div className="h-px flex-1 bg-gray-100" />
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {gwMatches.map(match => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        pred={preds[match.id]}
                        others={others[match.id] ?? []}
                        locked={matchIsLocked(match)}
                        onChange={handleChange}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}
