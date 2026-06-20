import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { snapshotLeagueRanks } from '@/lib/snapshot'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const denied = await requireAdmin(supabase)
  if (denied) return denied

  const { written, overtakes } = await snapshotLeagueRanks(createServiceSupabaseClient())

  // Fire overtake push notifications
  if (overtakes.length > 0 && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    for (const o of overtakes) {
      fetch(`${siteUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY! },
        body: JSON.stringify({
          title: "You've been overtaken",
          body: `You're now ${ordinal(o.newRank)} on the leaderboard — time to close the gap.`,
          url: '/leaderboard',
          userIds: [o.userId],
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ snapshotted: written, overtakes: overtakes.length })
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
