import { NextResponse } from 'next/server'
import type { createServerSupabaseClient } from '@/lib/supabase-server'

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function requireAdmin(supabase: ServerSupabase): Promise<NextResponse | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
