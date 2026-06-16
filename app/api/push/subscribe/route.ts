import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { userId, subscription } = await req.json() as {
      userId: string
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
    }
    if (!userId || !subscription?.endpoint) {
      return NextResponse.json({ error: 'Missing userId or subscription' }, { status: 400 })
    }
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }, { onConflict: 'user_id,endpoint' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, endpoint } = await req.json() as { userId: string; endpoint: string }
    if (!userId || !endpoint) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
