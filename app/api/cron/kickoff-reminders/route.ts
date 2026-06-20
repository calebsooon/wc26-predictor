import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Runs every 15 min through the authenticated GitHub Actions scheduler. Finds
// matches kicking off in the next
// 25–35 min window and sends a push reminder to all subscribers.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const lo = new Date(now.getTime() + 25 * 60 * 1000).toISOString()
  const hi = new Date(now.getTime() + 35 * 60 * 1000).toISOString()

  const { data: matches } = await supabase
    .from('matches')
    .select('id, home_team, away_team, match_date')
    .gte('match_date', lo)
    .lte('match_date', hi)
    .eq('is_locked', false)

  if (!matches || matches.length === 0) return NextResponse.json({ sent: 0 })

  let totalSent = 0
  for (const m of matches as { id: string; home_team: string; away_team: string; match_date: string }[]) {
    // Find subscribers who have NOT submitted a prediction for this match
    const { data: hasPred } = await supabase
      .from('predictions')
      .select('user_id')
      .eq('match_id', m.id)

    const havePred = new Set((hasPred ?? []).map((p: { user_id: string }) => p.user_id))

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id')

    const targetIds = (subs ?? [])
      .map((s: { user_id: string }) => s.user_id)
      .filter((uid: string) => !havePred.has(uid))

    if (targetIds.length === 0) continue

    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY! },
      body: JSON.stringify({
        title: `${m.home_team} vs ${m.away_team} kicks off in 30 min`,
        body: 'No prediction yet — lock one in before it\'s too late.',
        url: `/match/${m.id}`,
        userIds: targetIds,
      }),
    })
    const json = await res.json().catch(() => ({}))
    totalSent += json.sent ?? 0
  }

  return NextResponse.json({ sent: totalSent, matches: matches.length })
}
