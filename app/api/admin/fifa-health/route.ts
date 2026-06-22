import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'

export const dynamic = 'force-dynamic'

type MatchRow = {
  id: string
  home_team: string
  away_team: string
  match_date: string
  fifa_event_id: number | null
  fifa_updated_at: string | null
}

async function readAll<T>(read: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  try {
    const [matchesResult, runsResult, statsResult, lineups] = await Promise.all([
      supabase.from('matches').select('id, home_team, away_team, match_date, fifa_event_id, fifa_updated_at').order('match_date'),
      supabase.from('sync_runs').select('kind, status, started_at, finished_at, source_updated_at, records_read, records_written, error_summary, details, scope').in('kind', ['fifa_matches', 'fifa_teams', 'golden_boot']).order('started_at', { ascending: false }).limit(30),
      supabase.from('match_team_stats').select('match_id, team_code'),
      readAll<{ match_id: string; team_code: string; is_starting: boolean }>(async (from, to) => {
        return await supabase.from('lineups').select('match_id, team_code, is_starting').range(from, to)
      }),
    ])
    if (matchesResult.error) throw matchesResult.error
    if (runsResult.error) throw runsResult.error
    if (statsResult.error) throw statsResult.error

    const matches = (matchesResult.data ?? []) as MatchRow[]
    const started = matches.filter((match) => match.fifa_event_id != null && new Date(match.match_date).getTime() <= Date.now())
    const starters = new Map<string, number>()
    for (const row of lineups) {
      if (!row.is_starting) continue
      const key = `${row.match_id}:${row.team_code}`
      starters.set(key, (starters.get(key) ?? 0) + 1)
    }
    const statPacks = new Map<string, number>()
    for (const row of statsResult.data ?? []) statPacks.set(row.match_id, (statPacks.get(row.match_id) ?? 0) + 1)
    const withLineups = started.filter((match) =>
      (starters.get(`${match.id}:${match.home_team}`) ?? 0) >= 11 &&
      (starters.get(`${match.id}:${match.away_team}`) ?? 0) >= 11,
    )
    const withStats = started.filter((match) => (statPacks.get(match.id) ?? 0) >= 2)
    const missingLineups = started.filter((match) => !withLineups.includes(match)).slice(0, 8)
    const missingStats = started.filter((match) => !withStats.includes(match)).slice(0, 8)
    const sourceUpdates = matches.map((match) => match.fifa_updated_at).filter((value): value is string => Boolean(value)).sort()
    const latestSourceUpdate = sourceUpdates.at(-1) ?? null
    const ageMinutes = latestSourceUpdate ? Math.max(0, Math.round((Date.now() - new Date(latestSourceUpdate).getTime()) / 60_000)) : null

    const latest: Record<string, unknown> = {}
    for (const run of runsResult.data ?? []) {
      const key = (run as { kind: string }).kind
      if (!latest[key]) latest[key] = run
    }
    return NextResponse.json({
      mapped: matches.filter((match) => match.fifa_event_id != null).length,
      started: started.length,
      completeLineups: withLineups.length,
      completeStats: withStats.length,
      missingLineups,
      missingStats,
      latestSourceUpdate,
      ageMinutes,
      latest,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load FIFA health' }, { status: 500 })
  }
}
