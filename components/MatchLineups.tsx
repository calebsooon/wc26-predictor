'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import FlagChip from '@/components/FlagChip'
import { DialogShell } from '@/components/ui'
import { resolveCurrentFormation, resolveLineupState, type LineupFormationChange, type LineupPlayerState, type LineupSubstitution } from '@/lib/lineup-state'
import { resolvePitchLayout } from '@/lib/lineup-layout'

type Row = LineupPlayerState & { team_code: string; players: { name: string; photo_url: string | null } | null }
type PositionedPlayer = ReturnType<typeof resolvePitchLayout<LineupPlayerState>>[number]
type MatchEvent = {
  id: string; team_code: string; minute: number
  type: 'goal' | 'yellow_card' | 'red_card'; detail: string | null
  player: { name: string } | null; assist: { name: string } | null
}

function surname(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.at(-1)! : name
}

function isGK(label: string | null) {
  const v = (label ?? '').toUpperCase()
  return v === 'GK' || v === 'G'
}

function playersPerLine(players: PositionedPlayer[]) {
  const counts = new Map<number, number>()
  for (const player of players) counts.set(player.row, (counts.get(player.row) ?? 0) + 1)
  return counts
}

function tokenWidth(lineSize: number) {
  // A five-player line is the densest common formation row. Give it a little
  // more air than a striker or goalkeeper without making sparse XIs tiny.
  if (lineSize >= 5) return '10.4%'
  if (lineSize === 4) return '11.4%'
  if (lineSize === 3) return '12.2%'
  return '12.8%'
}

/* ── Kit colours (used for silhouette fill + shirt badge) */
const KIT_COLORS: Record<string, { outfield: [string, string]; gk: [string, string] }> = {
  FRA: { outfield: ['#4f7af0', '#162e8a'], gk: ['#2cc882', '#0d7550'] },
  ESP: { outfield: ['#f05060', '#8a0c1f'], gk: ['#2ec4d6', '#0c6f7c'] },
  ARG: { outfield: ['#6cb5f5', '#1a5fb0'], gk: ['#f5c542', '#a07a10'] },
  BRA: { outfield: ['#f5d400', '#786800'], gk: ['#009c3b', '#004a1a'] },
  ENG: { outfield: ['#f0f0f0', '#a0a0a0'], gk: ['#f0b840', '#a07820'] },
  GER: { outfield: ['#f0f0f0', '#a0a0a0'], gk: ['#f0c040', '#907020'] },
  POR: { outfield: ['#d42030', '#6a0010'], gk: ['#f0c840', '#906800'] },
  NED: { outfield: ['#f07030', '#8a3000'], gk: ['#4090f0', '#0040a0'] },
}

function kitGrad(teamCode: string, gk: boolean): { grad: string; badge: string; ring: string } {
  const entry = KIT_COLORS[teamCode]
  const [light, dark] = entry
    ? (gk ? entry.gk : entry.outfield)
    : (gk ? ['#2cc882', '#0d7550'] : ['#4070d0', '#121f60'])
  return {
    grad: `radial-gradient(125% 125% at 50% 12%, ${light} 0%, ${dark} 78%)`,
    badge: dark,
    ring: light,
  }
}

