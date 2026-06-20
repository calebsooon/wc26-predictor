import { createClient } from '@supabase/supabase-js'

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !url || !serviceKey) {
  console.error('Set ADMIN_EMAIL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY before running this command.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
let page = 1
let userId: string | null = null

while (!userId) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  const match = data.users.find((user) => user.email?.toLowerCase() === email)
  if (match) {
    userId = match.id
    break
  }
  if (data.users.length < 1000) break
  page++
}

if (!userId) {
  console.error(`No Auth user found for ${email}. Sign up in the app first, then run this command again.`)
  process.exit(1)
}

const { error } = await supabase.from('profiles').update({ is_admin: true }).eq('id', userId)
if (error) throw error
console.log(`Granted global organizer access to ${email}.`)
