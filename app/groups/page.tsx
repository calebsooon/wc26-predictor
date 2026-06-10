'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { teamFlag, teamName } from '@/lib/teams'
import MatchModal, { type ModalMatch } from '@/components/MatchModal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string
  gameweek: number
}

interface TeamRow {
  team: string
  p: number   // played
  w: number   // won
  d: number   // drawn
  l: number   // lost
  gf: number  // goals for
  ga: number  // goals against
  gd: number  // goal difference
  pts: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

const GROUP_COLOR: Record<string, string> = {
  A: '#E8192C', B: '#7C1FA0', C: '#1A3BC1', D: '#006D77',
  E: '#166534', F: '#E85D04', G: '#A855F7', H: '#06B6D4',
  I: '#A3C720', J: '#BE185D', K: '#B45309', L: '#3730A3',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTable(matches: Match[], group: string): TeamRow[] {
  const map = new Map<string, TeamRow>()

  const ensure = (team: string) => {
    if (!map.has(team)) map.set(team, { team, p:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0 })
    return map.get(team)!
  }

  for (const m of matches) {
    if (m.group_name !== group) continue
    if (m.real_home_score === null || m.real_away_score === null) {
      ensure(m.home_team)
      ensure(m.away_team)
      continue
    }
    const home = ensure(m.home_team)
    const away = ensure(m.away_team)
    const rh = m.real_home_score
    const ra = m.real_away_score

    home.p++; away.p++
    home.gf += rh; home.ga += ra; home.gd = home.gf - home.ga
    away.gf += ra; away.ga += rh; away.gd = away.gf - away.ga

    if (rh > ra)      { home.w++; home.pts += 3; away.l++ }
    else if (rh < ra) { away.w++; away.pts += 3; home.l++ }
    else              { home.d++; home.pts++; away.d++; away.pts++ }
  }

  return Array.from(map.values()).sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const supabase = createClient()
  const [matches, setMatches]       = useState<Match[]>([])
  const [selectedGroup, setSelected] = useState<string>('A')
  const [loading, setLoading]       = useState(true)
  const [modalMatch, setModalMatch]  = useState<ModalMatch | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, gameweek')
        .not('group_name', 'is', null)
        .order('match_date')

      if (data) setMatches(data as Match[])
      setLoading(false)
    }
    load()

    // Realtime — refresh when results come in
    const channel = supabase
      .channel('groups-matches')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const table = useMemo(() => buildTable(matches, selectedGroup), [matches, selectedGroup])
  const color = GROUP_COLOR[selectedGroup]

  // Per-gameweek results for selected group
  const gwMatches = useMemo(() =>
    [1, 2, 3].map(gw => ({
      gw,
      items: matches.filter(m => m.group_name === selectedGroup && m.gameweek === gw),
    })),
  [matches, selectedGroup])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading groups…</p>
      </div>
    )
  }

  return (
    <>
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Group Tables</h1>

      {/* Group selector */}
      <div className="flex flex-wrap gap-2 mb-8">
        {GROUPS.map(g => {
          const active = g === selectedGroup
          return (
            <button
              key={g}
              onClick={() => setSelected(g)}
              className="w-10 h-10 rounded-lg text-sm font-bold transition-all"
              style={active
                ? { background: GROUP_COLOR[g], color: '#fff', boxShadow: `0 0 0 3px ${GROUP_COLOR[g]}40` }
                : { background: '#f3f4f6', color: '#6b7280' }
              }
            >
              {g}
            </button>
          )
        })}
      </div>

      {/* Group header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-3 h-8 rounded-sm" style={{ background: color }} />
        <h2 className="text-xl font-bold text-gray-900">Group {selectedGroup}</h2>
      </div>

      {/* Standings table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="h-0.5" style={{ background: color }} />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2.5 px-3 font-semibold w-6">#</th>
              <th className="text-left py-2.5 px-3 font-semibold">Team</th>
              <th className="py-2.5 px-2 font-semibold text-center">P</th>
              <th className="py-2.5 px-2 font-semibold text-center">W</th>
              <th className="py-2.5 px-2 font-semibold text-center">D</th>
              <th className="py-2.5 px-2 font-semibold text-center">L</th>
              <th className="py-2.5 px-2 font-semibold text-center">GF</th>
              <th className="py-2.5 px-2 font-semibold text-center">GA</th>
              <th className="py-2.5 px-2 font-semibold text-center">GD</th>
              <th className="py-2.5 px-3 font-semibold text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const qualify = i < 2  // top 2 qualify (simplified)
              return (
                <tr key={row.team} className={`border-b border-gray-50 last:border-0 ${qualify ? '' : 'opacity-60'}`}>
                  <td className="py-2.5 px-3 text-gray-300 font-medium text-xs">{i + 1}</td>
                  <td className="py-2.5 px-3 font-bold text-gray-800">
                    <div className="flex items-center gap-2">
                      {qualify && (
                        <div className="w-1 h-4 rounded-full" style={{ background: color }} />
                      )}
                      <span className="text-base leading-none">{teamFlag(row.team)}</span>
                      <span>{teamName(row.team)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{row.p}</td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{row.w}</td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{row.d}</td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{row.l}</td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{row.gf}</td>
                  <td className="py-2.5 px-2 text-center text-gray-600">{row.ga}</td>
                  <td className="py-2.5 px-2 text-center text-gray-600">
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </td>
                  <td className="py-2.5 px-3 text-right font-extrabold text-gray-900">{row.pts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-300 px-3 py-2">
          Coloured bar = qualify for Round of 32 · Sorted by Pts → GD → GF
        </p>
      </div>

      {/* Fixtures by gameweek */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Fixtures</h3>
      <div className="space-y-5">
        {gwMatches.map(({ gw, items }) => (
          <div key={gw}>
            <p className="text-xs font-bold text-gray-300 uppercase tracking-widest mb-2">Gameweek {gw}</p>
            <div className="space-y-2">
              {items.map(m => {
                const played = m.real_home_score !== null && m.real_away_score !== null
                return (
                  <button
                    key={m.id}
                    onClick={() => setModalMatch(m as unknown as ModalMatch)}
                    className="w-full bg-white rounded-lg border border-gray-100 px-4 py-2.5 flex items-center justify-center gap-3 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <span className="flex-1 flex items-center justify-end gap-1.5">
                      <span className="text-sm font-semibold text-gray-700 truncate">{teamName(m.home_team)}</span>
                      <span className="text-base leading-none shrink-0">{teamFlag(m.home_team)}</span>
                    </span>
                    <span className="text-sm font-bold text-gray-400 w-12 text-center tabular-nums shrink-0">
                      {played ? `${m.real_home_score}–${m.real_away_score}` : 'vs'}
                    </span>
                    <span className="flex-1 flex items-center justify-start gap-1.5">
                      <span className="text-base leading-none shrink-0">{teamFlag(m.away_team)}</span>
                      <span className="text-sm font-semibold text-gray-700 truncate">{teamName(m.away_team)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </main>

    {modalMatch && (
      <MatchModal match={modalMatch} onClose={() => setModalMatch(null)} />
    )}
    </>
  )
}
