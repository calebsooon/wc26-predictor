import { createClient } from '@supabase/supabase-js'

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // Check total players
  const { count: total } = await s.from('players').select('*', { count: 'exact', head: true })
  console.log('Total players:', total)
  // Sample a few rows to see columns
  const { data: sample, error } = await s.from('players').select('*').limit(3)
  console.log('Sample rows:', JSON.stringify(sample, null, 2))
  if (error) console.log('Error:', error)
}
main().catch(console.error)
