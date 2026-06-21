'use client'

import { useMemo, useState } from 'react'
import { Card, SectionHeader } from '@/components/ui'
import FlagChip from '@/components/FlagChip'

export type StoredTeamStats = { team_code: string; stats: Record<string, unknown> }
export type StoredPlayerStats = { player_id: number; team_code: string; stats: Record<string, unknown> }

type Metadata = {
  venue?: string | null; city?: string | null; country?: string | null
  attendance?: number | null; matchNumber?: number | null
  weather?: { temperature?: number | null; humidity?: number | null; type?: string | null; windSpeed?: number | null }
  officials?: Array<{ role?: string; name?: string }>
}

const METRICS = [
  ['goals', 'Goals'], ['attempt_at_goal', 'Shots'], ['attempt_at_goal_on_target', 'On target'],
  ['xg', 'xG'], ['possession', 'Possession'], ['passes', 'Passes'], ['passes_completed', 'Passes completed'],
  ['corners', 'Corners'], ['fouls_against', 'Fouls'],
] as const

function stat(stats: Record<string, unknown> | undefined, key: string) {
  const raw = stats?.[key]
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : null
}
function format(value: number | null, key?: string) {
  if (value == null) return '–'
  if (key === 'total_distance') return `${(value >= 1000 ? value / 1000 : value).toFixed(2)} km`
  if (key?.includes('speed')) return `${value.toFixed(2)} km/h`
  if (key === 'possession' && value <= 1) return `${Math.round(value * 100)}%`
  if (key === 'possession') return `${Math.round(value)}%`
  if (key && /rate|percentage|accuracy|conversion/.test(key)) return `${value.toFixed(1).replace(/\.0$/, '')}%`
  if (key === 'xg') return value.toFixed(2)
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
function label(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function PlayerGrid({ code, playerStats, playerNames }: { code: string; playerStats: StoredPlayerStats[]; playerNames: Map<number, string> }) {
  const players = playerStats
    .filter((row) => row.team_code === code)
    .map((row) => ({
      id: row.player_id,
      name: playerNames.get(row.player_id) ?? `#${row.player_id}`,
      goals: stat(row.stats, 'goals') ?? 0,
      assists: stat(row.stats, 'assists') ?? 0,
      minutes: stat(row.stats, 'total_competition_minutes_played') ?? stat(row.stats, 'minutes_played') ?? 0,
      shots: stat(row.stats, 'attempt_at_goal_on_target') ?? 0,
      xg: stat(row.stats, 'xg') ?? 0,
      saves: stat(row.stats, 'goalkeeper_saves') ?? 0,
      yellow: (stat(row.stats, 'yellow_cards') ?? 0) > 0,
      red: (stat(row.stats, 'red_cards') ?? 0) > 0,
    }))
    .filter((p) => p.goals > 0 || p.assists > 0 || p.minutes > 0 || p.shots > 0 || p.saves > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.shots - a.shots || b.saves - a.saves || b.minutes - a.minutes)

  if (!players.length) return <p className="text-xs text-texts/50 italic px-1">No player stats yet</p>

  return (
    <div className="space-y-0.5">
      {players.map((p) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 odd:bg-surface/60">
          <span className="flex-1 truncate text-xs font-semibold text-textp leading-none">{p.name}</span>
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] tabular-nums font-bold">
            {p.goals > 0 && <span className="text-primary">{p.goals}G</span>}
            {p.assists > 0 && <span className="text-blue">{p.assists}A</span>}
            {p.saves > 0 && <span className="text-gold">{p.saves} sv</span>}
            {p.shots > 0 && !p.goals && <span className="font-normal text-texts">{p.shots} sh</span>}
            {p.xg > 0.05 && <span className="font-normal text-texts">{p.xg.toFixed(2)} xG</span>}
            {p.yellow && <span className="inline-block h-3 w-[7px] rounded-[2px] bg-gold" title="Yellow card" />}
            {p.red && <span className="inline-block h-3 w-[7px] rounded-[2px] bg-coral" title="Red card" />}
            {p.minutes > 0 && <span className="font-normal text-texts/50">{`${p.minutes}′`}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function MatchFacts({ homeCode, awayCode, metadata, teamStats, playerStats, playerNames }: {
  homeCode: string; awayCode: string; metadata: unknown; teamStats: StoredTeamStats[]; playerStats: StoredPlayerStats[]; playerNames: Map<number, string>
}) {
  const [advanced, setAdvanced] = useState(false)
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Metadata
  const home = teamStats.find((row) => row.team_code === homeCode)?.stats
  const away = teamStats.find((row) => row.team_code === awayCode)?.stats
  const hasStats = Boolean(home || away)
  const hasPlayerStats = playerStats.some((row) => row.team_code === homeCode || row.team_code === awayCode)
  const candidates = METRICS.filter(([key]) => stat(home, key) != null || stat(away, key) != null)
  const extraMetrics = useMemo(() => Array.from(new Set([...Object.keys(home ?? {}), ...Object.keys(away ?? {})]))
    .filter((key) => !METRICS.some(([base]) => base === key) && ((stat(home, key) ?? 0) > 0 || (stat(away, key) ?? 0) > 0))
    .sort((a, b) => label(a).localeCompare(label(b)))
    .map((key) => [key, label(key)] as const), [away, home])
  const visibleCandidates = advanced ? [...candidates, ...extraMetrics] : candidates
  const location = [meta.venue, meta.city].filter(Boolean).join(' · ')
  const conditions = [
    meta.weather?.temperature != null ? `${format(meta.weather.temperature)}°C` : null,
    meta.weather?.type ?? null,
    meta.weather?.windSpeed != null ? `${format(meta.weather.windSpeed)} km/h wind` : null,
  ].filter(Boolean).join(' · ')
  const hasDetails = Boolean(location || meta.attendance || meta.officials?.length || meta.weather?.temperature != null)

  if (!hasStats && !hasDetails && !hasPlayerStats) return null
  return <section className="space-y-3">
    {hasDetails && <Card className="p-4 sm:p-5">
      <SectionHeader title="Match details" sub="Official FIFA match-centre data" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {location && <Fact label="Venue" value={location} />}
        {meta.attendance != null && <Fact label="Attendance" value={meta.attendance.toLocaleString()} />}
        {conditions && <Fact label="Conditions" value={conditions} />}
        {meta.matchNumber != null && <Fact label="Match" value={`#${meta.matchNumber}`} />}
        {meta.officials?.[0]?.name && <Fact label={meta.officials[0].role ?? 'Referee'} value={meta.officials[0].name} />}
      </div>
    </Card>}

    {(hasStats || hasPlayerStats) && <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><SectionHeader title="Match stats" sub="Verified tournament stats" />{extraMetrics.length > 0 && <button onClick={() => setAdvanced((value) => !value)} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold text-texts hover:text-textp">{advanced ? 'Essentials' : `More (${extraMetrics.length})`}</button>}</div>
      {hasStats && <>
        <div className="mt-3 flex items-center justify-between px-0.5 text-xs font-extrabold text-textp"><span className="flex items-center gap-1.5"><FlagChip code={homeCode} w={18} h={12} r={2} />{homeCode}</span><span className="flex items-center gap-1.5">{awayCode}<FlagChip code={awayCode} w={18} h={12} r={2} /></span></div>
        <div className="mt-2 space-y-2.5">
          {visibleCandidates.map(([key, metric]) => {
            const homeValue = stat(home, key), awayValue = stat(away, key)
            const total = Math.max((homeValue ?? 0) + (awayValue ?? 0), 1)
            const homeWidth = Math.max(8, ((homeValue ?? 0) / total) * 100)
            const awayWidth = Math.max(8, ((awayValue ?? 0) / total) * 100)
            return <div key={key}>
              <div className="grid grid-cols-[42px_1fr_42px] items-center gap-2 text-xs"><span className="text-left font-black tabular-nums text-textp">{format(homeValue, key)}</span><span className="text-center text-[10px] font-bold uppercase tracking-wider text-texts">{metric}</span><span className="text-right font-black tabular-nums text-textp">{format(awayValue, key)}</span></div>
              <div className="mt-1 flex h-1.5 gap-1"><span className="rounded-full bg-primary" style={{ width: `${homeWidth}%` }} /><span className="ml-auto rounded-full bg-blue" style={{ width: `${awayWidth}%` }} /></div>
            </div>
          })}
        </div>
      </>}
      {hasPlayerStats && <div className="mt-4 border-t border-border/60 pt-4 grid sm:grid-cols-2 gap-4">
        {[{ code: homeCode }, { code: awayCode }].map(({ code }) => (
          <div key={code}>
            <div className="flex items-center gap-1.5 mb-2"><FlagChip code={code} w={16} h={11} r={2} /><span className="text-[10px] font-bold uppercase tracking-wider text-texts">{code}</span></div>
            <PlayerGrid code={code} playerStats={playerStats} playerNames={playerNames} />
          </div>
        ))}
      </div>}
    </Card>}
  </section>
}

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-texts">{factLabel}</p><p className="mt-0.5 truncate text-xs font-bold text-textp" title={value}>{value}</p></div>
}

export function readableMatchStat(key: string) { return label(key) }
