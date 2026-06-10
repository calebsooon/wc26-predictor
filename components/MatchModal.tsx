'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModalMatch {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  round_name?: string
}

interface Player {
  id: number
  name: string
  position: string | null
  jersey_number: number | null
  nationality: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POSITION_ORDER: Record<string, number> = {
  Goalkeeper: 0,
  Defender:   1,
  Midfielder: 2,
  Forward:    3,
}

function sortPlayers(players: Player[]) {
  return [...players].sort((a, b) => {
    const po = (POSITION_ORDER[a.position ?? ''] ?? 9) - (POSITION_ORDER[b.position ?? ''] ?? 9)
    if (po !== 0) return po
    return (a.jersey_number ?? 99) - (b.jersey_number ?? 99)
  })
}

const POSITION_BADGE: Record<string, string> = {
  Goalkeeper: 'bg-yellow-100 text-yellow-800',
  Defender:   'bg-blue-100 text-blue-800',
  Midfielder: 'bg-green-100 text-green-800',
  Forward:    'bg-red-100 text-red-800',
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Singapore', hour12: false,
  }).format(new Date(iso))
}

// ─── Squad Panel ─────────────────────────────────────────────────────────────

function SquadPanel({ code }: { code: string }) {
  const supabase = createClient()
  const team     = getTeam(code)
  const [players, setPlayers] = useState<Player[] | null>(null)

  useEffect(() => {
    if (code === 'TBC') { setPlayers([]); return }
    supabase
      .from('players')
      .select('id, name, position, jersey_number, nationality')
      .eq('team_name', team.playerKey)
      .then(({ data }) => setPlayers(data ? sortPlayers(data as Player[]) : []))
  }, [code])

  if (!players) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    )
  }

  const grouped: Record<string, Player[]> = {}
  for (const p of players) {
    const pos = p.position ?? 'Unknown'
    if (!grouped[pos]) grouped[pos] = []
    grouped[pos].push(p)
  }

  const posOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Unknown']

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl leading-none">{team.flag}</span>
        <div>
          <p className="font-bold text-gray-900 leading-tight">{team.fullName}</p>
          <p className="text-xs text-gray-400">{players.length} players</p>
        </div>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No squad data available.</p>
      ) : (
        <div className="space-y-3">
          {posOrder.filter(pos => grouped[pos]).map(pos => (
            <div key={pos}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{pos}s</p>
              <div className="space-y-1">
                {grouped[pos].map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-mono text-gray-400 shrink-0">
                      {p.jersey_number ?? '–'}
                    </span>
                    <span className="text-sm text-gray-900 flex-1">{p.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${POSITION_BADGE[pos] ?? 'bg-gray-100 text-gray-600'}`}>
                      {pos === 'Goalkeeper' ? 'GK' : pos === 'Defender' ? 'DEF' : pos === 'Midfielder' ? 'MID' : pos === 'Forward' ? 'FWD' : pos}
                    </span>
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

// ─── Modal ────────────────────────────────────────────────────────────────────

interface MatchModalProps {
  match: ModalMatch
  onClose: () => void
}

export default function MatchModal({ match, onClose }: MatchModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const home = getTeam(match.home_team)
  const away = getTeam(match.away_team)
  const [tab, setTab] = useState<'home' | 'away'>('home')

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const hasScore = match.real_home_score !== null && match.real_away_score !== null
  const isTBC    = match.home_team === 'TBC'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-black text-white px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div>
              {match.group_name && (
                <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                  Group {match.group_name}
                </span>
              )}
              {match.round_name && !match.group_name && (
                <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                  {match.round_name}
                </span>
              )}
              <p className="text-xs text-white/40 mt-0.5">{fmtDate(match.match_date)} SGT</p>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1 -mr-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Scoreline */}
          <div className="flex items-center justify-between">
            {/* Home */}
            <div className="flex-1 text-center">
              <div className="text-4xl mb-1 leading-none">{home.flag}</div>
              <p className="text-sm font-bold text-white leading-tight">{isTBC ? 'TBD' : home.fullName}</p>
              <p className="text-[10px] text-white/40 font-mono mt-0.5">{match.home_team}</p>
            </div>

            {/* Score / VS */}
            <div className="text-center px-4 shrink-0">
              {hasScore ? (
                <span className="text-3xl font-extrabold tabular-nums">
                  {match.real_home_score} – {match.real_away_score}
                </span>
              ) : (
                <span className="text-lg font-bold text-white/40">VS</span>
              )}
            </div>

            {/* Away */}
            <div className="flex-1 text-center">
              <div className="text-4xl mb-1 leading-none">{away.flag}</div>
              <p className="text-sm font-bold text-white leading-tight">{isTBC ? 'TBD' : away.fullName}</p>
              <p className="text-[10px] text-white/40 font-mono mt-0.5">{match.away_team}</p>
            </div>
          </div>
        </div>

        {/* Squad tabs (only for real matches) */}
        {!isTBC && (
          <>
            <div className="flex border-b border-gray-100 shrink-0">
              {(['home', 'away'] as const).map(side => {
                const t = side === 'home' ? home : away
                return (
                  <button
                    key={side}
                    onClick={() => setTab(side)}
                    className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      tab === side
                        ? 'border-b-2 border-black text-gray-900'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <span>{t.flag}</span>
                    <span>{t.name}</span>
                  </button>
                )
              })}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <SquadPanel code={tab === 'home' ? match.home_team : match.away_team} />
            </div>
          </>
        )}

        {isTBC && (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            Teams will be confirmed after the group stage.
          </div>
        )}
      </div>
    </div>
  )
}
