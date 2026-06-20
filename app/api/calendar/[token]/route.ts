import { NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { buildCalendar, icsFilename, type IcsMatch } from '@/lib/ics'
import { GW_NAMES } from '@/lib/prizes'

// Public, token-secured calendar feed. Calendar apps can't authenticate, so the
// per-user `calendar_token` (an unguessable uuid) gates access instead of a session.
// Re-fetched periodically by the subscriber's calendar → events stay current.

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params
  const token = rawToken.replace(/\.ics$/i, '')
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const supabase = createServiceSupabaseClient()

  // Validate the token belongs to a real profile.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('calendar_token', token)
    .maybeSingle()
  if (!profile) return new NextResponse('Not found', { status: 404 })

  const url = new URL(request.url)
  const gwParam = url.searchParams.get('gw')
  const gw = gwParam ? Number(gwParam) : null
  const reminderParam = url.searchParams.get('reminder')
  const reminderMinutes = reminderParam === null ? 60 : Math.max(0, Number(reminderParam) || 0)
  const isDownload = url.searchParams.get('download') === '1'

  let query = supabase
    .from('matches')
    .select('id, match_date, home_team, away_team, group_name, gw_number, rounds(name)')
    .order('match_date', { ascending: true })

  if (gw && gw >= 1 && gw <= 8) query = query.eq('gw_number', gw)

  const { data, error } = await query
  if (error) return new NextResponse('Error', { status: 500 })

  type Row = {
    id: string; match_date: string; home_team: string; away_team: string
    group_name: string | null; gw_number: number | null; rounds: { name: string } | null
  }
  const matches: IcsMatch[] = ((data ?? []) as unknown as Row[]).map((m) => ({
    id: m.id,
    match_date: m.match_date,
    home_team: m.home_team,
    away_team: m.away_team,
    group_name: m.group_name,
    gw_number: m.gw_number,
    round_name: m.rounds?.name ?? null,
  }))

  const scopeName = gw && GW_NAMES[gw] ? GW_NAMES[gw] : 'All Matches'
  const name = `MatchDay — ${scopeName}`
  const ics = buildCalendar(matches, { name, reminderMinutes })

  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }
  if (isDownload) {
    headers['Content-Disposition'] = `attachment; filename="${icsFilename(scopeName)}"`
  }
  return new NextResponse(ics, { headers })
}
