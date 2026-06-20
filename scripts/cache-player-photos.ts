/**
 * Downloads player headshots (currently hotlinked from Wikimedia Commons) and
 * re-hosts them in Supabase Storage, then repoints players.photo_url at our own
 * public URL. This eliminates the Wikimedia 429 rate-limiting on hotlinks and
 * makes images fast + cacheable through next/image.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/cache-player-photos.ts
 *
 * Idempotent: re-running only re-fetches photos not already on our storage.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'player-photos'
const UA = 'MatchDay-WC2026/1.0 (+https://github.com/calebsooon/wc26-predictor)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

async function fetchImage(url: string, attempt = 0): Promise<{ buf: ArrayBuffer; type: string } | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' } })
  if (res.status === 429) {
    if (attempt >= 3) return null
    await sleep(1000 * 2 ** attempt)         // 1s, 2s, 4s backoff
    return fetchImage(url, attempt + 1)
  }
  if (!res.ok) return null
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!EXT[type]) return null
  return { buf: await res.arrayBuffer(), type }
}

async function main() {
  // Public bucket (ignore "already exists").
  const { error: bErr } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (bErr && !/exist/i.test(bErr.message)) throw bErr

  const players: { id: number; photo_url: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('players').select('id, photo_url').not('photo_url', 'is', null).range(from, from + 999)
    if (!data || data.length === 0) break
    players.push(...(data as { id: number; photo_url: string }[])); if (data.length < 1000) break
  }
  // Only those still pointing at Wikimedia (skip ones already re-hosted).
  const todo = players.filter((p) => /wikimedia\.org/.test(p.photo_url))
  console.log(`Re-hosting ${todo.length} of ${players.length} player photos…`)

  let done = 0, failed = 0
  for (const p of todo) {
    try {
      const img = await fetchImage(p.photo_url)
      if (!img) { failed++; await sleep(350); continue }
      const path = `${p.id}.${EXT[img.type]}`
      const { error: uErr } = await supabase.storage.from(BUCKET).upload(path, img.buf, { contentType: img.type, upsert: true })
      if (uErr) { failed++; await sleep(350); continue }
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
      await supabase.from('players').update({ photo_url: publicUrl }).eq('id', p.id)
      done++
      if (done % 50 === 0) console.log(`  …${done} done`)
    } catch { failed++ }
    await sleep(350)   // be polite to Wikimedia
  }
  console.log(`\nDone. Re-hosted ${done}, failed ${failed}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
