import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { snapshotLeagueRanks } from '@/lib/snapshot'

export async function POST() {
  const supabase = createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const snapshotted = await snapshotLeagueRanks(createServiceSupabaseClient())
  return NextResponse.json({ snapshotted })
}
