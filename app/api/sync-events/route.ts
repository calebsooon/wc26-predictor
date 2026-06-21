import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { finishSyncRun, startSyncRun, type SyncTrigger } from '@/lib/sync-runs'
import { syncMatchSubstitutions } from '@/lib/substitution-sync'

async function runSync(trigger: SyncTrigger, matchId?: string) {
  const service = createServiceSupabaseClient()
  const runId = await startSyncRun(service, 'events', trigger)
  try {
    let query = service.from('matches').select('id, home_team, away_team, provider_fixture_id').not('provider_fixture_id', 'is', null)
    if (matchId) query = query.eq('id', matchId)
    else {
      const now = Date.now()
      query = query.gte('match_date', new Date(now - 5 * 3600_000).toISOString()).lte('match_date', new Date(now + 2 * 3600_000).toISOString())
    }
    const { data, error } = await query
    if (error) throw error
    const result = await syncMatchSubstitutions(service, (data ?? []) as never[])
    const status = result.errors.length ? (result.written ? 'partial' : 'failed') : 'success'
    await finishSyncRun(service, runId, status, result)
    return { ok: true, ...result }
  } catch (error) {
    const result = { error: error instanceof Error ? error.message : 'Unknown error' }
    await finishSyncRun(service, runId, 'failed', result)
    return result
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied
  const body = await request.json().catch(() => ({})) as { match_id?: string }
  const result = await runSync('admin', body.match_id)
  return NextResponse.json(result, { status: 'error' in result ? 500 : 200 })
}

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await runSync('cron')
  return NextResponse.json(result, { status: 'error' in result ? 500 : 200 })
}
