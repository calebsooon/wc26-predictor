'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import { Pill } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { TeamLink } from '@/components/TeamLink'
import { resolvePitchLayout } from '@/lib/lineup-layout'

interface Row {
  player_id: number
  team_code: string; is_starting: boolean; shirt_number: number | null
  position_label: string | null; grid: string | null; sort_order: number
  players: { name: string } | null
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

// Keep this legacy compact renderer aligned with the live Match Centre and
// admin preview. There is one formation resolver for every pitch surface.
function positions(players: Row[], home: boolean, formation: string | null): { x: number; y: number; p: Row }[] {
  return resolvePitchLayout(players, home, formation).map((slot) => ({ x: slot.x, y: slot.y, p: slot.player }))
}

function Disc({ x, y, p, color }: { x: number; y: number; p: Row; color: string }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="grid place-items-center rounded-full text-[10px] font-bold text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
        style={{ width: 24, height: 24, background: color }}>
        {p.shirt_number ?? ''}
      </div>
      <span className="text-[8.5px] font-semibold text-white/90 leading-none px-1 py-0.5 rounded bg-black/35 max-w-[64px] truncate">
        {p.players ? surname(p.players.name) : ''}
      </span>
    </div>
  )
}

export function FormationPitch({ matchId, homeCode, awayCode, homeFormation, awayFormation }: {
  matchId: string; homeCode: string; awayCode: string; homeFormation: string | null; awayFormation: string | null
}) {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('lineups')
      .select('player_id, team_code, is_starting, shirt_number, position_label, grid, sort_order, players(name)')
      .eq('match_id', matchId).eq('is_starting', true)
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []))
  }, [matchId])

  if (!rows || rows.length === 0) return null

  const home = rows.filter((r) => r.team_code === homeCode)
  const away = rows.filter((r) => r.team_code === awayCode)
  const homePos = positions(home, true, homeFormation)
  const awayPos = positions(away, false, awayFormation)

  const TeamLabel = ({ code, formation, away: isAway }: { code: string; formation: string | null; away?: boolean }) => (
    <div className={`flex items-center gap-2 ${isAway ? 'justify-start' : 'justify-end'}`}>
      <TeamLink code={code} className="flex items-center gap-2 hover:opacity-75">
      <FlagChip code={code} w={20} h={14} r={3} />
      <span className="text-[12px] font-bold text-textp">{getTeam(code).name}</span>
      </TeamLink>
      {formation && <Pill tone="default">{formation}</Pill>}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <TeamLabel code={awayCode} formation={awayFormation} away />
        <TeamLabel code={homeCode} formation={homeFormation} />
      </div>
      <div className="relative w-full rounded-2xl overflow-hidden border border-border"
        style={{ aspectRatio: '3 / 4', background: 'linear-gradient(180deg,#1f7a45,#176235)' }}>
        {/* pitch markings */}
        <div className="absolute inset-0 opacity-80">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/35" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" style={{ width: '28%', aspectRatio: '1' }} />
          <div className="absolute left-1/2 -translate-x-1/2 top-0 border border-white/30 border-t-0" style={{ width: '46%', height: '14%' }} />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 border border-white/30 border-b-0" style={{ width: '46%', height: '14%' }} />
        </div>
        {awayPos.map(({ x, y, p }, i) => <Disc key={`a${i}`} x={x} y={y} p={p} color="rgb(var(--blue))" />)}
        {homePos.map(({ x, y, p }, i) => <Disc key={`h${i}`} x={x} y={y} p={p} color="rgb(var(--primary))" />)}
      </div>
    </div>
  )
}
