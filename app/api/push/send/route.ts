import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL ?? 'admin@matchday.app'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface PushPayload {
  title: string
  body: string
  url?: string
  userIds?: string[]   // if omitted, sends to all subscribers
}

export async function POST(req: NextRequest) {
  // Only callable server-side via internal fetch with service key header
  const authHeader = req.headers.get('x-service-key')
  if (authHeader !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await req.json() as PushPayload
    let query = supabase.from('push_subscriptions').select('endpoint, p256dh, auth, user_id')
    if (payload.userIds?.length) {
      query = query.in('user_id', payload.userIds)
    }
    const { data: subs, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/dashboard' })
    const stale: string[] = []
    const results = await Promise.allSettled(
      (subs ?? []).map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        ).catch((err: { statusCode?: number }) => {
          if (err.statusCode === 410) stale.push(s.endpoint)
          throw err
        })
      )
    )

    // Clean up expired subscriptions
    if (stale.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale)
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length
    return NextResponse.json({ sent, total: subs?.length ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
