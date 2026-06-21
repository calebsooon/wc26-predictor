'use client'

import { Card, Pill, SectionHeader } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { buildLeagueRead, type LeagueReadPick } from '@/lib/league-read'

export function LeagueRead({
  homeName, awayName, homeCode, awayCode, picks, userId, playerNames,
  actual,
}: {
  homeName: string
  awayName: string
  homeCode: string
  awayCode: string
  picks: LeagueReadPick[]
  userId: string | null
  playerNames: Map<number, string>
  actual?: { home: number | null; away: number | null; firstScorerId?: number | null }
}) {
  const read = buildLeagueRead(picks, userId)
  if (!read.total) return null
  const pct = (n: number, total = read.total) => total ? Math.round(n / total * 100) : 0
  const bars = [
    { label: homeName, code: homeCode, count: read.outcomes.home, color: 'rgb(var(--primary))' },
    { label: 'Draw', code: 'draw', count: read.outcomes.draw, color: 'rgb(var(--texts))' },
    { label: awayName, code: awayCode, count: read.outcomes.away, color: 'rgb(var(--gold))' },
  ]
  const max = Math.max(...bars.map((bar) => bar.count), 1)
  const actualOutcome = actual?.home == null || actual?.away == null ? null : actual.home > actual.away ? homeCode : actual.home < actual.away ? awayCode : 'draw'
  const actualScore = actual?.home != null && actual?.away != null ? `${actual.home}–${actual.away}` : null
  const actualScoreCount = actualScore ? picks.filter((pick) => `${pick.pred_home}–${pick.pred_away}` === actualScore).length : 0
  const scorelines = actualScore && actualScoreCount > 0 && !read.scorelines.some((item) => item.label === actualScore)
    ? [{ label: actualScore, count: actualScoreCount }, ...read.scorelines.slice(0, 2)]
    : read.scorelines
  const actualTotal = actual?.home != null && actual?.away != null ? actual.home + actual.away : null
  const actualBtts = actual?.home != null && actual?.away != null ? actual.home > 0 && actual.away > 0 : null
  const actualScorerCount = actual?.firstScorerId ? picks.filter((pick) => pick.pred_first_scorer_id === actual.firstScorerId).length : 0
  const crowdLabel = read.crowd === 'majority' ? 'You’re with the majority' : read.crowd === 'minority' ? 'You’re backing a minority call' : read.crowd === 'unique' ? 'Your scoreline is unique' : null

  return (
    <Card className="p-5 sm:p-6 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="League Pulse" sub={`How ${read.total} league pick${read.total !== 1 ? 's' : ''} are shaping up`} />
        {crowdLabel && <Pill tone={read.crowd === 'unique' ? 'gold' : read.crowd === 'majority' ? 'green' : 'default'}>{crowdLabel}</Pill>}
      </div>
      <div className="mt-4 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.code} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[12px] font-bold text-textp truncate flex items-center gap-1.5">
              {bar.code !== 'draw' && <FlagChip code={bar.code} w={16} h={11} r={2} />}{bar.label}
            </span>
            <div className={`flex-1 h-5 rounded-full bg-surface border overflow-hidden ${actualOutcome === bar.code ? 'border-primary ring-2 ring-primary/20' : 'border-border/60'}`}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bar.count / max * 100}%`, background: bar.color }} />
            </div>
            <span className="w-10 text-right text-[12px] font-extrabold tabular-nums">{pct(bar.count)}%</span>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-border/60">
        <Insight title="Top scorelines">
          {scorelines.map((item) => <span key={item.label} className={`text-sm font-bold ${actualScore === item.label ? 'rounded-md bg-primary/15 px-1.5 py-0.5 text-primary' : 'text-textp'}`}>{item.label} <small className="text-texts font-semibold">{actualScore === item.label ? `${item.count} right · ` : ''}{pct(item.count)}%</small></span>)}
        </Insight>
        <Insight title="Goal outlook">
          {read.btts.total > 0 && <span className={`text-sm font-bold ${actualBtts != null && (actualBtts ? read.btts.yes : read.btts.no) > 0 ? 'text-primary' : 'text-textp'}`}>BTTS {pct(read.btts.yes, read.btts.total)}%{actualBtts != null && <small className="text-texts font-semibold"> · {actualBtts ? read.btts.yes : read.btts.no} right</small>}</span>}
          {read.totalGoals[0] && <span className={`text-sm font-bold ${actualTotal === read.totalGoals[0].value ? 'text-primary' : 'text-textp'}`}>{read.totalGoals[0].value} goals <small className="text-texts font-semibold">{actualTotal === read.totalGoals[0].value ? `${read.totalGoals[0].count} right` : 'most picked'}</small></span>}
        </Insight>
        <Insight title="First scorer">
          {read.scorers.length ? read.scorers.map((item) => <span key={String(item.id)} className={`text-sm font-bold truncate ${actual?.firstScorerId === item.id ? 'rounded-md bg-primary/15 px-1.5 py-0.5 text-primary' : 'text-textp'}`}>{item.id === 'none' ? 'No scorer' : playerNames.get(item.id) ?? 'Player'} <small className="text-texts font-semibold">{actual?.firstScorerId === item.id ? `${actualScorerCount} right · ` : ''}{pct(item.count)}%</small></span>) : <span className="text-sm text-texts">No picks yet</span>}
        </Insight>
      </div>
    </Card>
  )
}

function Insight({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl bg-surface border border-border/60 p-3 flex flex-col gap-1.5 min-w-0"><p className="text-[10px] uppercase tracking-wider font-bold text-texts">{title}</p>{children}</div>
}