/* ── Player token — no circle, just bust + nameplate ── */
function PlayerToken({
  player, x, y, teamCode, lineSize, entered, goals, yellows, onSelect,
}: {
  player: LineupPlayerState; x: number; y: number
  teamCode: string; lineSize: number; entered?: boolean
  goals: Set<string>; yellows: Set<string>
  onSelect?: (player: LineupPlayerState) => void
}) {
  const photo = player.players?.photo_url
  const gk = isGK(player.position_label)
  const { badge, ring } = kitGrad(teamCode, gk)
  const hasGoal = goals.has(String(player.player_id))
  const hasYellow = yellows.has(String(player.player_id))
  const compact = lineSize >= 4

  // Token width is % of the pitch container so it scales on both mobile and desktop.
  // Dense defensive/midfield lines deliberately receive smaller tokens, leaving
  // clear gaps for player photos and avoiding overlapping nameplates.
  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(player)}
      aria-label={`Open ${player.players?.name ?? 'player'}`}
      layout
      initial={{ opacity: 0, scale: 0.75, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 26 }}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center text-left transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-md"
      style={{ left: `${x}%`, top: `${y}%`, width: tokenWidth(lineSize) }}
    >
      {/* Figure — 76% of token width, 4:5 aspect ratio */}
      <div className="relative w-full flex justify-center">
        <div className="relative" style={{ width: compact ? '72%' : '76%', aspectRatio: '3 / 4' }}>
          {/* Goal ball */}
          {hasGoal && (
            <span className="absolute -top-2 -right-1.5 z-20">
              <svg width="13" height="13" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="11" fill="#fff" stroke="#0c0d11" strokeWidth="1.8" />
                <path d="M12 5.5l3.6 2.6-1.4 4.3h-4.4L8.4 8.1z" fill="#0c0d11" />
              </svg>
            </span>
          )}
          {/* Yellow card */}
          {hasYellow && !hasGoal && (
            <span
              className="absolute -top-1 -right-0.5 z-20 rounded-[2px]"
              style={{ width: 7, height: 10, background: '#ffce5a', border: '1px solid rgba(0,0,0,0.3)', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
            />
          )}
          {/* Silhouette / photo */}
          <div
            className="w-full h-full relative"
            style={{
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8)) drop-shadow(0 0 8px rgba(0,0,0,0.5))',
              outline: entered ? `2px solid rgb(var(--primary))` : undefined,
              outlineOffset: entered ? '2px' : undefined,
            }}
          >
            {photo ? (
              <Image src={photo} alt="" fill className="object-contain object-bottom" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 36 36" style={{ width: '66%', height: 'auto' }}>
                  <circle cx="18" cy="18" r="16" fill={ring} stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
                  {player.shirt_number != null && (
                    <text x="18" y="23.5" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="Schibsted Grotesk, sans-serif" fill={badge}>
                      {player.shirt_number}
                    </text>
                  )}
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nameplate */}
      <div
        className="w-full text-white font-bold text-center truncate leading-none mt-0.5"
        style={{
          padding: compact ? '1px 2px' : '2px 3px',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.74)',
          fontSize: compact ? 7.3 : 8,
          fontFamily: 'Schibsted Grotesk, sans-serif',
          letterSpacing: '-0.01em',
          backdropFilter: 'blur(2px)',
        }}
      >
        {player.shirt_number != null && (
          <span style={{ opacity: 0.5, marginRight: 2, fontWeight: 900 }}>{player.shirt_number}</span>
        )}
        {surname(player.players?.name ?? '')}
      </div>

      {gk && (
        <div className="mt-0.5 rounded-full" style={{ width: 5, height: 5, background: badge, boxShadow: '0 0 0 1.5px rgba(0,0,0,0.4)' }} />
      )}
    </motion.button>
  )
}

/* ── Pitch markings ─────────────────────────────────── */
function PitchLines() {
  return (
    <div className="absolute inset-[14px] pointer-events-none">
      <div className="absolute inset-0 border-2 border-white/30 rounded-[4px]" />
      <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-white/30 -translate-y-px" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/25 rounded-full" style={{ width: '23%', aspectRatio: '1' }} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full bg-white/50" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-white/28 border-t-0" style={{ width: '54%', height: '15%' }} />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-white/22 border-t-0" style={{ width: '26%', height: '6.5%' }} />
      <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full bg-white/40" style={{ top: '10.5%' }} />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-2 border-white/28 border-b-0" style={{ width: '54%', height: '15%' }} />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 border-2 border-white/22 border-b-0" style={{ width: '26%', height: '6.5%' }} />
      <div className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 w-[5px] h-[5px] rounded-full bg-white/40" style={{ bottom: '10.5%' }} />
    </div>
  )
}

