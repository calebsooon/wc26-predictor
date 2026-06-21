'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, EmptyState, PageHeader, Pill, SearchIcon, Skeleton, TrophyIcon, UsersIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { FLAG_GRADIENTS, POSITION_ABBR, POSITION_ORDER } from '@/lib/teams'
import { useUrlState } from '@/lib/url-state'

type StatMap = Record<string, number>
type Match = { id: string; home_team: string; away_team: string; match_date: string; real_home_score: number | null; real_away_score: number | null; group_name: string | null }
type Team = { code: string; name: string; confederation: Confederation; group_letter: string | null; is_host: boolean; flag_url: string | null; crest_url: string | null; stats: StatMap; updated_at: string }
type Confederation = 'AFC' | 'CAF' | 'CONCACAF' | 'CONMEBOL' | 'OFC' | 'UEFA'
type TeamPlayer = {
  player_id: number; fifa_player_id: number; jersey_number: number | null; position: string | null; height_cm: number | null; weight_kg: number | null; stats: StatMap
  player: { name: string; photo_url: string | null; dob: string | null; injured: boolean; injury_type: string | null }
}
type TeamDetail = { team: Team; players: TeamPlayer[]; matches: Match[]; picks: number[] }

const CONFEDS: Array<'All' | Confederation> = ['All', 'AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA']
const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Unclassified']
const GOALKEEPER_NUMBERS = new Set([1, 12, 13, 22, 23])
const number = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0
const stat = (stats: StatMap, key: string) => number(stats[key])
const displayStat = (value: number, decimals = 2) => Number.isInteger(value) ? String(value) : value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')

function age(dob: string | null) {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  return today.getFullYear() - birth.getFullYear() - Number(today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()))
}

function completed(match: Match) { return match.real_home_score != null && match.real_away_score != null }
function resultFor(match: Match, code: string) {
  if (!completed(match)) return null
  const isHome = match.home_team === code
  const own = isHome ? match.real_home_score! : match.real_away_score!
  const opposition = isHome ? match.real_away_score! : match.real_home_score!
  return own > opposition ? 'W' : own < opposition ? 'L' : 'D'
}
function scoreline(match: Match) {
  return completed(match) ? `${match.real_home_score}–${match.real_away_score}` : 'vs'
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value))
}

function FormDots({ code, matches }: { code: string; matches: Match[] }) {
  const results = matches.filter(completed).filter((match) => match.home_team === code || match.away_team === code).slice(-5).map((match) => resultFor(match, code))
  if (!results.length) return <span className="text-texts text-xs">No result yet</span>
  const tone: Record<string, string> = { W: 'bg-primary', D: 'bg-gold', L: 'bg-coral' }
  const resultMatches = matches.filter(completed).filter((match) => match.home_team === code || match.away_team === code).slice(-5)
  return <div className="flex gap-1.5">{resultMatches.map((match, index) => <Link key={match.id} href={`/match/${match.id}`} title={`${resultFor(match, code)} · ${scoreline(match)}`} className={`w-2.5 h-2.5 rounded-full ring-2 ring-transparent transition hover:scale-125 hover:ring-white/70 ${tone[results[index] ?? '']}`} aria-label={`Open ${code} match: ${scoreline(match)}`} />)}</div>
}

