/**
 * Downloads WC2026 team crests from FIFA's public picture API and stores them
 * in Supabase Storage (fifa-media bucket), then updates fifa_teams.crest_url.
 *
 * Source URL: https://api.fifa.com/api/v3/picture/flags-sq-5/{CODE}
 * Run: npm run data:team-crests
 */
import { createClient } from '@supabase/supabase-js'
import { TEAMS } from '@/lib/teams'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase environment variables')

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
const BUCKET = 'fifa-media'

const codes = Object.keys(TEAMS)

async function downloadCrest(code: string): Promise<string> {
  const url = `https://api.fifa.com/api/v3/picture/flags-sq-5/${code}`
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`${res.status} from FIFA picture API`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength < 100) throw new Error(`Response too small (${bytes.byteLength}b) — likely an error page`)
  const ct = res.headers.get('content-type') ?? 'image/png'
  const ext = ct.includes('svg') ? 'svg' : ct.includes('webp') ? 'webp' : 'png'
  const path = `teams/${code}-crest.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: ct.split(';')[0].trim(),
    cacheControl: '31536000',
    upsert: true,
  })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function main() {
  console.log(`Caching crests for ${codes.length} WC2026 teams…\n`)
  const failures: string[] = []
  const updates: Array<{ code: string; crest_url: string }> = []

  for (const code of codes) {
    try {
      const publicUrl = await downloadCrest(code)
      updates.push({ code, crest_url: publicUrl })
      console.log(`  ✓ ${code}`)
    } catch (err) {
      failures.push(code)
      console.warn(`  ✗ ${code}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (updates.length > 0) {
    console.log(`\nWriting ${updates.length} crest URLs to fifa_teams…`)
    for (const { code, crest_url } of updates) {
      const { error } = await supabase.from('fifa_teams').update({ crest_url }).eq('code', code)
      if (error) console.warn(`  DB update failed for ${code}: ${error.message}`)
    }
  }

  console.log(`\nDone — ${updates.length} crests cached, ${failures.length} failed.`)
  if (failures.length) console.log('Failed:', failures.join(', '))
}

main().catch((err) => { console.error(err); process.exit(1) })
