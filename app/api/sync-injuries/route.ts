import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { kapi, kickoffConfigured, WC_LEAGUE, WC_SEASON } from '@/lib/kickoff'
import { matchPlayer, type RosterPlayer } from '@/lib/team-match'

interface KInjury { type: string | null; player: { id: number; name: string } | null }

// Pull the WC injury/suspension feed and flag matching players. POST = admin; GET = cron.
async function sync() {
  if (!kickoffConfigured()) return { error: 'KICKOFF_API_KEY not set', status: 500 }
  const service = createServiceSupabaseClient()

  // Paginate the injuries feed defensively.
  const injuries: KInjury[] = []
  for (let page = 1; page <= 20; page++) {
    const { response } = await kapi<KInjury>(`/injuries?league=${WC_LEAGUE}&season=${WC_SEASON}&page=${page}`)
    if (!response || response.length === 0) break
    injuries.push(...response)
    if (response.length < 100) break
  }

  const roster: RosterPlayer[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from('players').select('id, name, team_name').range(from, from + 999)
    if (!data || data.length === 0) break
    roster.push(...(data as RosterPlayer[])); if (data.length < 1000) break
  }

  // Resolve injured player ids (dedupe; keep first type seen).
  const flagged = new Map<number, string>()
  for (const inj of injuries) {
    if (!inj.player?.name) continue
    const hit = matchPlayer(inj.player.name, roster)
    if (hit && !flagged.has(hit.id)) flagged.set(hit.id, inj.type ?? 'Out')
  }

  // Clear all flags, then set the current ones.
  await service.from('players').update({ injured: false, injury_type: null }).eq('injured', true)
  let set = 0
  for (const [id, type] of Array.from(flagged)) {
    const { error } = await service.from('players').update({ injured: true, injury_type: type }).eq('id', id)
    if (!error) set++
  }

  return { ok: true, feed: injuries.length, flagged: set }
}

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  const r = await sync()
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await sync()
  return NextResponse.json(r, { status: 'error' in r ? (r.status as number) : 200 })
}
