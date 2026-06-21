'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { FLAG_GRADIENTS, getTeam } from '@/lib/teams'
import FlagChip from '@/components/FlagChip'
import { ChevDown } from '@/components/ui'
import { resolveLineupState, type LineupPlayerState, type LineupSubstitution } from '@/lib/lineup-state'

type Row = LineupPlayerState & { team_code: string; players: { name: string; photo_url: string | null } | null }
type MatchEvent = { id: string; team_code: string; minute: number; type: 'goal' | 'yellow_card' | 'red_card'; detail: string | null; player: { name: string } | null; assist: { name: string } | null }

function surname(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.at(-1)! : name
}

function band(label: string | null) {
  const value = (label ?? '').toUpperCase()
  if (value === 'GK' || value === 'G') return 0
  if (['D', 'RB', 'LB', 'CB', 'RWB', 'LWB'].includes(value)) return 1
  if (['F', 'ST', 'CF', 'RW', 'LW', 'RF', 'LF'].includes(value)) return 3
  return 2
}

function positions(rows: LineupPlayerState[], home: boolean) {
  const grouped = new Map<number, LineupPlayerState[]>()
  for (const row of rows) {
    const key = row.grid ? Number(row.grid.split(':')[0]) : band(row.position_label)
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  const keys = Array.from(grouped.keys()).sort((a, b) => a - b)
  const max = keys.at(-1) ?? 1
  return keys.flatMap((key) => (grouped.get(key) ?? []).sort((a, b) => {
    const laneA = Number(a.grid?.split(':')[1])
    const laneB = Number(b.grid?.split(':')[1])
    if (Number.isFinite(laneA) && Number.isFinite(laneB) && laneA !== laneB) return laneA - laneB
    return a.sort_order - b.sort_order
  }).map((player, index, all) => ({
    player,
    x: (index + 1) / (all.length + 1) * 100,
    y: home ? 91 - (max > 0 ? key / max * 39 : 0) : 9 + (max > 0 ? key / max * 39 : 0),
  })))
}

function PlayerChip({ player, x, y, color, entered }: { player: LineupPlayerState; x: number; y: number; color: string; entered?: boolean }) {
  const photo = player.players?.photo_url
  return <motion.div layout initial={{ opacity: 0, scale: 0.72, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 23 }} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex w-[62px] flex-col items-center pointer-events-none" style={{ left: `${x}%`, top: `${y}%` }}>
    <div className="relative h-[51px] w-[48px] drop-shadow-[0_4px_5px_rgba(0,0,0,0.46)]">
      {photo ? <Image src={photo} alt="" width={48} height={62} className="h-full w-full object-contain object-bottom" /> : <span className="absolute inset-x-1 top-1 h-10 rounded-full border-2 border-white/55 bg-white/15" />}
      <span className={`absolute bottom-0 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full border border-white/60 text-[9px] font-black text-white shadow ${entered ? 'ring-4 ring-primary/45' : ''}`} style={{ background: color }}>{player.shirt_number ?? '—'}</span>
    </div>
    <span className="mt-0.5 max-w-[68px] truncate rounded-md border border-white/15 bg-black/55 px-1.5 py-px text-[8.5px] font-extrabold leading-[14px] text-white shadow-sm">{surname(player.players?.name ?? '')}</span>
  </motion.div>
}

export function MatchLineups({ matchId, homeCode, awayCode, homeFormation, awayFormation, homeScore = null, awayScore = null, scoreLabel }: { matchId: string; homeCode: string; awayCode: string; homeFormation: string | null; awayFormation: string | null; homeScore?: number | null; awayScore?: number | null; scoreLabel?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [subs, setSubs] = useState<LineupSubstitution[]>([])
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [view, setView] = useState<'current' | 'announced'>('current')
  const [expanded, setExpanded] = useState(true)

  const load = useCallback(() => {
    Promise.all([
      supabase.from('lineups').select('team_code, player_id, is_starting, shirt_number, position_label, grid, sort_order, players(name, photo_url)').eq('match_id', matchId),
      supabase.from('lineup_substitutions').select('id, team_code, player_out_id, player_in_id, minute, source, created_at').eq('match_id', matchId),
      supabase.from('match_events').select('id, team_code, minute, type, detail, player:players!match_events_player_id_fkey(name), assist:players!match_events_assist_id_fkey(name)').eq('match_id', matchId).order('minute'),
    ]).then(([lineups, substitutions, timeline]) => {
      setRows((lineups.data ?? []) as unknown as Row[])
      setSubs((substitutions.data ?? []) as LineupSubstitution[])
      setEvents((timeline.data ?? []) as unknown as MatchEvent[])
    })
  }, [matchId, supabase])

  useEffect(() => {
    if (!expanded) return
    load()
    const channel = supabase.channel(`match-lineups-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineups', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineup_substitutions', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [expanded, load, matchId, supabase])

  if (!rows?.length) return null
  const homeRows = rows.filter((row) => row.team_code === homeCode)
  const awayRows = rows.filter((row) => row.team_code === awayCode)
  const home = resolveLineupState(homeRows, subs, homeCode)
  const away = resolveLineupState(awayRows, subs, awayCode)
  const hasChanges = home.applied.length + away.applied.length > 0
  const subCount = home.applied.length + away.applied.length
  const eventHomeScore = events.filter((event) => event.type === 'goal' && event.team_code === homeCode).length
  const eventAwayScore = events.filter((event) => event.type === 'goal' && event.team_code === awayCode).length
  const displayHomeScore = homeScore ?? (events.some((event) => event.type === 'goal') ? eventHomeScore : null)
  const displayAwayScore = awayScore ?? (events.some((event) => event.type === 'goal') ? eventAwayScore : null)
  const incoming = new Set([...home.applied, ...away.applied].map((sub) => sub.player_in_id))
  const selectedHome = view === 'current' ? home.current : homeRows.filter((row) => row.is_starting)
  const selectedAway = view === 'current' ? away.current : awayRows.filter((row) => row.is_starting)
  const timeline = [
    ...events.map((event) => ({ minute: event.minute, key: event.id, content: <TimelineEvent event={event} /> })),
    ...[...home.applied, ...away.applied].map((sub) => ({
      minute: sub.minute,
      key: sub.id ?? `${sub.player_out_id}-${sub.player_in_id}-${sub.minute}`,
      content: <div className="flex items-center gap-2 text-xs"><span className="w-7 text-right font-black text-textp">{sub.minute}′</span><span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-primary">⇄</span><span className="font-semibold text-textp">{playerName(rows, sub.player_in_id)}</span><span className="text-texts">on for <span className="line-through opacity-70">{playerName(rows, sub.player_out_id)}</span></span></div>,
    })),
  ].sort((a, b) => a.minute - b.minute)

  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left transition hover:bg-surface/60" aria-expanded={expanded}>
      <div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">XI</span><div><p className="font-display text-[15px] font-bold text-textp">Match centre</p><p className="text-[11px] text-texts">{hasChanges && view === 'current' ? 'Current XI · verified substitutions' : 'Confirmed team sheets'}</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden text-[11px] font-bold text-texts sm:inline">{expanded ? 'Hide lineups' : 'Show lineups'}</span><ChevDown size={17} className={`text-texts transition-transform ${expanded ? 'rotate-180' : ''}`} /></div>
    </button>
    {expanded && <div className="p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-textp">
        <TeamHead code={awayCode} formation={awayFormation} />
        {hasChanges && <div className="flex rounded-lg border border-border bg-surface p-0.5 order-3 w-full sm:order-none sm:w-auto">{(['current', 'announced'] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`flex-1 rounded-md px-2.5 py-1 text-[10px] font-bold sm:flex-none ${view === item ? 'bg-card text-textp shadow-sm' : 'text-texts'}`}>{item === 'current' ? 'Current XI' : 'Announced XI'}</button>)}</div>}
        <TeamHead code={homeCode} formation={homeFormation} flip />
      </div>
      <div className="mb-3 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${FLAG_GRADIENTS[awayCode] ?? '#2774df'} 0 48%, rgb(var(--border)) 48% 52%, ${FLAG_GRADIENTS[homeCode] ?? '#d99a21'} 52% 100%)` }} />
        <div className="flex items-center justify-between px-3 py-2"><span className="flex items-center gap-1.5 text-xs font-bold text-textp"><FlagChip code={awayCode} w={18} h={12} r={2} />{getTeam(awayCode).code}</span><span className="font-display text-base font-black tabular-nums text-textp">{displayAwayScore ?? '–'} <small className="px-1 text-texts">:</small> {displayHomeScore ?? '–'}</span><span className="flex items-center gap-1.5 text-xs font-bold text-textp">{getTeam(homeCode).code}<FlagChip code={homeCode} w={18} h={12} r={2} /></span></div>
        <div className="border-t border-border/60 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-texts">{events.some((event) => event.type === 'goal') && homeScore == null ? 'Live match' : scoreLabel ?? (homeScore != null && awayScore != null ? 'Result' : 'Team sheets')} {subCount ? `· ${subCount} verified sub${subCount === 1 ? '' : 's'}` : ''}</div>
      </div>
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-emerald-200/20 bg-[#07512c] shadow-inner sm:aspect-[11/10]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 10%, transparent 10% 20%)' }}>
        <PitchLines />
        {positions(selectedAway, false).map(({ player, x, y }) => <PlayerChip key={`a-${player.player_id}`} player={player} x={x} y={y} color="#2774df" entered={view === 'current' && incoming.has(player.player_id)} />)}
        {positions(selectedHome, true).map(({ player, x, y }) => <PlayerChip key={`h-${player.player_id}`} player={player} x={x} y={y} color="#d99a21" entered={view === 'current' && incoming.has(player.player_id)} />)}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Bench code={homeCode} bench={view === 'current' ? home.bench : homeRows.filter((row) => !row.is_starting)} />
        <Bench code={awayCode} bench={view === 'current' ? away.bench : awayRows.filter((row) => !row.is_starting)} />
      </div>
      {(hasChanges || events.length > 0) && <div className="mt-3 rounded-xl border border-border bg-surface p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-texts">Match timeline</p><div className="space-y-1.5">{timeline.map((item) => <div key={item.key}>{item.content}</div>)}</div></div>}
    </div>}
  </section>
}

function TeamHead({ code, formation, flip = false }: { code: string; formation: string | null; flip?: boolean }) {
  const team = getTeam(code)
  return <div className={`flex items-center gap-1.5 ${flip ? 'flex-row-reverse text-right' : ''}`}><FlagChip code={code} w={18} h={12} r={2} /><span className="truncate">{team.name}</span>{formation && <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-texts">{formation}</span>}</div>
}
function Bench({ code, bench }: { code: string; bench: LineupPlayerState[] }) {
  return <div className="rounded-xl border border-border bg-surface p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-texts">{getTeam(code).code} unused bench</p><div className="flex flex-wrap gap-1.5">{bench.length ? bench.map((player) => <span key={player.player_id} className="rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-textp">{player.shirt_number != null && <span className="mr-1 text-texts">{player.shirt_number}</span>}{surname(player.players?.name ?? '')}</span>) : <span className="text-xs text-texts">No unused substitutes</span>}</div></div>
}
function TimelineEvent({ event }: { event: MatchEvent }) {
  const icon = event.type === 'goal' ? '⚽' : event.type === 'red_card' ? '🟥' : '🟨'
  const detail = event.type === 'goal'
    ? `${event.player?.name ?? 'Goal'}${event.assist?.name ? ` · assist ${event.assist.name}` : ''}`
    : `${event.player?.name ?? 'Player'} ${event.type === 'red_card' ? 'sent off' : 'booked'}`
  return <div className="flex items-center gap-2 text-xs"><span className="w-7 text-right font-black text-textp">{event.minute}′</span><span className="grid h-5 w-5 place-items-center rounded-full bg-card text-[11px] shadow-sm">{icon}</span><span className="font-semibold text-textp">{detail}</span>{event.detail && event.type === 'goal' && <span className="text-texts">{event.detail}</span>}</div>
}
function playerName(rows: Row[], id: number) { return surname(rows.find((row) => row.player_id === id)?.players?.name ?? 'Player') }
function PitchLines() { return <div className="absolute inset-0 opacity-75"><div className="absolute inset-x-0 top-1/2 border-t border-white/30" /><div className="absolute left-1/2 top-1/2 aspect-square w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" /><div className="absolute left-1/2 top-0 h-[19%] w-[32%] -translate-x-1/2 border-x border-b border-white/30" /><div className="absolute bottom-0 left-1/2 h-[19%] w-[32%] -translate-x-1/2 border-x border-t border-white/30" /><div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" /></div> }
