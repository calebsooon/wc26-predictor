'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam, normalisePosition, POSITION_ORDER, POSITION_ABBR } from '@/lib/teams'
import { fmtDateLong, getTimeZoneShortLabel } from '@/lib/date-format'

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

interface Player { id: number; name: string; position: string | null; jersey_number: number | null; nationality: string | null }
interface LineupPlayer { player_id: number; is_starting: boolean; shirt_number: number | null; position_label: string | null; sort_order: number; players: { name: string; position: string | null } }

function sortPlayers(players: Player[]) {
  return [...players].sort((a, b) => {
    const po = (POSITION_ORDER[normalisePosition(a.position)] ?? 9) - (POSITION_ORDER[normalisePosition(b.position)] ?? 9)
    return po !== 0 ? po : (a.jersey_number ?? 99) - (b.jersey_number ?? 99)
  })
}


function SquadPanel({ code, matchId }: { code: string; matchId: string }) {
  const supabase = createClient()
  const team = getTeam(code)
  const [squad, setSquad] = useState<Player[] | null>(null)
  const [lineup, setLineup] = useState<LineupPlayer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (code === 'TBC') { setSquad([]); setLineup([]); setLoading(false); return }
    Promise.all([
      supabase.from('players').select('id, name, position, jersey_number, nationality').eq('team_name', team.playerKey),
      supabase.from('lineups').select('player_id, is_starting, shirt_number, position_label, sort_order, players(name, position)').eq('match_id', matchId).eq('team_code', code).order('sort_order'),
    ]).then(([s, l]) => {
      if (s.error && l.error) { setLoadError(true); setLoading(false); return }
      setSquad(s.data ? sortPlayers(s.data as Player[]) : [])
      setLineup((l.data ?? []) as unknown as LineupPlayer[])
      setLoading(false)
    }).catch(() => { setLoadError(true); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, matchId])

  if (loading) return <div className="flex items-center justify-center h-24"><div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" /></div>
  if (loadError) return <p className="text-sm text-texts py-6 text-center">Could not load squad data.</p>

  const hasLineup = lineup && lineup.length > 0
  const starters = lineup?.filter((l) => l.is_starting) ?? []
  const subs = lineup?.filter((l) => !l.is_starting) ?? []
  const filtered = (squad ?? []).filter((p) => normalisePosition(p.position) !== 'Coach')
  const grouped: Record<string, Player[]> = {}
  for (const p of filtered) { const pos = normalisePosition(p.position); (grouped[pos] ||= []).push(p) }
  const posOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

  const Line = ({ num, name, label, dim }: { num: number | null; name: string; label?: string | null; dim?: boolean }) => (
    <div className={`flex items-center gap-2 ${dim ? 'opacity-70' : ''}`}>
      <span className="w-6 text-center text-xs font-mono text-texts shrink-0">{num ?? '–'}</span>
      <span className="text-sm text-textp flex-1">{name}</span>
      {label && <span className="text-[10px] font-bold bg-surface text-texts px-1.5 py-0.5 rounded-full">{label}</span>}
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl leading-none">{team.flag}</span>
        <div><p className="font-bold text-textp leading-tight">{team.fullName}</p><p className="text-xs text-texts">{filtered.length} players in squad</p></div>
      </div>
      {hasLineup ? (
        <div className="space-y-4">
          {starters.length > 0 && (
            <div>
              <p className="text-xs font-bold text-texts uppercase tracking-widest mb-2">Starting XI</p>
              <div className="space-y-1">{starters.map((l) => <Line key={l.player_id} num={l.shirt_number} name={(l.players as { name: string })?.name ?? '—'} label={l.position_label} />)}</div>
            </div>
          )}
          {subs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-texts uppercase tracking-widest mb-2">Substitutes</p>
              <div className="space-y-1">{subs.map((l) => <Line key={l.player_id} num={l.shirt_number} name={(l.players as { name: string })?.name ?? '—'} label={l.position_label} dim />)}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-gold bg-gold/10 border border-gold/20 rounded-lg px-3 py-2 mb-4">Lineup not confirmed yet — showing full registered squad</p>
          {filtered.length === 0 ? <p className="text-sm text-texts italic">No squad data available.</p> : (
            <div className="space-y-3">
              {posOrder.filter((pos) => grouped[pos]).map((pos) => (
                <div key={pos}>
                  <p className="text-xs font-bold text-texts uppercase tracking-widest mb-1.5">{pos}s</p>
                  <div className="space-y-1">{grouped[pos].map((p) => <Line key={p.id} num={p.jersey_number} name={p.name} label={POSITION_ABBR[pos] ?? pos} />)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function MatchModal({ match, onClose }: { match: ModalMatch; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const home = getTeam(match.home_team), away = getTeam(match.away_team)
  const [tab, setTab] = useState<'home' | 'away'>('home')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const hasScore = match.real_home_score !== null && match.real_away_score !== null
  const isTBC = match.home_team === 'TBC'

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4" onClick={(e) => { if (e.target === overlayRef.current) onClose() }}>
      <div className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-surface px-5 pt-5 pb-4 shrink-0 border-b border-border">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-xs font-bold text-texts uppercase tracking-widest">{match.group_name ? `Group ${match.group_name}` : match.round_name}</span>
              <p className="text-xs text-texts mt-0.5">{fmtDateLong(match.match_date)} {getTimeZoneShortLabel()}</p>
            </div>
            <button onClick={onClose} className="text-texts hover:text-textp p-1 -mr-1">✕</button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1 text-center">
              <div className="text-4xl mb-1 leading-none">{home.flag}</div>
              <p className="text-sm font-bold text-textp leading-tight">{isTBC ? 'TBD' : home.fullName}</p>
            </div>
            <div className="text-center px-4 shrink-0">
              {hasScore ? <span className="text-3xl font-extrabold tabular-nums text-textp">{match.real_home_score} – {match.real_away_score}</span> : <span className="text-lg font-bold text-texts">VS</span>}
            </div>
            <div className="flex-1 text-center">
              <div className="text-4xl mb-1 leading-none">{away.flag}</div>
              <p className="text-sm font-bold text-textp leading-tight">{isTBC ? 'TBD' : away.fullName}</p>
            </div>
          </div>
        </div>

        {!isTBC ? (
          <>
            <div className="flex border-b border-border shrink-0">
              {(['home', 'away'] as const).map((side) => {
                const t = side === 'home' ? home : away
                return (
                  <button key={side} onClick={() => setTab(side)}
                    className={`flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${tab === side ? 'border-b-2 border-primary text-textp' : 'text-texts hover:text-textp'}`}>
                    <span>{t.flag}</span><span>{t.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <SquadPanel code={tab === 'home' ? match.home_team : match.away_team} matchId={match.id} />
            </div>
          </>
        ) : (
          <div className="px-5 py-8 text-center text-texts text-sm">Teams will be confirmed after the group stage.</div>
        )}
      </div>
    </div>
  )
}
