'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import MatchModal, { type ModalMatch } from '@/components/MatchModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  rounds: { name: string; order: number }
}

// ─── Round IDs ────────────────────────────────────────────────────────────────

const ROUND_IDS = {
  R32: '00000000-0000-0000-0000-000000000002',
  R16: '00000000-0000-0000-0000-000000000003',
  QF:  '00000000-0000-0000-0000-000000000004',
  SF:  '00000000-0000-0000-0000-000000000005',
  BF:  '00000000-0000-0000-0000-000000000006',
  FIN: '00000000-0000-0000-0000-000000000007',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Singapore', hour12: false,
  }).format(new Date(iso))
}

function winner(m: Match): string | null {
  if (m.real_home_score === null || m.real_away_score === null) return null
  if (m.real_home_score > m.real_away_score) return m.home_team
  if (m.real_away_score > m.real_home_score) return m.away_team
  return null // draw (knockout → extra time not tracked here)
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function BracketCard({
  match,
  onClick,
}: {
  match: Match | undefined
  onClick?: (m: Match) => void
}) {
  if (!match) {
    return (
      <div className="w-44 rounded-xl border-2 border-dashed border-gray-200 py-3 px-3 text-center">
        <p className="text-xs text-gray-300">TBD</p>
      </div>
    )
  }

  const isTBC  = match.home_team === 'TBC'
  const w      = winner(match)
  const home   = getTeam(match.home_team)
  const away   = getTeam(match.away_team)
  const hasScore = match.real_home_score !== null

  return (
    <button
      onClick={() => onClick?.(match)}
      className="w-44 rounded-xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-md transition-all text-left overflow-hidden"
    >
      {/* Date strip */}
      <div className="bg-gray-50 border-b border-gray-100 px-2.5 py-1">
        <p className="text-[10px] text-gray-400 font-medium">{fmtDate(match.match_date)}</p>
      </div>

      {/* Home row */}
      <div className={`flex items-center gap-2 px-2.5 py-2 border-b border-gray-100 ${w === match.home_team ? 'bg-black text-white' : ''}`}>
        <span className="text-base leading-none shrink-0">
          {isTBC ? '🏳️' : home.flag}
        </span>
        <span className={`text-xs font-semibold flex-1 truncate ${w === match.home_team ? 'text-white' : 'text-gray-800'}`}>
          {isTBC ? 'TBD' : home.name}
        </span>
        {hasScore && (
          <span className={`text-xs font-bold tabular-nums ${w === match.home_team ? 'text-white' : 'text-gray-500'}`}>
            {match.real_home_score}
          </span>
        )}
      </div>

      {/* Away row */}
      <div className={`flex items-center gap-2 px-2.5 py-2 ${w === match.away_team ? 'bg-black text-white' : ''}`}>
        <span className="text-base leading-none shrink-0">
          {isTBC ? '🏳️' : away.flag}
        </span>
        <span className={`text-xs font-semibold flex-1 truncate ${w === match.away_team ? 'text-white' : 'text-gray-800'}`}>
          {isTBC ? 'TBD' : away.name}
        </span>
        {hasScore && (
          <span className={`text-xs font-bold tabular-nums ${w === match.away_team ? 'text-white' : 'text-gray-500'}`}>
            {match.real_away_score}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Round Column ─────────────────────────────────────────────────────────────

function RoundColumn({
  label,
  matches,
  onSelect,
  highlight,
}: {
  label: string
  matches: (Match | undefined)[]
  onSelect: (m: Match) => void
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col shrink-0">
      <div className={`text-center mb-3 px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-widest ${
        highlight ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
      }`}>
        {label}
      </div>
      <div className="flex flex-col gap-3 justify-around flex-1">
        {matches.map((m, i) => (
          <BracketCard key={m?.id ?? i} match={m} onClick={onSelect} />
        ))}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BracketPage() {
  const supabase = createClient()
  const [matches, setMatches]   = useState<Match[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<ModalMatch | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('matches')
        .select('*, rounds(name, order)')
        .in('round_id', Object.values(ROUND_IDS))
        .order('match_date', { ascending: true })

      setMatches((data ?? []) as unknown as Match[])
      setLoading(false)
    }
    load()
  }, [])

  // Group by round_id
  const byId: Record<string, Match[]> = {}
  for (const m of matches) {
    // We need round_id — fetch it via join alias
    const rid = (m as unknown as Record<string, string>).round_id
    if (!byId[rid]) byId[rid] = []
    byId[rid].push(m)
  }

  const r32 = byId[ROUND_IDS.R32] ?? []
  const r16 = byId[ROUND_IDS.R16] ?? []
  const qf  = byId[ROUND_IDS.QF]  ?? []
  const sf  = byId[ROUND_IDS.SF]  ?? []
  const bf  = byId[ROUND_IDS.BF]  ?? []
  const fin = byId[ROUND_IDS.FIN] ?? []

  // Determine how far the tournament has progressed
  const groupStageOver = r32.some(m => m.home_team !== 'TBC')
  const r32Over        = r16.some(m => m.home_team !== 'TBC')
  const r16Over        = qf.some(m => m.home_team !== 'TBC')
  const qfOver         = sf.some(m => m.home_team !== 'TBC')
  const sfOver         = fin.some(m => m.home_team !== 'TBC')

  const openModal = (m: Match) => {
    const r = m.rounds as unknown as { name: string }
    setSelected({
      ...m,
      round_name: r?.name ?? '',
    })
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Knockout Bracket</h1>
        <p className="text-sm text-gray-400 mb-8">Round of 32 onward · Click any match for details</p>

        {!groupStageOver ? (
          // Group stage not done yet
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
            <div className="text-5xl mb-4">⏳</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Group stage is still underway</h2>
            <p className="text-sm text-gray-500">
              The bracket will unlock once all group stage matches are complete and the Round of 32 teams are confirmed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 min-w-max items-start">

              {/* Round of 32 */}
              <RoundColumn
                label="Round of 32"
                matches={r32}
                onSelect={openModal}
                highlight={!r32Over}
              />

              {/* Connector */}
              <div className="flex items-center self-stretch">
                <div className="w-4 border-t-2 border-dashed border-gray-200" />
              </div>

              {/* Round of 16 */}
              <RoundColumn
                label="Round of 16"
                matches={r16}
                onSelect={openModal}
                highlight={r32Over && !r16Over}
              />

              <div className="flex items-center self-stretch">
                <div className="w-4 border-t-2 border-dashed border-gray-200" />
              </div>

              {/* Quarter-Finals */}
              <RoundColumn
                label="Quarter-Finals"
                matches={qf}
                onSelect={openModal}
                highlight={r16Over && !qfOver}
              />

              <div className="flex items-center self-stretch">
                <div className="w-4 border-t-2 border-dashed border-gray-200" />
              </div>

              {/* Semi-Finals */}
              <RoundColumn
                label="Semi-Finals"
                matches={sf}
                onSelect={openModal}
                highlight={qfOver && !sfOver}
              />

              <div className="flex items-center self-stretch">
                <div className="w-4 border-t-2 border-dashed border-gray-200" />
              </div>

              {/* Final + Bronze */}
              <div className="flex flex-col gap-6 shrink-0">
                <RoundColumn
                  label="Final"
                  matches={fin}
                  onSelect={openModal}
                  highlight={sfOver}
                />
                <RoundColumn
                  label="3rd Place"
                  matches={bf}
                  onSelect={openModal}
                  highlight={sfOver}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <MatchModal match={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  )
}
