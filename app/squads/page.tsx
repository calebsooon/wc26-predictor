'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  TEAMS, getTeam, type TeamInfo,
  normalisePosition, POSITION_ORDER, POSITION_BADGE, POSITION_ABBR,
} from '@/lib/teams'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id: number
  name: string
  position: string | null        // raw from DB: 'Goalkeeper','Defence','Midfield','Offence'
  jersey_number: number | null
  nationality: string | null
  team_name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_TEAMS: TeamInfo[] = Object.values(TEAMS).sort((a, b) =>
  a.name.localeCompare(b.name)
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sortPlayers(players: Player[]) {
  return [...players].sort((a, b) => {
    const pa = normalisePosition(a.position)
    const pb = normalisePosition(b.position)
    const po = (POSITION_ORDER[pa] ?? 9) - (POSITION_ORDER[pb] ?? 9)
    if (po !== 0) return po
    return (a.jersey_number ?? 99) - (b.jersey_number ?? 99)
  })
}

// ─── Squad Detail Panel ───────────────────────────────────────────────────────

function SquadDetail({ team, players }: { team: TeamInfo; players: Player[] }) {
  const sorted = sortPlayers(players.filter(p => normalisePosition(p.position) !== 'Coach'))

  const grouped: Record<string, Player[]> = {}
  for (const p of sorted) {
    const pos = normalisePosition(p.position)
    if (!grouped[pos]) grouped[pos] = []
    grouped[pos].push(p)
  }
  const posOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

  return (
    <div>
      {/* Team header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-5xl leading-none">{team.flag}</span>
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">{team.fullName}</h2>
          <p className="text-sm text-gray-400">{sorted.length} players</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No squad data available.</p>
      ) : (
        <div className="space-y-5">
          {posOrder.filter(pos => grouped[pos]).map(pos => (
            <div key={pos}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${POSITION_BADGE[pos] ?? 'bg-gray-100 text-gray-600'}`}>
                  {POSITION_ABBR[pos] ?? pos}
                </span>
                <span className="text-xs text-gray-400">{grouped[pos].length}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {grouped[pos].map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${idx < grouped[pos].length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <span className="w-7 text-center text-sm font-mono text-gray-400 shrink-0">
                      {p.jersey_number ?? '–'}
                    </span>
                    <span className="text-sm font-medium text-gray-900 flex-1">{p.name}</span>
                    {p.nationality && p.nationality !== team.fullName && p.nationality !== team.name && (
                      <span className="text-xs text-gray-400 hidden sm:block">{p.nationality}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SquadsPage() {
  const supabase = createClient()

  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  // On mobile, show detail panel as overlay when a team is selected
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    // Fetch all players in two batches (Supabase 1000-row default limit)
    async function load() {
      const [a, b] = await Promise.all([
        supabase.from('players').select('id, name, position, jersey_number, nationality, team_name').range(0, 999),
        supabase.from('players').select('id, name, position, jersey_number, nationality, team_name').range(1000, 1999),
      ])
      setAllPlayers([...(a.data ?? []), ...(b.data ?? [])] as Player[])
      setLoading(false)
    }
    load()
  }, [])

  // Build a map: teamCode → players[]
  const playersByCode = useMemo(() => {
    const map: Record<string, Player[]> = {}
    for (const p of allPlayers) {
      const team = Object.values(TEAMS).find(t => t.playerKey === p.team_name)
      if (team) {
        if (!map[team.code]) map[team.code] = []
        map[team.code].push(p)
      }
    }
    return map
  }, [allPlayers])

  const filteredTeams = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return ALL_TEAMS
    return ALL_TEAMS.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.fullName.toLowerCase().includes(q) ||
      t.code.toLowerCase().includes(q)
    )
  }, [search])

  const selectedTeam    = selected ? getTeam(selected) : null
  const selectedPlayers = selected ? (playersByCode[selected] ?? []) : []

  function openTeam(code: string) {
    setSelected(code)
    setMobileOpen(true)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Squads</h1>
        <p className="text-sm text-gray-400 mb-6">48 nations · {allPlayers.length} players</p>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Team list (left) ── */}
          <div className="lg:w-64 shrink-0">
            {/* Search */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Search teams…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400
                           focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              {filteredTeams.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No teams found</p>
              ) : (
                filteredTeams.map((team, idx) => {
                  const count = playersByCode[team.code]?.filter(p => normalisePosition(p.position) !== 'Coach').length ?? 0
                  const isSelected = selected === team.code
                  return (
                    <button
                      key={team.code}
                      onClick={() => openTeam(team.code)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                        ${idx < filteredTeams.length - 1 ? 'border-b border-gray-100' : ''}
                        ${isSelected ? 'bg-black' : 'hover:bg-gray-50'}`}
                    >
                      <span className="text-xl leading-none shrink-0">{team.flag}</span>
                      <span className={`text-sm font-medium flex-1 truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {team.name}
                      </span>
                      <span className={`text-xs tabular-nums shrink-0 ${isSelected ? 'text-white/50' : 'text-gray-400'}`}>
                        {count > 0 ? count : '–'}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ── Squad detail — desktop (right) ── */}
          <div className="hidden lg:block flex-1 min-w-0">
            {selectedTeam ? (
              <SquadDetail team={selectedTeam} players={selectedPlayers} />
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center shadow-sm">
                <div className="text-5xl mb-3">⚽</div>
                <p className="text-gray-500 font-medium">Select a team to view their squad</p>
                <p className="text-sm text-gray-400 mt-1">Choose from the list on the left</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile slide-up panel ── */}
      {mobileOpen && selectedTeam && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle + close */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
              <div /> {/* spacer */}
              <button
                onClick={() => setMobileOpen(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              <SquadDetail team={selectedTeam} players={selectedPlayers} />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
