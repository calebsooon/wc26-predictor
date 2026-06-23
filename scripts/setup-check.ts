import { createClient } from '@supabase/supabase-js'

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const missing = required.filter((key) => !process.env[key])

async function main() {
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  try { new URL(url) } catch {
    console.error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const tables = ['profiles', 'matches', 'leagues', 'players', 'sync_runs', 'match_participants', 'fifa_raw_snapshots'] as const
  let failed = false

  for (const table of tables) {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1)
    if (error) {
      failed = true
      console.error(`${table}: ${error.message}`)
    } else {
      console.log(`${table}: ready`)
    }
  }

  const optional = ['CRON_SECRET', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
  const missingOptional = optional.filter((key) => !process.env[key])
  if (missingOptional.length) console.log(`Optional launch features disabled until configured: ${missingOptional.join(', ')}`)

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (adminEmail) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) {
      failed = true
      console.error(`Admin bootstrap check: ${error.message}`)
    } else {
      const user = data.users.find((candidate) => candidate.email?.toLowerCase() === adminEmail)
      const { data: profile, error: profileError } = user
        ? await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
        : { data: null, error: null }
      if (!user || profileError || !profile?.is_admin) {
        failed = true
        console.error(`Admin bootstrap check: ${adminEmail} does not have organizer access`)
      } else {
        console.log(`Admin bootstrap check: ${adminEmail} is ready`)
      }
    }
  }

  if (failed) {
    console.error('Setup check failed. Apply migrations and complete the optional ADMIN_EMAIL bootstrap check, then try again.')
    process.exit(1)
  }

  console.log('Hosted Supabase setup is ready.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