function TeamCard({ team, matches, onSelect }: { team: Team; matches: Match[]; onSelect: () => void }) {
  const completedMatches = matches.filter((match) => completed(match) && (match.home_team === team.code || match.away_team === team.code))
  const future = matches.find((match) => !completed(match) && (match.home_team === team.code || match.away_team === team.code))
  const group = team.group_letter ? `Group ${team.group_letter}` : 'Knockout stage'
  const gradient = FLAG_GRADIENTS[team.code] ?? 'linear-gradient(135deg,#173b54,#497c96)'
  return (
      <Card hover className="overflow-hidden h-full border-border group-hover:border-primary/50">
        <button onClick={onSelect} className="relative h-[142px] w-full p-5 text-left text-white overflow-hidden" style={team.crest_url ? undefined : { background: gradient }}>
          {team.crest_url && <Image src={team.crest_url} alt="" fill className="object-cover object-center" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/15 to-black/70" />
          <div className="relative flex items-start justify-between gap-3">
            <FlagChip code={team.code} w={32} h={21} r={4} />
            {team.is_host && <span className="text-[10px] uppercase tracking-[0.12em] font-extrabold px-2 py-1 rounded-full bg-black/40 shadow-sm">Host</span>}
          </div>
          <div className="relative mt-7">
            <p className="inline-flex rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.13em] uppercase text-white shadow-sm">{team.confederation}</p>
            <h2 className="text-xl leading-tight font-extrabold mt-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">{team.name}</h2>
          </div>
        </button>
        <div className="p-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs">
          <span className="text-texts">Stage</span>{team.group_letter ? <Link href={`/groups?group=${team.group_letter}&tab=stand`} className="text-textp font-semibold text-right hover:text-primary">{group}</Link> : <span className="text-textp font-semibold text-right">{group}</span>}
          <span className="text-texts">Tournament form</span><div className="justify-self-end"><FormDots code={team.code} matches={completedMatches} /></div>
          <span className="text-texts">Last match</span>{completedMatches.at(-1) ? <Link href={`/match/${completedMatches.at(-1)!.id}`} className="text-textp font-semibold text-right hover:text-primary">{`${scoreline(completedMatches.at(-1)!)} ${completedMatches.at(-1)!.home_team === team.code ? completedMatches.at(-1)!.away_team : completedMatches.at(-1)!.home_team}`}</Link> : <span className="text-textp font-semibold text-right">—</span>}
          <span className="text-texts">Next match</span>{future ? <Link href={`/match/${future.id}`} className="text-textp font-semibold text-right hover:text-primary">{`${formatDate(future.match_date)} · ${future.home_team === team.code ? future.away_team : future.home_team}`}</Link> : <span className="text-textp font-semibold text-right">—</span>}
        </div>
      </Card>
  )
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <Card className="p-4 min-w-0"><p className="text-[11px] text-texts font-semibold uppercase tracking-wide truncate">{label}</p><p className="text-2xl font-extrabold tabular-nums mt-2 text-textp">{value}</p>{hint && <p className="text-[11px] text-texts mt-1">{hint}</p>}</Card>
}

function Leader({ label, player, value, suffix = '', decimals = 0 }: { label: string; player?: TeamPlayer; value: number; suffix?: string; decimals?: number }) {
  if (!player) return null
  return (
    <Card className="relative overflow-hidden min-h-[142px] p-4 flex flex-col justify-between">
      <div className="pr-20"><p className="text-[10px] font-bold text-texts uppercase tracking-[0.1em]">{label}</p><p className="font-extrabold text-textp mt-2 leading-tight">{player.player.name}</p><p className="text-2xl font-extrabold tabular-nums text-primary mt-3">{displayStat(value, decimals)}{suffix}</p></div>
      {player.player.photo_url && <Image src={player.player.photo_url} alt="" width={98} height={136} className="absolute right-0 bottom-0 h-[132px] w-[88px] object-contain object-bottom" />}
    </Card>
  )
}

function FixtureStrip({ code, matches }: { code: string; matches: Match[] }) {
  return <div className="grid sm:grid-cols-2 gap-3">{matches.slice(-5).map((match) => {
    const opponent = match.home_team === code ? match.away_team : match.home_team
    const result = resultFor(match, code)
    return <Link key={match.id} href={`/match/${match.id}`} className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3 transition hover:border-primary/60 hover:bg-surface2"><FlagChip code={opponent} w={22} h={15} r={3} /><div className="min-w-0 flex-1"><p className="text-xs text-texts">{completed(match) ? formatDate(match.match_date) : `Next · ${formatDate(match.match_date)}`}</p><p className="font-bold text-sm text-textp">{completed(match) ? `${scoreline(match)} vs ${opponent}` : `vs ${opponent}`}</p></div>{result && <span className={`text-xs font-extrabold ${result === 'W' ? 'text-primary' : result === 'L' ? 'text-coral' : 'text-gold'}`}>{result}</span>}</Link>
  })}</div>
}

function TeamProfile({ detail, onBack }: { detail: TeamDetail; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'squad' | 'fixtures'>('overview')
  const [advancedStats, setAdvancedStats] = useState(false)
  const [playerStatView, setPlayerStatView] = useState<'essentials' | 'attacking' | 'progression' | 'physical' | 'defending' | 'goalkeeping'>('essentials')
  const { team, players, matches } = detail
  const picks = new Set(detail.picks)
  const played = stat(team.stats, 'matches_played')
  const wins = matches.filter(completed).filter((match) => resultFor(match, team.code) === 'W').length
  const draws = matches.filter(completed).filter((match) => resultFor(match, team.code) === 'D').length
  const losses = matches.filter(completed).filter((match) => resultFor(match, team.code) === 'L').length
  const squadGroup = (player: TeamPlayer) => player.position === 'Goalkeeper' || (player.position === 'Unknown' && player.jersey_number != null && GOALKEEPER_NUMBERS.has(player.jersey_number)) ? 'Goalkeeper' : player.position === 'Unknown' || !player.position ? 'Unclassified' : player.position
  const activePlayers = players.filter((p) => stat(p.stats, 'total_competition_minutes_played') > 0)
  const leaders = (key: string) => [...activePlayers].sort((a, b) => stat(b.stats, key) - stat(a.stats, key))[0]
  const leadersGK = (key: string) => [...activePlayers].filter((p) => squadGroup(p) === 'Goalkeeper').sort((a, b) => stat(b.stats, key) - stat(a.stats, key))[0]
  const passAccuracy = stat(team.stats, 'passes') ? Math.round(stat(team.stats, 'passes_completed') / stat(team.stats, 'passes') * 100) : 0
  const filteredMatches = matches.filter((match) => match.home_team === team.code || match.away_team === team.code)
  const positionPlayers = [...players].sort((a, b) => (POSITION_ORDER[squadGroup(a)] ?? 99) - (POSITION_ORDER[squadGroup(b)] ?? 99) || (a.jersey_number ?? 99) - (b.jersey_number ?? 99))
  const teamExtraMetrics = [
    ['Possession', stat(team.stats, 'possession'), '%'], ['xG', displayStat(stat(team.stats, 'xg')), ''], ['Corners', stat(team.stats, 'corners'), ''], ['Crosses', stat(team.stats, 'crosses'), ''],
    ['Cross completion', stat(team.stats, 'crosses') ? Math.round(stat(team.stats, 'crosses_completed') / stat(team.stats, 'crosses') * 100) : 0, '%'], ['Take-ons', stat(team.stats, 'take_ons_completed'), ''],
    ['Sprints', stat(team.stats, 'sprints'), ''], ['Forced turnovers', stat(team.stats, 'forced_turnovers'), ''], ['Line breaks', stat(team.stats, 'linebreaks_attempted_completed'), ''], ['Saves', stat(team.stats, 'goalkeeper_saves'), ''],
    ['Fouls', stat(team.stats, 'fouls_for'), ''], ['Cards', stat(team.stats, 'yellow_cards') + stat(team.stats, 'red_cards'), ''],
  ] as const
  const playerLeaderViews = {
    essentials: [['Most goals', 'goals', '', 0], ['Most assists', 'assists', '', 0], ['Most passes', 'passes', '', 0], ['Most minutes', 'total_competition_minutes_played', '', 0]],
    attacking: [['Most shots on target', 'attempt_at_goal_on_target', '', 0], ['Most crosses', 'crosses_completed', '', 0], ['Most take-ons', 'take_ons_completed', '', 0], ['Most xG', 'xg', '', 2]],
    progression: [['Most passes', 'passes', '', 0], ['Best pass completion', 'passing_accuracy_rate', '%', 2], ['Most line breaks', 'linebreaks_attempted_completed', '', 0], ['Most forced turnovers', 'forced_turnovers', '', 0]],
    physical: [['Most sprints', 'sprints', '', 0], ['Top speed', 'top_speed', ' km/h', 2], ['Most distance', 'total_distance', ' km', 2], ['Most minutes', 'total_competition_minutes_played', '', 0]],
    defending: [['Most forced turnovers', 'forced_turnovers', '', 0], ['Most tackles', 'tackles', '', 0], ['Most interceptions', 'interceptions', '', 0], ['Most clean sheets', 'clean_sheets', '', 0]],
    goalkeeping: [['Most saves', 'goalkeeper_saves', '', 0], ['Best save percentage', 'goalkeeper_save_percentage', '%', 2], ['Most clean sheets', 'clean_sheets', '', 0], ['Most minutes', 'total_competition_minutes_played', '', 0]],
  } as const

  return <div className="space-y-6">
    <button onClick={onBack} className="text-sm font-bold text-texts hover:text-textp">← All teams</button>
    <section className="relative overflow-hidden rounded-[22px] border border-border bg-card p-6 sm:p-8">
      {team.crest_url
        ? <Image src={team.crest_url} alt="" fill className="object-cover object-center opacity-20" />
        : <div className="absolute inset-0 opacity-20" style={{ background: FLAG_GRADIENTS[team.code] }} />}
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="flex items-center gap-4"><div className="flex items-center gap-3 shrink-0"><FlagChip code={team.code} w={56} h={37} r={7} /></div><div><p className="text-xs uppercase tracking-[0.14em] font-bold text-texts">{team.confederation} · {team.group_letter ? <Link href={`/groups?group=${team.group_letter}&tab=stand`} className="underline decoration-primary/50 underline-offset-2 hover:text-primary">Group {team.group_letter}</Link> : 'World Cup 2026'}</p><h1 className="text-3xl font-extrabold text-textp mt-1">{team.name}</h1></div></div>
        <div className="text-right"><p className="text-xs text-texts">Tournament form</p><div className="mt-2"><FormDots code={team.code} matches={filteredMatches} /></div></div>
      </div>
    </section>
    <div className="flex gap-2 border-b border-border overflow-x-auto">{(['overview', 'squad', 'fixtures'] as const).map((name) => <button key={name} onClick={() => setTab(name)} className={`capitalize px-3 pb-3 text-sm font-bold border-b-2 ${tab === name ? 'border-primary text-primary' : 'border-transparent text-texts hover:text-textp'}`}>{name}</button>)}</div>
    {tab === 'overview' && <div className="space-y-6">
      <section><div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-extrabold text-textp">Team stats</h2><button onClick={() => setAdvancedStats((value) => !value)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-texts transition hover:text-textp">{advancedStats ? 'Show essentials' : 'More FIFA stats'}</button></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric label="Record" value={`${wins}-${draws}-${losses}`} hint={`${played} played`} /><Metric label="Goals" value={stat(team.stats, 'goals')} hint={`${stat(team.stats, 'goals_conceded')} conceded`} /><Metric label="Passes" value={stat(team.stats, 'passes').toLocaleString()} hint={`${passAccuracy}% completed`} /><Metric label="Shots on target" value={stat(team.stats, 'attempt_at_goal_on_target')} hint={`${stat(team.stats, 'attempt_at_goal')} attempts`} /></div>{advancedStats && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">{teamExtraMetrics.map(([label, value, suffix]) => <Metric key={label} label={label} value={`${value}${suffix}`} />)}</div>}</section>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold text-textp">Player stats</h2>
          <div className="flex gap-1.5 overflow-x-auto">
            {(['essentials', 'attacking', 'progression', 'physical', 'defending', 'goalkeeping'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setPlayerStatView(v)}
                className={`h-7 px-3 rounded-xl text-[11.5px] font-bold whitespace-nowrap capitalize border transition ${
                  playerStatView === v
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-surface text-texts hover:text-textp'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {playerLeaderViews[playerStatView].map(([label, key, suffix, decimals]) => {
            const leaderFn = playerStatView === 'goalkeeping' ? leadersGK : leaders
            const p = leaderFn(key)
            return <Leader key={key} label={label} player={p} value={stat(p?.stats ?? {}, key)} suffix={suffix} decimals={decimals} />
          })}
        </div>
      </section>
      <section><h2 className="font-extrabold text-textp mb-3">Fixtures & form</h2><FixtureStrip code={team.code} matches={filteredMatches} /></section>
    </div>}
    {tab === 'squad' && <div className="space-y-7">{POSITIONS.map((position) => { const group = positionPlayers.filter((player) => squadGroup(player) === position); if (!group.length) return null; const label = position === 'Unclassified' ? 'Other squad members' : `${position}s`; const badge = position === 'Unclassified' ? '—' : POSITION_ABBR[position]; return <section key={position}><div className="flex items-center gap-2 mb-3"><Pill tone="default">{badge}</Pill><h2 className="font-extrabold text-textp">{label}</h2><span className="text-xs text-texts">{group.length}</span>{position === 'Unclassified' && <span className="text-[11px] text-texts">FIFA has not assigned a position yet</span>}</div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{group.map((player) => <Card key={player.fifa_player_id} className="relative overflow-hidden min-h-[272px] p-4 flex flex-col justify-between"><div className="flex justify-between items-start relative z-10"><span className="w-7 h-7 grid place-items-center rounded-lg bg-surface2 text-sm font-extrabold tabular-nums">{player.jersey_number ?? '—'}</span>{player.player.injured && <span className="px-1.5 py-0.5 rounded bg-coral/15 text-coral text-[10px] font-bold">OUT</span>}</div>{player.player.photo_url && <Image src={player.player.photo_url} alt={player.player.name} width={180} height={245} className="absolute inset-x-0 bottom-8 h-[216px] w-full object-contain object-bottom" />}<div className="relative z-10 mt-auto pt-3 bg-gradient-to-t from-card via-card/95"><div className="flex gap-1.5 items-center"><FlagChip code={team.code} w={18} h={12} r={2} />{picks.has(player.player_id) && <span className="text-gold text-xs" title="Your first-scorer pick">★</span>}</div><p className="font-extrabold text-sm text-textp mt-1 truncate">{player.player.name}</p><p className="text-[11px] text-texts">{age(player.player.dob) != null ? `${age(player.player.dob)} years` : 'Age unavailable'} · {position === 'Unclassified' ? 'Position pending' : position}</p>{(player.height_cm || player.weight_kg) && <p className="text-[10px] text-texts/60 mt-px tabular-nums">{[player.height_cm ? `${player.height_cm}cm` : null, player.weight_kg ? `${player.weight_kg}kg` : null].filter(Boolean).join(' · ')}</p>}{stat(player.stats, 'total_competition_minutes_played') > 0 && <p className="text-[10px] font-bold text-primary mt-0.5 tabular-nums">{[stat(player.stats, 'goals') > 0 ? `${stat(player.stats, 'goals')}G` : null, stat(player.stats, 'assists') > 0 ? `${stat(player.stats, 'assists')}A` : null, `${stat(player.stats, 'total_competition_minutes_played')}'`].filter(Boolean).join(' · ')}</p>}</div></Card>)}</div></section>})}</div>}
    {tab === 'fixtures' && <FixtureStrip code={team.code} matches={filteredMatches} />}
  </div>
}

export default function SquadsPage() {
  const { searchParams, replaceUrl } = useUrlState()
  const [directory, setDirectory] = useState<{ teams: Team[]; matches: Match[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confederation, setConfederation] = useState<'All' | Confederation>('All')
  const selected = searchParams.get('team')?.toUpperCase() ?? null
  const details = useRef(new Map<string, TeamDetail>())
  const [detail, setDetail] = useState<TeamDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => { fetch('/api/teams').then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setDirectory(payload) }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load teams')) }, [])
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    const cached = details.current.get(selected)
    if (cached) { setDetail(cached); return }
    setLoadingDetail(true)
    fetch(`/api/teams/${selected}`).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); details.current.set(selected, payload); setDetail(payload) }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load team')).finally(() => setLoadingDetail(false))
  }, [selected])

  const teams = useMemo(() => (directory?.teams ?? []).filter((team) => {
    const haystack = `${team.name} ${team.code} ${team.confederation}`.toLowerCase()
    return (confederation === 'All' || team.confederation === confederation) && haystack.includes(query.trim().toLowerCase())
  }), [directory, confederation, query])
  if (error) return <EmptyState icon={<UsersIcon size={22} />} title="Couldn't load team centre" desc={error} />
  if (!directory) return <div className="space-y-4"><Skeleton className="h-12 w-52" /><Skeleton className="h-72 rounded-2xl" /></div>
  if (selected) return <div className="max-w-6xl mx-auto">{loadingDetail || !detail ? <div className="space-y-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div> : <TeamProfile detail={detail} onBack={() => replaceUrl({ team: null })} />}</div>

  return <div className="space-y-6 max-w-7xl mx-auto">
    <PageHeader eyebrow="World Cup 2026" title="Teams & squads" sub="Official FIFA tournament squads, team form, and live tournament leaders." />
    <div className="flex flex-col gap-3"><div className="flex gap-2 overflow-x-auto pb-1">{CONFEDS.map((item) => <button key={item} onClick={() => setConfederation(item)} className={`h-9 px-3.5 rounded-xl text-sm font-bold whitespace-nowrap border ${confederation === item ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-surface text-texts hover:text-textp'}`}>{item}</button>)}</div><div className="relative max-w-md"><SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-texts pointer-events-none" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teams…" className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-border bg-surface text-textp placeholder:text-texts focus:outline-none focus:border-primary" /></div></div>
    {teams.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{teams.map((team) => <TeamCard key={team.code} team={team} matches={directory.matches} onSelect={() => replaceUrl({ team: team.code })} />)}</div> : <EmptyState icon={<TrophyIcon size={22} />} title="No teams found" desc="Try a different team or confederation." />}
  </div>
}
