import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { data, error } = await supabase
    .from('sync_runs')
    .select('kind, trigger_source, status, started_at, finished_at, details')
    .order('started_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const latest: Record<string, unknown> = {}
  for (const run of data ?? []) {
    const row = run as { kind: string }
    if (!latest[row.kind]) latest[row.kind] = run
  }
  return NextResponse.json({ latest })
}