/* ── Pitch container ─────────────────────────────────── */
function Pitch({
  homePlayers, awayPlayers, homeCode, awayCode,
  homeFormation, awayFormation,
  homeScore, awayScore, goalScorers, yellows,
  onSelect,
  style,
}: {
  homePlayers: PositionedPlayer[]
  awayPlayers: PositionedPlayer[]
  homeCode: string; awayCode: string
  homeFormation: string | null; awayFormation: string | null
  homeScore: number | null; awayScore: number | null
  goalScorers: Set<string>; yellows: Set<string>
  onSelect?: (player: LineupPlayerState, teamCode: string) => void
  style?: React.CSSProperties
}) {
  const homeLineSizes = playersPerLine(homePlayers)
  const awayLineSizes = playersPerLine(awayPlayers)
  return (
    <div
      className="relative overflow-hidden rounded-[16px]"
        style={{
        aspectRatio: '10 / 15.5',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, #0e7a45 0%, #0a6038 100%)',
        boxShadow: 'inset 0 2px 30px rgba(0,0,0,0.35), 0 18px 40px -22px rgba(0,0,0,0.8)',
        ...style,
      }}
    >
      {/* Grass stripes */}
      <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.045) 0 9.09%, rgba(0,0,0,0.04) 9.09% 18.18%)' }} />
      {/* Vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.28))' }} />

      <PitchLines />

      {/* Team badge labels */}
      <div className="absolute top-[10px] left-[14px] flex items-center gap-1.5 px-2.5 py-1 rounded-[8px]" style={{ background: 'rgba(8,40,24,0.6)', backdropFilter: 'blur(2px)' }}>
        <FlagChip code={awayCode} w={18} h={12} r={2} />
        <span className="text-white font-bold text-[11px]" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>{getTeam(awayCode).code}</span>
        {awayFormation && <span className="text-white/60 text-[10px] font-bold">{awayFormation}</span>}
      </div>
      <div className="absolute bottom-[10px] left-[14px] flex items-center gap-1.5 px-2.5 py-1 rounded-[8px]" style={{ background: 'rgba(8,40,24,0.6)', backdropFilter: 'blur(2px)' }}>
        <FlagChip code={homeCode} w={18} h={12} r={2} />
        <span className="text-white font-bold text-[11px]" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>{getTeam(homeCode).code}</span>
        {homeFormation && <span className="text-white/60 text-[10px] font-bold">{homeFormation}</span>}
      </div>

      {/* Score overlay */}
      {homeScore != null && awayScore != null && (
        <div className="absolute top-[10px] right-[14px] px-2.5 py-1 rounded-[8px] flex items-center" style={{ background: 'rgba(8,40,24,0.65)', backdropFilter: 'blur(2px)' }}>
          <span className="text-white font-black tabular-nums text-[13px]" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>
            {awayScore}–{homeScore}
          </span>
        </div>
      )}

      {/* Players */}
      {awayPlayers.map(({ player, x, y, row }) => (
        <PlayerToken key={`a-${player.player_id}`} player={player} x={x} y={y} lineSize={awayLineSizes.get(row) ?? 1} teamCode={awayCode} goals={goalScorers} yellows={yellows} onSelect={(selected) => onSelect?.(selected, awayCode)} />
      ))}
      {homePlayers.map(({ player, x, y, row }) => (
        <PlayerToken key={`h-${player.player_id}`} player={player} x={x} y={y} lineSize={homeLineSizes.get(row) ?? 1} teamCode={homeCode} goals={goalScorers} yellows={yellows} onSelect={(selected) => onSelect?.(selected, homeCode)} />
      ))}
    </div>
  )
}

