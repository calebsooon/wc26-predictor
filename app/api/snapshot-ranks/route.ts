import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { data, error } = await supabase
    .from('predictions')
    .select('user_id, points_awarded')
    .not('points_awarded', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agg = new Map<string, number>()
  for (const r of (data ?? []) as { user_id: string; points_awarded: number }[]) {
    agg.set(r.user_id, (agg.get(r.user_id) ?? 0) + r.points_awarded)
  }

  const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return NextResponse.json({ snapshotted: 0 })

  const now = new Date().toISOString()
  const snapshots = sorted.map(([user_id, points], idx) => ({
    user_id, rank: idx + 1, points, snapshot_at: now,
  }))

  const { error: insErr } = await supabase.from('rank_snapshots').insert(snapshots)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ snapshotted: snapshots.length, snapshot_at: now })
}
