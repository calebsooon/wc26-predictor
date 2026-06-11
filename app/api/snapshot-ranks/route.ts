import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { snapshotLeagueRanks } from '@/lib/snapshot'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const snapshotted = await snapshotLeagueRanks(supabase)
  return NextResponse.json({ snapshotted })
}
