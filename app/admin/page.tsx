'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { getTeam, normalisePosition, POSITION_ORDER } from '@/lib/teams'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SquadPlayer {
  id: number
  name: string
  position: string | null
  jersey_number: number | null
}

interface LineupEntry {
  player_id: number
  is_starting: boolean
  shirt_number: number | null
  position_label: string
  sort_order: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
    hour12: false,
  }).format(new Date(iso))
}

function sortSquad(players: SquadPlayer[]) {
  return [...players].sort((a, b) => {
    const pa = normalisePosition(a.position)
    const pb = normalisePosition(b.position)
    const po = (POSITION_ORDER[pa] ?? 9) - (POSITION_ORDER[pb] ?? 9)
    if (po !== 0) return po
    return (a.jersey_number ?? 99) - (b.jersey_number ?? 99)
  })
}

// ─── Lineup Modal ────────────────────────────────────────────────────────────

function LineupModal({
  match,
  onClose,
}: {
  match: Match
  onClose: () => void
}) {
  const supabase = createClient()
  const [tab,       setTab]       = useState<'home' | 'away'>('home')
  const [homeSquad, setHomeSquad] = useState<SquadPlayer[]>([])
  const [awaySquad, setAwaySquad] = useState<SquadPlayer[]>([])
  const [homeEntries, setHomeEntries] = useState<Record<number, LineupEntry>>({})
  const [awayEntries, setAwayEntries] = useState<Record<number, LineupEntry>>({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [loadingSquad, setLoadingSquad] = useState(true)

  const homeTeam = getTeam(match.home_team)
  const awayTeam = getTeam(match.away_team)

  useEffect(() => {
    async function load() {
      // Load squads for both teams
      const [homeRes, awayRes, lineupRes] = await Promise.all([
        supabase.from('players').select('id, name, position, jersey_number')
          .eq('team_name', homeTeam.playerKey).neq('position', 'Coach'),
        supabase.from('players').select('id, name, position, jersey_number')
          .eq('team_name', awayTeam.playerKey).neq('position', 'Coach'),
        supabase.from('lineups').select('*').eq('match_id', match.id),
      ])

      const hs = sortSquad((homeRes.data ?? []) as SquadPlayer[])
      const as_ = sortSquad((awayRes.data ?? []) as SquadPlayer[])
      setHomeSquad(hs)
      setAwaySquad(as_)

      // Pre-fill existing lineup entries
      const hEntries: Record<number, LineupEntry> = {}
      const aEntries: Record<number, LineupEntry> = {}

      for (const l of (lineupRes.data ?? []) as LineupEntry[]) {
        const entry: LineupEntry = {
          player_id: l.player_id,
          is_starting: l.is_starting,
          shirt_number: l.shirt_number,
          position_label: l.position_label ?? '',
          sort_order: l.sort_order ?? 0,
        }
        // Figure out which team
        if (hs.find(p => p.id === l.player_id))  hEntries[l.player_id] = entry
        if (as_.find(p => p.id === l.player_id)) aEntries[l.player_id] = entry
      }
      setHomeEntries(hEntries)
      setAwayEntries(aEntries)
      setLoadingSquad(false)
    }
    load()
    // Close on Escape
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function togglePlayer(
    squad: SquadPlayer[],
    entries: Record<number, LineupEntry>,
    setEntries: React.Dispatch<React.SetStateAction<Record<number, LineupEntry>>>,
    player: SquadPlayer,
    role: 'starting' | 'sub' | 'none',
  ) {
    if (role === 'none') {
      const next = { ...entries }
      delete next[player.id]
      setEntries(next)
      return
    }
    const idx = Object.values(entries).filter(e => e.is_starting === (role === 'starting')).length
    setEntries(prev => ({
      ...prev,
      [player.id]: {
        player_id: player.id,
        is_starting: role === 'starting',
        shirt_number: player.jersey_number,
        position_label: prev[player.id]?.position_label ?? '',
        sort_order: idx,
      },
    }))
  }

  function setPosLabel(
    entries: Record<number, LineupEntry>,
    setEntries: React.Dispatch<React.SetStateAction<Record<number, LineupEntry>>>,
    playerId: number,
    label: string,
  ) {
    setEntries(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], position_label: label },
    }))
  }

  async function saveLineup(teamCode: string, entries: Record<number, LineupEntry>) {
    // Delete existing, then upsert new
    await supabase.from('lineups').delete().eq('match_id', match.id).eq('team_code', teamCode)
    if (Object.keys(entries).length === 0) return
    const rows = Object.values(entries).map((e, i) => ({
      match_id:       match.id,
      team_code:      teamCode,
      player_id:      e.player_id,
      is_starting:    e.is_starting,
      shirt_number:   e.shirt_number,
      position_label: e.position_label || null,
      sort_order:     i,
    }))
    const { error } = await supabase.from('lineups').insert(rows)
    if (error) throw error
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await saveLineup(match.home_team, homeEntries)
      await saveLineup(match.away_team, awayEntries)
      setSaved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    }
    setSaving(false)
  }

  const currentSquad   = tab === 'home' ? homeSquad : awaySquad
  const currentEntries = tab === 'home' ? homeEntries : awayEntries
  const setEntries     = tab === 'home' ? setHomeEntries : setAwayEntries
  const currentTeam    = tab === 'home' ? homeTeam : awayTeam

  const starters = Object.values(currentEntries).filter(e => e.is_starting).length
  const subs     = Object.values(currentEntries).filter(e => !e.is_starting).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Enter Lineup</h2>
            <p className="text-xs text-gray-400">
              {match.home_team} vs {match.away_team} · {fmtDate(match.match_date)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Team tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          {(['home', 'away'] as const).map(side => {
            const t = side === 'home' ? homeTeam : awayTeam
            const ent = side === 'home' ? homeEntries : awayEntries
            const n = Object.keys(ent).length
            return (
              <button
                key={side}
                onClick={() => setTab(side)}
                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  tab === side ? 'border-b-2 border-black text-gray-900' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <span>{t.flag}</span>
                <span>{t.name}</span>
                {n > 0 && (
                  <span className="text-[10px] bg-black text-white rounded-full px-1.5 py-0.5">{n}</span>
                )}
              </button>
            )
          })}
        </div>

        {loadingSquad ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Legend + count */}
            <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50 text-xs text-gray-500 shrink-0 border-b border-gray-100">
              <span className="font-semibold text-gray-700">{currentTeam.fullName}</span>
              <span className="ml-auto">
                {starters}/11 starters · {subs} subs
              </span>
            </div>

            {/* Player list */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="space-y-1.5">
                {currentSquad.map(player => {
                  const entry   = currentEntries[player.id]
                  const role    = !entry ? 'none' : entry.is_starting ? 'starting' : 'sub'
                  const normPos = normalisePosition(player.position)

                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors ${
                        role === 'starting' ? 'bg-black border-black' :
                        role === 'sub'      ? 'bg-gray-100 border-gray-300' :
                                             'bg-white border-gray-200'
                      }`}
                    >
                      {/* Jersey */}
                      <span className={`w-6 text-center text-xs font-mono shrink-0 ${role === 'starting' ? 'text-white/60' : 'text-gray-400'}`}>
                        {player.jersey_number ?? '–'}
                      </span>

                      {/* Name + position */}
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium truncate block ${role === 'starting' ? 'text-white' : 'text-gray-900'}`}>
                          {player.name}
                        </span>
                        <span className={`text-[10px] ${role === 'starting' ? 'text-white/50' : 'text-gray-400'}`}>
                          {normPos}
                        </span>
                      </div>

                      {/* Position label input (only when selected) */}
                      {role !== 'none' && (
                        <input
                          type="text"
                          value={entry?.position_label ?? ''}
                          onChange={e => setPosLabel(currentEntries, setEntries, player.id, e.target.value.toUpperCase())}
                          placeholder="GK"
                          maxLength={4}
                          onClick={e => e.stopPropagation()}
                          className={`w-12 text-center text-xs rounded border px-1 py-0.5 font-mono uppercase
                            ${role === 'starting'
                              ? 'bg-white/10 border-white/20 text-white placeholder-white/30'
                              : 'bg-white border-gray-300 text-gray-700 placeholder-gray-300'
                            }`}
                        />
                      )}

                      {/* Role buttons */}
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => togglePlayer(currentSquad, currentEntries, setEntries, player, role === 'starting' ? 'none' : 'starting')}
                          className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                            role === 'starting'
                              ? 'bg-white text-black'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          XI
                        </button>
                        <button
                          onClick={() => togglePlayer(currentSquad, currentEntries, setEntries, player, role === 'sub' ? 'none' : 'sub')}
                          className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                            role === 'sub'
                              ? 'bg-white text-black border border-gray-300'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          SUB
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 bg-white shrink-0">
              {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
              {saved && <p className="text-xs text-green-600 flex-1">✓ Lineup saved!</p>}
              {!error && !saved && <div className="flex-1 text-xs text-gray-400">Press XI to add starters, SUB for substitutes</div>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save lineups'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<Match[]>([])
  const [rows,    setRows]    = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [lineupMatch, setLineupMatch] = useState<Match | null>(null)

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
        setMatches(data as unknown as Match[])
        const init: Record<string, RowState> = {}
        for (const m of data as unknown as Match[]) {
          init[m.id] = {
            home: m.real_home_score !== null ? String(m.real_home_score) : '',
            away: m.real_away_score !== null ? String(m.real_away_score) : '',
            saving: false, error: null, saved: false,
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

    const { error: updateErr } = await supabase
      .from('matches')
      .update({ real_home_score: rh, real_away_score: ra, is_locked: true })
      .eq('id', matchId)

    if (updateErr) {
      setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: false, error: updateErr.message } }))
      return
    }

    const res = await fetch('/api/score-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: matchId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: false, error: body.error ?? 'Scoring failed' } }))
      return
    }

    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, real_home_score: rh, real_away_score: ra, is_locked: true } : m)
    )
    setRows(prev => ({ ...prev, [matchId]: { ...prev[matchId], saving: false, saved: true } }))
  }

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  }

  return (
    <>
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Admin</h1>
      <p className="text-sm text-gray-400 mb-6">Enter results · click <strong>Lineup</strong> to enter starting XI and subs</p>

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
              const isTBC    = m.home_team === 'TBC'
              if (!row) return null
              return (
                <tr
                  key={m.id}
                  className={`border-b border-gray-100 ${hasScore ? 'bg-green-50' : ''}`}
                >
                  <td className="py-2 pr-3 text-gray-500 whitespace-nowrap text-xs">
                    {fmtDate(m.match_date)}
                  </td>
                  <td className="py-2 pr-3 text-gray-400 whitespace-nowrap text-xs">
                    {m.rounds?.name ?? '—'}
                  </td>
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
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="text" inputMode="numeric" maxLength={2}
                        value={row.home}
                        onChange={e => setField(m.id, 'home', e.target.value)}
                        placeholder="0"
                        className="w-9 h-8 text-center border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-gray-300 text-xs">–</span>
                      <input
                        type="text" inputMode="numeric" maxLength={2}
                        value={row.away}
                        onChange={e => setField(m.id, 'away', e.target.value)}
                        placeholder="0"
                        className="w-9 h-8 text-center border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => save(m.id)}
                        disabled={row.saving}
                        className="px-3 py-1 text-xs font-medium bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      >
                        {row.saving ? 'Saving…' : 'Save'}
                      </button>
                      {!isTBC && (
                        <button
                          onClick={() => setLineupMatch(m)}
                          className="px-3 py-1 text-xs font-medium border border-gray-300 rounded text-gray-600 hover:border-black hover:text-black transition-colors"
                        >
                          Lineup
                        </button>
                      )}
                      {row.saved  && <span className="text-xs text-green-600">✓</span>}
                      {row.error  && <span className="text-xs text-red-500">{row.error}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>

    {lineupMatch && (
      <LineupModal match={lineupMatch} onClose={() => setLineupMatch(null)} />
    )}
    </>
  )
}