/* ── Sub rail (desktop 2-col panel) ─────────────────── */
function SubRail({
  teamCode, formation, applied, bench, rows,
}: {
  teamCode: string
  formation: string | null
  applied: LineupSubstitution[]
  bench: LineupPlayerState[]
  rows: Row[]
}) {
  const team = getTeam(teamCode)
  const color = applied.length > 0 ? 'rgb(var(--blue))' : 'rgb(var(--texts))'
  const formBg = applied.length > 0 ? 'rgba(var(--blue),0.14)' : 'rgba(var(--surface2),0.8)'

  return (
    <div
      className="rounded-[14px] p-4"
      style={{ background: 'rgb(var(--surface))', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Team header */}
      <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-white/[0.06]">
        <FlagChip code={teamCode} w={24} h={16} r={3} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-textp text-[13px] truncate" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>{team.name}</div>
        </div>
        {formation && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-[7px] shrink-0" style={{ color, background: formBg }}>
            {formation}
          </span>
        )}
      </div>

      {/* Subs used */}
      {applied.length > 0 && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-faint mb-2">Subs used</p>
          <div className="flex flex-col gap-2 mb-4">
            {applied.map((sub) => {
              const inName = surname(rows.find((r) => r.player_id === sub.player_in_id)?.players?.name ?? 'Player')
              const outName = surname(rows.find((r) => r.player_id === sub.player_out_id)?.players?.name ?? 'Player')
              return (
                <div key={sub.id ?? `${sub.player_out_id}-${sub.player_in_id}`} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-textp truncate">{inName}</div>
                    <div className="text-[10.5px] text-faint font-medium truncate">for {outName}</div>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-primary shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                    {sub.minute}′
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Unused bench */}
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-faint mb-2">Bench</p>
      <div className="flex flex-wrap gap-1.5">
        {bench.length ? bench.map((p) => (
          <span
            key={p.player_id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] text-[11px] font-semibold"
            style={{ background: 'rgb(var(--surface2))', border: '1px solid rgba(255,255,255,0.05)', color: 'rgb(var(--texts))' }}
          >
            {p.shirt_number != null && (
              <span className="text-faint font-bold" style={{ fontFamily: 'Schibsted Grotesk, sans-serif', fontSize: 9.5, minWidth: 12, textAlign: 'center' }}>
                {p.shirt_number}
              </span>
            )}
            {surname(p.players?.name ?? '')}
          </span>
        )) : <span className="text-[11px] text-faint">–</span>}
      </div>
    </div>
  )
}

/* ── Timeline bar ───────────────────────────────────── */
function Timeline({ events, subs, formationChanges, rows, homeCode }: {
  events: MatchEvent[]
  subs: LineupSubstitution[]
  formationChanges: LineupFormationChange[]
  rows: Row[]
  homeCode: string
}) {
  const items = [
    ...events.map((e) => ({ minute: e.minute, key: e.id, isHome: e.team_code === homeCode, type: e.type as string, player: e.player?.name ?? '' })),
    ...subs.map((s) => ({ minute: s.minute, key: s.id ?? `${s.player_out_id}-${s.player_in_id}`, isHome: s.team_code === homeCode, type: 'sub', player: surname(rows.find((r) => r.player_id === s.player_in_id)?.players?.name ?? '') })),
    ...formationChanges.map((change) => ({ minute: change.minute, key: change.id ?? `${change.team_code}-${change.minute}-${change.formation}`, isHome: change.team_code === homeCode, type: 'formation', player: change.formation })),
  ].sort((a, b) => a.minute - b.minute)

  if (!items.length) return null
  const maxMin = Math.max(90, ...items.map((i) => i.minute))

  return (
    <div className="rounded-[14px] px-4 pt-3 pb-4 relative" style={{ background: 'rgb(var(--surface))', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-faint">Match timeline</span>
        <span className="text-[10px] font-semibold text-faint">{maxMin}′</span>
      </div>
      <div className="relative h-12" style={{ marginLeft: 2, marginRight: 2 }}>
        <div className="absolute left-0 right-0 top-1/2 h-[2px] rounded bg-white/[0.08] -translate-y-px" />
        {items.map((item) => {
          const pos = 3 + (Math.min(item.minute, maxMin) / maxMin) * 94
          const isGoal = item.type === 'goal'
          const isYellow = item.type === 'yellow_card'
          const isSub = item.type === 'sub'
          const isFormation = item.type === 'formation'
          const isHome = item.isHome
          const label = isFormation ? `${item.player} tactical shape change at ${item.minute} minutes` : `${item.type.replace('_', ' ')} at ${item.minute} minutes`
          return (
            <div
              key={item.key}
              title={label}
              aria-label={label}
              className="absolute top-0 bottom-0 flex flex-col items-center"
              style={{ left: `${pos}%`, transform: 'translateX(-50%)', width: 28, justifyContent: isHome ? 'flex-end' : 'flex-start' }}
            >
              <div className="flex flex-col items-center gap-[2px]" style={{ marginTop: isHome ? 'auto' : 0, marginBottom: isHome ? 0 : 'auto' }}>
                <div
                  className="w-5 h-5 rounded-full grid place-items-center"
                  style={{
                    background: isGoal ? '#fff' : isSub ? 'rgba(31,193,107,0.18)' : isFormation ? 'rgba(104,142,255,0.20)' : 'rgba(255,206,90,0.18)',
                    border: `1.5px solid ${isHome ? 'rgb(var(--blue))' : 'rgb(var(--coral))'}`,
                  }}
                >
                  {isGoal && (
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="11" fill="#fff" stroke="#0c0d11" strokeWidth="1.8" />
                      <path d="M12 5.5l3.6 2.6-1.4 4.3h-4.4L8.4 8.1z" fill="#0c0d11" />
                    </svg>
                  )}
                  {isYellow && <span className="block w-[8px] h-[11px] rounded-[2px] bg-gold" />}
                  {isSub && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--primary))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 4 4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7" />
                    </svg>
                  )}
                  {isFormation && <span className="text-[9px] font-black text-blue">⌘</span>}
                </div>
                <span className="font-bold text-center" style={{ fontSize: 9, fontFamily: 'Schibsted Grotesk, sans-serif', color: isHome ? 'rgb(var(--blue))' : 'rgb(var(--coral))' }}>
                  {item.minute}′
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────── */
export function MatchLineups({
  matchId, homeCode, awayCode, homeFormation, awayFormation,
  homeScore = null, awayScore = null,
}: {
  matchId: string; homeCode: string; awayCode: string
  homeFormation: string | null; awayFormation: string | null
  homeScore?: number | null; awayScore?: number | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [subs, setSubs] = useState<LineupSubstitution[]>([])
  const [formationChanges, setFormationChanges] = useState<LineupFormationChange[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [focusPitch, setFocusPitch] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<{ player: LineupPlayerState; teamCode: string } | null>(null)
  const channelId = useRef(`match-lineups-${matchId}-${Math.random().toString(36).slice(2, 8)}`)

  const load = useCallback(() => {
    Promise.all([
      supabase.from('lineups').select('team_code, player_id, is_starting, shirt_number, position_label, grid, sort_order, players(name, photo_url)').eq('match_id', matchId),
      supabase.from('lineup_substitutions').select('id, team_code, player_out_id, player_in_id, minute, source, created_at').eq('match_id', matchId),
      supabase.from('match_events').select('id, team_code, minute, type, detail, player:players!match_events_player_id_fkey(name), assist:players!match_events_assist_id_fkey(name)').eq('match_id', matchId).order('minute'),
      supabase.from('match_formation_changes').select('id, team_code, minute, formation, source, created_at').eq('match_id', matchId).order('minute'),
    ]).then(([lineups, substitutions, timeline, shapes]) => {
      setRows((lineups.data ?? []) as unknown as Row[])
      setSubs((substitutions.data ?? []) as LineupSubstitution[])
      setEvents((timeline.data ?? []) as unknown as MatchEvent[])
      setFormationChanges((shapes.data ?? []) as LineupFormationChange[])
    })
  }, [matchId, supabase])

  useEffect(() => {
    load()
    const channel = supabase.channel(channelId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineups', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineup_substitutions', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_formation_changes', filter: `match_id=eq.${matchId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load, matchId, supabase])

  if (!rows?.length) {
    return (
      <p className="text-center text-[13px] text-faint py-6">No lineup data yet — check back closer to kick-off.</p>
    )
  }

  const homeRows = rows.filter((r) => r.team_code === homeCode)
  const awayRows = rows.filter((r) => r.team_code === awayCode)
  const home = resolveLineupState(homeRows, subs, homeCode)
  const away = resolveLineupState(awayRows, subs, awayCode)
  const currentHomeFormation = resolveCurrentFormation(homeFormation, formationChanges, homeCode)
  const currentAwayFormation = resolveCurrentFormation(awayFormation, formationChanges, awayCode)

  const goalScorers = new Set(events.filter((e) => e.type === 'goal' && e.player).map((e) => String(rows.find((r) => r.players?.name === e.player?.name && r.team_code === e.team_code)?.player_id ?? '')))
  const yellowCards = new Set(events.filter((e) => e.type === 'yellow_card' && e.player).map((e) => String(rows.find((r) => r.players?.name === e.player?.name && r.team_code === e.team_code)?.player_id ?? '')))

  const homePlayers = resolvePitchLayout(home.current, true, currentHomeFormation)
  const awayPlayers = resolvePitchLayout(away.current, false, currentAwayFormation)
  const hasEvents = events.length > 0 || formationChanges.length > 0 || home.applied.length + away.applied.length > 0

  const pitchProps = {
    homePlayers, awayPlayers,
    homeCode, awayCode,
    homeFormation: currentHomeFormation, awayFormation: currentAwayFormation,
    homeScore, awayScore,
    goalScorers, yellows: yellowCards,
    onSelect: (player: LineupPlayerState, teamCode: string) => setSelectedPlayer({ player, teamCode }),
  }

  return (
    <div className="space-y-4">
      {/* Formation header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 text-[11px] font-bold">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <FlagChip code={homeCode} w={16} h={11} r={2} />
          <span className="truncate text-textp">{getTeam(homeCode).name}</span>
          {currentHomeFormation && <span className="ml-1 hidden shrink-0 text-faint min-[390px]:inline">{currentHomeFormation}</span>}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
          {currentAwayFormation && <span className="mr-1 hidden shrink-0 text-faint min-[390px]:inline">{currentAwayFormation}</span>}
          <span className="truncate text-textp">{getTeam(awayCode).name}</span>
          <FlagChip code={awayCode} w={16} h={11} r={2} />
        </span>
        <button onClick={() => setFocusPitch(true)} className="w-full shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-[10px] font-bold text-texts hover:text-textp sm:w-auto sm:py-1" title="Open a larger pitch view">Focus pitch ↗</button>
      </div>

      {/* ── Desktop: pitch centred + subs 2-col below ── */}
      <div className="hidden sm:block space-y-4">
        {/* Pitch: fixed height so it never becomes a tower; width is derived from aspect-ratio */}
        <div className="flex justify-center">
          <Pitch
            {...pitchProps}
            style={{
              height: 'min(78vh, 720px)',
              width: 'auto',
              aspectRatio: '10 / 15.5',
            }}
          />
        </div>

        {hasEvents && (
          <Timeline events={events} subs={[...home.applied, ...away.applied]} formationChanges={formationChanges} rows={rows} homeCode={homeCode} />
        )}

        {/* Subs & bench in 2 columns */}
        <div className="grid grid-cols-2 gap-4">
          <SubRail teamCode={homeCode} formation={currentHomeFormation} applied={home.applied} bench={home.bench} rows={rows} />
          <SubRail teamCode={awayCode} formation={currentAwayFormation} applied={away.applied} bench={away.bench} rows={rows} />
        </div>
      </div>

      {/* ── Mobile: full-width pitch + compact subs below ── */}
      <div className="sm:hidden space-y-3">
        <Pitch {...pitchProps} style={{ minHeight: 'clamp(600px, 172vw, 690px)' }} />

        {hasEvents && (
          <Timeline events={events} subs={[...home.applied, ...away.applied]} formationChanges={formationChanges} rows={rows} homeCode={homeCode} />
        )}

        <div className="grid gap-3 min-[420px]:grid-cols-2">
          {[
            { code: homeCode, formation: currentHomeFormation, applied: home.applied, bench: home.bench },
            { code: awayCode, formation: currentAwayFormation, applied: away.applied, bench: away.bench },
          ].map((t) => (
            <div
              key={t.code}
              className="rounded-[13px] p-3"
              style={{ background: 'rgb(var(--surface))', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <FlagChip code={t.code} w={16} h={11} r={2} />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{getTeam(t.code).code} subs</span>
              </div>
              {[...t.applied.map((s) => ({ num: rows.find((r) => r.player_id === s.player_in_id)?.shirt_number, name: surname(rows.find((r) => r.player_id === s.player_in_id)?.players?.name ?? ''), min: s.minute, on: true })),
                ...t.bench.map((p) => ({ num: p.shirt_number, name: surname(p.players?.name ?? ''), min: null, on: false }))
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-[18px] text-center text-[10px] font-bold text-faint" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>{p.num}</span>
                  <span className="flex-1 text-[12px] font-semibold text-textp truncate">{p.name}</span>
                  {p.on && <span className="text-[10px] font-bold text-primary" style={{ fontFamily: 'Schibsted Grotesk, sans-serif' }}>↑{p.min}′</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <DialogShell
        open={focusPitch}
        onClose={() => setFocusPitch(false)}
        ariaLabel="Focused match pitch"
        maxWidth="max-w-2xl"
        zIndexClassName="z-[80]"
        align="center"
        panelClassName="flex h-full max-h-[900px] flex-col rounded-2xl border border-border bg-card p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-extrabold text-textp">Match centre · focus view</span><button onClick={() => setFocusPitch(false)} className="h-8 rounded-lg border border-border px-2.5 text-xs font-bold text-texts hover:text-textp">Close</button></div>
        <div className="min-h-0 flex-1 flex justify-center"><Pitch {...pitchProps} style={{ height: '100%', maxHeight: 'calc(100vh - 130px)', width: 'auto', aspectRatio: '10 / 15.5' }} /></div>
      </DialogShell>
      {selectedPlayer && <PlayerSheet player={selectedPlayer.player} teamCode={selectedPlayer.teamCode} onClose={() => setSelectedPlayer(null)} goals={goalScorers.has(String(selectedPlayer.player.player_id))} yellow={yellowCards.has(String(selectedPlayer.player.player_id))} />}
    </div>
  )
}

function PlayerSheet({ player, teamCode, onClose, goals, yellow }: { player: LineupPlayerState; teamCode: string; onClose: () => void; goals: boolean; yellow: boolean }) {
  const team = getTeam(teamCode)
  return <DialogShell open onClose={onClose} ariaLabel={`${player.players?.name ?? 'Player'} details`} maxWidth="max-w-sm" zIndexClassName="z-[85]" panelClassName="rounded-2xl border border-border bg-card p-5 shadow-2xl"><div className="flex items-start gap-4"><div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-surface2">{player.players?.photo_url ? <Image src={player.players.photo_url} alt="" width={64} height={80} className="h-full w-full object-contain object-bottom" /> : <div className="grid h-full place-items-center text-xl font-black text-texts">{player.shirt_number ?? '–'}</div>}</div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">{team.name}</p><h3 className="mt-1 truncate text-lg font-black text-textp">{player.players?.name ?? 'Player'}</h3><p className="mt-1 text-xs text-texts">#{player.shirt_number ?? '—'} · {player.position_label ?? 'Position pending'}</p></div><button onClick={onClose} aria-label="Close player details" className="text-texts hover:text-textp">×</button></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><PlayerFact label="Status" value="Current XI" /><PlayerFact label="Goal" value={goals ? 'Yes' : '—'} /><PlayerFact label="Card" value={yellow ? 'Yellow' : '—'} /></div><Link href={`/squads?team=${teamCode}`} className="mt-4 block rounded-xl bg-primary px-3 py-2.5 text-center text-xs font-extrabold text-[#04210F]">Open {team.code} team centre</Link></DialogShell>
}

function PlayerFact({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-surface px-2 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-texts">{label}</p><p className="mt-1 text-xs font-extrabold text-textp">{value}</p></div> }
