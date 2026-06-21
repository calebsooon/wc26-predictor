'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import FlagChip from '@/components/FlagChip'
import { Pill } from '@/components/ui'
import { resolveLineupState, type LineupPlayerState, type LineupSubstitution } from '@/lib/lineup-state'

type Row = LineupPlayerState & { team_code: string }

function surname(name: string) { const parts = name.trim().split(/\s+/); return parts.length > 1 ? parts.at(-1)! : name }

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
  return keys.flatMap((key) => (grouped.get(key) ?? []).sort((a, b) => a.sort_order - b.sort_order).map((player, index, all) => ({
    player,
    x: (index + 1) / (all.length + 1) * 100,
    y: home ? 94 - (max > 0 ? key / max * 41 : 0) : 6 + (max > 0 ? key / max * 41 : 0),
  })))
}

function PlayerChip({ player, x, y, color }: { player: LineupPlayerState; x: number; y: number; color: string }) {
  return <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${x}%`, top: `${y}%` }}>
    <span className="grid place-items-center rounded-full text-[10px] font-black text-white shadow-lg ring-2 ring-black/15" style={{ width: 27, height: 27, background: color }}>{player.shirt_number ?? ''}</span>
    <span className="mt-0.5 max-w-[68px] truncate rounded bg-black/35 px-1 text-[8.5px] font-bold leading-[14px] text-white">{surname(player.players?.name ?? '')}</span>
  </div>
}

export function MatchLineups({ matchId, homeCode, awayCode, homeFormation, awayFormation }: { matchId: string; homeCode: string; awayCode: string; homeFormation: string | null; awayFormation: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [subs, setSubs] = useState<LineupSubstitution[]>([])
  const [view, setView] = useState<'current' | 'announced'>('current')

  const load = useCallback(() => {
    Promise.all([
      supabase.from('lineups').select('team_code, player_id, is_starting, shirt_number, position_label, grid, sort_order, players(name)').eq('match_id', matchId),
      supabase.from('lineup_substitutions').select('id, team_code, player_out_id, player_in_id, minute, source, created_at').eq('match_id', matchId),
    ]).then(([lineups, substitutions]) => {
      setRows((lineups.data ?? []) as unknown as Row[])
      setSubs((substitutions.data ?? []) as LineupSubstitution[])
    })
  }, [matchId, supabase])

  useEffect(() => {
    load()
    const channel = supabase.channel(`match-lineups-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineups', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineup_substitutions', filter: `match_id=eq.${matchId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load, matchId, supabase])

  if (!rows?.length) return null
  const homeRows = rows.filter((row) => row.team_code === homeCode)
  const awayRows = rows.filter((row) => row.team_code === awayCode)
  const home = resolveLineupState(homeRows, subs, homeCode)
  const away = resolveLineupState(awayRows, subs, awayCode)
  const hasChanges = home.applied.length + away.applied.length > 0
  const selectedHome = view === 'current' ? home.current : homeRows.filter((row) => row.is_starting)
  const selectedAway = view === 'current' ? away.current : awayRows.filter((row) => row.is_starting)

  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
      <div><p className="font-display text-[15px] font-bold">Match centre</p><p className="text-[11px] text-texts">{hasChanges && view === 'current' ? 'Live XI with verified substitutions' : 'Confirmed team sheets'}</p></div>
      {hasChanges && <div className="flex rounded-lg border border-border bg-surface p-0.5">{(['current', 'announced'] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-md px-2.5 py-1 text-[10px] font-bold capitalize ${view === item ? 'bg-card text-textp shadow-sm' : 'text-texts'}`}>{item} XI</button>)}</div>}
    </div>
    <div className="p-3 sm:p-4">
      <div className="flex justify-between mb-2 text-[11px] font-bold text-textp">
        <TeamHead code={awayCode} formation={awayFormation} /><TeamHead code={homeCode} formation={homeFormation} flip />
      </div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-emerald-200/15 bg-[linear-gradient(180deg,#17663b,#0e4829)] shadow-inner">
        <PitchLines />
        {positions(selectedAway, false).map(({ player, x, y }) => <PlayerChip key={`a-${player.player_id}`} player={player} x={x} y={y} color="#3b82f6" />)}
        {positions(selectedHome, true).map(({ player, x, y }) => <PlayerChip key={`h-${player.player_id}`} player={player} x={x} y={y} color="#22c55e" />)}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <Bench code={homeCode} bench={view === 'current' ? home.bench : homeRows.filter((row) => !row.is_starting)} />
        <Bench code={awayCode} bench={view === 'current' ? away.bench : awayRows.filter((row) => !row.is_starting)} />
      </div>
      {hasChanges && <div className="mt-3 rounded-xl border border-border bg-surface p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-texts">Substitutions</p><div className="flex flex-wrap gap-2">{[...home.applied, ...away.applied].sort((a, b) => a.minute - b.minute).map((sub) => <Pill key={sub.id ?? `${sub.player_out_id}-${sub.player_in_id}-${sub.minute}`} tone="default">{sub.minute}′ {playerName(rows, sub.player_out_id)} → {playerName(rows, sub.player_in_id)}</Pill>)}</div></div>}
    </div>
  </section>
}

function TeamHead({ code, formation, flip = false }: { code: string; formation: string | null; flip?: boolean }) { const team = getTeam(code); return <div className={`flex items-center gap-1.5 ${flip ? 'flex-row-reverse text-right' : ''}`}><FlagChip code={code} w={18} h={12} r={2} /><span>{team.name}</span>{formation && <span className="text-texts font-medium">{formation}</span>}</div> }
function Bench({ code, bench }: { code: string; bench: LineupPlayerState[] }) { return <div className="rounded-xl border border-border bg-surface p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-texts mb-2">{getTeam(code).code} bench</p><div className="flex flex-wrap gap-1.5">{bench.length ? bench.map((player) => <span key={player.player_id} className="rounded-md bg-card border border-border px-2 py-1 text-[11px] font-semibold text-textp">{player.shirt_number != null && <span className="text-texts mr-1">{player.shirt_number}</span>}{surname(player.players?.name ?? '')}</span>) : <span className="text-xs text-texts">No unused substitutes</span>}</div></div> }
function playerName(rows: Row[], id: number) { return surname(rows.find((row) => row.player_id === id)?.players?.name ?? 'Player') }
function PitchLines() { return <div className="absolute inset-0 opacity-70"><div className="absolute inset-x-0 top-1/2 border-t border-white/30" /><div className="absolute left-1/2 top-1/2 aspect-square w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" /><div className="absolute left-1/2 top-0 h-[14%] w-[46%] -translate-x-1/2 border-x border-b border-white/30" /><div className="absolute bottom-0 left-1/2 h-[14%] w-[46%] -translate-x-1/2 border-x border-t border-white/30" /></div> }
