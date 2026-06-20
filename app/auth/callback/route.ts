import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && user) {
      const username = user.email!.split('@')[0]
      await supabase
        .from('profiles')
        .upsert({ id: user.id, username }, { onConflict: 'id', ignoreDuplicates: true })
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
