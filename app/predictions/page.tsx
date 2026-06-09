'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
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

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
    hour12: false,
  }).format(new Date(iso))
}

const POINT_BADGE: Record<number, { label: string; cls: string }> = {
  3: { label: '3 pts', cls: 'bg-yellow-400 text-yellow-900 ring-yellow-300' },
  2: { label: '2 pts', cls: 'bg-slate-300 text-slate-700 ring-slate-200' },
  1: { label: '1 pt',  cls: 'bg-amber-700 text-amber-100 ring-amber-600' },
  0: { label: '0 pts', cls: 'bg-gray-100 text-gray-400 ring-gray-200' },
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  pred,
  others,
  locked,
  onChange,
}: {
  match: Match
  pred: PredState | undefined
  others: OtherPred[]
  locked: boolean
  onChange: (matchId: string, field: 'pred_home' | 'pred_away', val: string) => void
}) {
  const hasResult =
    match.real_home_score !== null && match.real_away_score !== null
  const hasPred = pred && pred.pred_home !== '' && pred.pred_away !== ''
  const points =
    hasResult && hasPred
      ? calcPoints(
          Number(pred!.pred_home),
          Number(pred!.pred_away),
          match.real_home_score!,
          match.real_away_score!
        )
      : null
  const badge = points !== null ? POINT_BADGE[points] : null

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-opacity ${
        locked ? 'opacity-90' : ''
      }`}
    >
      {/* Date + badge row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">{fmtDate(match.match_date)}</span>
        {badge && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}
        {pred?.saving && (
          <span className="text-xs text-blue-400 animate-pulse">saving…</span>
        )}
      </div>

      {/* Teams + inputs */}
      <div className="flex items-center gap-2">
        {/* Home team */}
        <span
          className={`flex-1 text-right font-semibold text-sm ${
            locked ? 'text-gray-400' : 'text-gray-800'
          }`}
        >
          {match.home_team}
        </span>

        {/* Score inputs */}
        <div className="flex items-center gap-1">
          <ScoreInput
            value={pred?.pred_home ?? ''}
            disabled={locked}
            onChange={(v) => onChange(match.id, 'pred_home', v)}
          />
          <span className="text-gray-300 font-light text-sm select-none">—</span>
          <ScoreInput
            value={pred?.pred_away ?? ''}
            disabled={locked}
            onChange={(v) => onChange(match.id, 'pred_away', v)}
          />
        </div>

        {/* Away team */}
        <span
          className={`flex-1 text-left font-semibold text-sm ${
            locked ? 'text-gray-400' : 'text-gray-800'
          }`}
        >
          {match.away_team}
        </span>
      </div>

      {/* Real result (shown when available) */}
      {hasResult && (
        <p className="text-center text-xs text-gray-400 mt-2">
          Final:&nbsp;
          <span className="font-medium text-gray-600">
            {match.real_home_score} – {match.real_away_score}
          </span>
        </p>
      )}

      {/* Other users' predictions (only after lock) */}
      {locked && others.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-400 mb-1.5">Others' predictions</p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((o) => {
              const op =
                hasResult
                  ? calcPoints(
                      o.pred_home,
                      o.pred_away,
                      match.real_home_score!,
                      match.real_away_score!
                    )
                  : null
              const ob = op !== null ? POINT_BADGE[op] : null
              return (
                <span
                  key={o.username}
                  className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5"
                >
                  <span className="text-gray-500">{o.username}</span>
                  <span className="font-medium text-gray-700">
                    {o.pred_home}–{o.pred_away}
                  </span>
                  {ob && (
                    <span
                      className={`text-[10px] font-semibold px-1 rounded-full ring-1 ${ob.cls}`}
                    >
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
  )
}

function ScoreInput({
  value,
  disabled,
  onChange,
}: {
  value: string | number
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className={`w-10 h-10 text-center rounded-lg border text-sm font-semibold transition-colors
        ${
          disabled
            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
            : 'bg-white border-gray-300 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent'
        }`}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const supabase = createClient()
  const [rounds, setRounds] = useState<Round[]>([])
  const [preds, setPreds] = useState<Record<string, PredState>>({})
  const [others, setOthers] = useState<Record<string, OtherPred[]>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Rounds → matches
      const { data: roundData } = await supabase
        .from('rounds')
        .select(
          `id, name, "order",
           matches (id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked)`
        )
        .order('"order"')
        .order('match_date', { referencedTable: 'matches' })

      if (roundData) setRounds(roundData as Round[])

      // My predictions
      const { data: myData } = await supabase
        .from('predictions')
        .select('match_id, pred_home, pred_away')
        .eq('user_id', user.id)

      if (myData) {
        const map: Record<string, PredState> = {}
        for (const p of myData) {
          map[p.match_id] = {
            pred_home: String(p.pred_home),
            pred_away: String(p.pred_away),
            saving: false,
          }
        }
        setPreds(map)
      }

      // Other users' predictions for locked matches
      if (roundData) {
        const allMatches = (roundData as Round[]).flatMap((r) => r.matches ?? [])
        const lockedIds = allMatches
          .filter(matchIsLocked)
          .map((m) => m.id)

        if (lockedIds.length > 0) {
          const { data: otherData } = await supabase
            .from('predictions')
            .select('match_id, pred_home, pred_away, profiles(username)')
            .in('match_id', lockedIds)
            .neq('user_id', user.id)

          if (otherData) {
            const map: Record<string, OtherPred[]> = {}
            for (const p of otherData as any[]) {
              if (!map[p.match_id]) map[p.match_id] = []
              map[p.match_id].push({
                username: p.profiles?.username ?? '?',
                pred_home: p.pred_home,
                pred_away: p.pred_away,
              })
            }
            setOthers(map)
          }
        }
      }

      setLoading(false)
    }

    load()
  }, [])

  function handleChange(
    matchId: string,
    field: 'pred_home' | 'pred_away',
    rawVal: string
  ) {
    if (rawVal !== '' && !/^\d{0,2}$/.test(rawVal)) return

    // Capture sibling value before state update (avoids stale closure in timer)
    const current = preds[matchId] ?? { pred_home: '', pred_away: '', saving: false }
    const ph = field === 'pred_home' ? rawVal : current.pred_home
    const pa = field === 'pred_away' ? rawVal : current.pred_away

    setPreds((prev) => ({
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
      setPreds((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], saving: false },
      }))
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

      {rounds.map((round) => {
        const matches = round.matches ?? []
        if (matches.length === 0) return null
        return (
          <section key={round.id}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              {round.name}
            </h2>
            <div className="space-y-3">
              {matches.map((match) => (
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
          </section>
        )
      })}
    </main>
  )
}
