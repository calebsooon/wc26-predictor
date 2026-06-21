export interface LeagueReadPick {
  user_id: string
  pred_home: number | null
  pred_away: number | null
  pred_btts: boolean | null
  pred_total_goals: number | null
  pred_first_scorer_id: number | null
  pred_no_scorer?: boolean | null
}

export interface LeagueRead {
  total: number
  outcomes: { home: number; draw: number; away: number }
  scorelines: Array<{ label: string; count: number }>
  btts: { yes: number; no: number; total: number }
  totalGoals: Array<{ value: number; count: number }>
  scorers: Array<{ id: number | 'none'; count: number }>
  crowd: 'majority' | 'minority' | 'unique' | 'none'
}

function ranked<T>(values: T[], key: (value: T) => string | number) {
  const counts = new Map<string | number, number>()
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
}

export function buildLeagueRead(picks: LeagueReadPick[], userId: string | null): LeagueRead {
  const scored = picks.filter((p) => p.pred_home != null && p.pred_away != null)
  const outcomes = { home: 0, draw: 0, away: 0 }
  for (const p of scored) {
    if (p.pred_home! > p.pred_away!) outcomes.home++
    else if (p.pred_home === p.pred_away) outcomes.draw++
    else outcomes.away++
  }
  const scoreRank = ranked(scored, (p) => `${p.pred_home}–${p.pred_away}`)
  const bttsPicks = picks.filter((p) => p.pred_btts != null)
  const goalRank = ranked(picks.filter((p) => p.pred_total_goals != null), (p) => p.pred_total_goals!)
  const scorerRank = ranked(
    picks.filter((p) => p.pred_first_scorer_id != null || p.pred_no_scorer),
    (p) => p.pred_no_scorer ? 'none' : p.pred_first_scorer_id!,
  )

  const mine = picks.find((p) => p.user_id === userId)
  const mineScore = mine?.pred_home != null && mine.pred_away != null ? `${mine.pred_home}–${mine.pred_away}` : null
  const mineCount = mineScore ? (scoreRank.find((row) => row.value === mineScore)?.count ?? 0) : 0
  const topCount = scoreRank[0]?.count ?? 0
  const crowd: LeagueRead['crowd'] = !mineScore ? 'none'
    : mineCount === 1 ? 'unique'
    : mineCount === topCount ? 'majority'
    : 'minority'

  return {
    total: scored.length,
    outcomes,
    scorelines: scoreRank.slice(0, 3).map((row) => ({ label: String(row.value), count: row.count })),
    btts: { yes: bttsPicks.filter((p) => p.pred_btts).length, no: bttsPicks.filter((p) => !p.pred_btts).length, total: bttsPicks.length },
    totalGoals: goalRank.slice(0, 3).map((row) => ({ value: Number(row.value), count: row.count })),
    scorers: scorerRank.slice(0, 3).map((row) => ({ id: row.value === 'none' ? 'none' : Number(row.value), count: row.count })),
    crowd,
  }
}
