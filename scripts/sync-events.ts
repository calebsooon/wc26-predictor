/**
 * Residential in-match event sync. Run while matches are live to turn verified
 * provider substitutions into the current XI shown in MatchDay.
 */
import { createClient } from '@supabase/supabase-js'
import { syncMatchSubstitutions } from '@/lib/substitution-sync'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !key) throw new Error('Missing Supabase environment variables')
const service = createClient(url, key)

async function main() {
  let query = service.from('matches').select('id, home_team, away_team, provider_fixture_id').not('provider_fixture_id', 'is', null)
  if (process.env.MATCH_ID) query = query.eq('id', process.env.MATCH_ID)
  else {
    const now = Date.now()
    query = query.gte('match_date', new Date(now - 5 * 3600_000).toISOString()).lte('match_date', new Date(now + 2 * 3600_000).toISOString())
  }
  const { data, error } = await query
  if (error) throw error
  const result = await syncMatchSubstitutions(service, (data ?? []) as never[])
  console.log(`Substitutions: ${result.written} synced${result.errors.length ? `; ${result.errors.join('; ')}` : ''}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
