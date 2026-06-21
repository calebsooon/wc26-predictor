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
  ['possession', 'Possession'], ['passes', 'Passes'], ['passes_completed', 'Passes completed'],
  ['corners', 'Corners'], ['fouls_against', 'Fouls'],
] as const

function stat(stats: Record<string, unknown> | undefined, key: string) {
  const raw = stats?.[key]
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : null
}
function format(value: number | null, key?: string) {
  if (value == null) return '–'
  if (key === 'possession' && value <= 1) return `${Math.round(value * 100)}%`
  if (key === 'possession') return `${Math.round(value)}%`
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
function label(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function MatchFacts({ homeCode, awayCode, metadata, teamStats, playerStats, playerNames }: {
  homeCode: string; awayCode: string; metadata: unknown; teamStats: StoredTeamStats[]; playerStats: StoredPlayerStats[]; playerNames: Map<number, string>
}) {
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Metadata
  const home = teamStats.find((row) => row.team_code === homeCode)?.stats
  const away = teamStats.find((row) => row.team_code === awayCode)?.stats
  const hasStats = Boolean(home || away)
  const candidates = METRICS.filter(([key]) => stat(home, key) != null || stat(away, key) != null)
  const leading = (code: string) => playerStats.filter((row) => row.team_code === code).map((row) => {
    const goals = stat(row.stats, 'goals') ?? 0
    const assists = stat(row.stats, 'assists') ?? 0
    const passes = stat(row.stats, 'passes_completed') ?? stat(row.stats, 'passes') ?? 0
    const saves = stat(row.stats, 'saves') ?? 0
    const score = goals * 10000 + assists * 1000 + passes + saves
    const primary = goals ? `${goals} goal${goals === 1 ? '' : 's'}` : assists ? `${assists} assist${assists === 1 ? '' : 's'}` : passes ? `${format(passes)} passes` : saves ? `${format(saves)} saves` : null
    return { ...row, score, primary }
  }).filter((row) => row.primary).sort((a, b) => b.score - a.score).slice(0, 2)
  const leaders = [...leading(homeCode), ...leading(awayCode)]
  const location = [meta.venue, meta.city].filter(Boolean).join(' · ')
  const hasDetails = Boolean(location || meta.attendance || meta.officials?.length || meta.weather?.temperature != null)

  if (!hasStats && !hasDetails) return null
  return <section className="space-y-3">
    {hasDetails && <Card className="p-4 sm:p-5">
      <SectionHeader title="Match details" sub="Official FIFA match-centre data" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {location && <Fact label="Venue" value={location} />}
        {meta.attendance != null && <Fact label="Attendance" value={meta.attendance.toLocaleString()} />}
        {meta.weather?.temperature != null && <Fact label="Conditions" value={`${format(meta.weather.temperature)}°C${meta.weather.type ? ` · ${meta.weather.type}` : ''}`} />}
        {meta.matchNumber != null && <Fact label="Match" value={`#${meta.matchNumber}`} />}
        {meta.officials?.[0]?.name && <Fact label={meta.officials[0].role ?? 'Referee'} value={meta.officials[0].name} />}
      </div>
    </Card>}

    {hasStats && <Card className="p-4 sm:p-5">
      <SectionHeader title="Match stats" sub="Verified tournament stats" />
      <div className="mt-3 flex items-center justify-between px-0.5 text-xs font-extrabold text-textp"><span className="flex items-center gap-1.5"><FlagChip code={homeCode} w={18} h={12} r={2} />{homeCode}</span><span className="flex items-center gap-1.5">{awayCode}<FlagChip code={awayCode} w={18} h={12} r={2} /></span></div>
      <div className="mt-2 space-y-2.5">
        {candidates.map(([key, metric]) => {
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
      {leaders.length > 0 && <div className="mt-4 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
        {leaders.map((row) => <div key={row.player_id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"><span className="min-w-0 truncate text-xs font-bold text-textp">{playerNames.get(row.player_id) ?? 'Player'}</span><span className="ml-2 shrink-0 text-[10px] font-bold text-primary">{row.primary}</span></div>)}
      </div>}
    </Card>}
  </section>
}

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-texts">{factLabel}</p><p className="mt-0.5 truncate text-xs font-bold text-textp" title={value}>{value}</p></div>
}

export function readableMatchStat(key: string) { return label(key) }
