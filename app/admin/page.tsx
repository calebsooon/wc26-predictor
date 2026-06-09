'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  rounds: { name: string } | null
}

interface RowState {
  home: string
  away: string
  saving: boolean
  error: string | null
  saved: boolean
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
    hour12: false,
  }).format(new Date(iso))
}

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<Match[]>([])
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) { router.replace('/predictions'); return }

      const { data } = await supabase
        .from('matches')
        .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, rounds(name)')
        .order('match_date')

      if (data) {
        setMatches(data as Match[])
        const init: Record<string, RowState> = {}
        for (const m of data as Match[]) {
          init[m.id] = {
            home: m.real_home_score !== null ? String(m.real_home_score) : '',
            away: m.real_away_score !== null ? String(m.real_away_score) : '',
            saving: false,
            error: null,
            saved: false,
          }
        }
        setRows(init)
      }
      setLoading(false)
    }
    load()
  }, [])

  function setField(matchId: string, field: 'home' | 'away', val: string) {
    if (val !== '' && !/^\d{0,2}$/.test(val)) return
    setRows(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: val, saved: false, error: null },
    }))
  }

  async function save(matchId: string) {
    const row = rows[matchId]
    if (row.home === '' || row.away === '') {
      setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], error: 'Both scores required' } }))
      return
    }
    const rh = Number(row.home)
    const ra = Number(row.away)

    setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: true, error: null } }))

    // 1. Update real scores + lock the match
    const { error: updateErr } = await supabase
      .from('matches')
      .update({ real_home_score: rh, real_away_score: ra, is_locked: true })
      .eq('id', matchId)

    if (updateErr) {
      setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: false, error: updateErr.message } }))
      return
    }

    // 2. Trigger scoring
    const res = await fetch('/api/score-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: matchId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setRows(prev => ({
        ...prev,
        [matchId]: { ...prev[matchId], saving: false, error: body.error ?? 'Scoring failed' },
      }))
      return
    }

    // Update local match state so the indicator reflects the saved score
    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, real_home_score: rh, real_away_score: ra, is_locked: true } : m)
    )
    setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: false, saved: true } }))
  }

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Admin — Enter Results</h1>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-200">
              <th className="pb-2 pr-3 font-medium">Date (SGT)</th>
              <th className="pb-2 pr-3 font-medium">Round</th>
              <th className="pb-2 pr-3 font-medium">Match</th>
              <th className="pb-2 pr-3 font-medium text-center">Score</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {matches.map(m => {
              const row = rows[m.id]
              const hasScore = m.real_home_score !== null && m.real_away_score !== null
              if (!row) return null
              return (
                <tr
                  key={m.id}
                  className={`border-b border-gray-100 ${hasScore ? 'bg-green-50' : ''}`}
                >
                  {/* Date */}
                  <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                    {fmtDate(m.match_date)}
                  </td>

                  {/* Round */}
                  <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">
                    {m.rounds?.name ?? '—'}
                  </td>

                  {/* Teams */}
                  <td className="py-2 pr-3 font-medium text-gray-700 whitespace-nowrap">
                    {m.home_team} vs {m.away_team}
                    {hasScore && (
                      <span className="ml-2 text-xs text-green-600 font-normal">
                        ({m.real_home_score}–{m.real_away_score})
                      </span>
                    )}
                    {m.is_locked && !hasScore && (
                      <span className="ml-2 text-xs text-amber-500">locked</span>
                    )}
                  </td>

                  {/* Score inputs */}
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={row.home}
                        onChange={e => setField(m.id, 'home', e.target.value)}
                        placeholder="0"
                        className="w-9 h-8 text-center border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-gray-300 text-xs">–</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={row.away}
                        onChange={e => setField(m.id, 'away', e.target.value)}
                        placeholder="0"
                        className="w-9 h-8 text-center border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </td>

                  {/* Save button + status */}
                  <td className="py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => save(m.id)}
                        disabled={row.saving}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {row.saving ? 'Saving…' : 'Save'}
                      </button>
                      {row.saved && (
                        <span className="text-xs text-green-600">✓ Saved</span>
                      )}
                      {row.error && (
                        <span className="text-xs text-red-500">{row.error}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
