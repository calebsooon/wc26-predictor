/**
 * Back-fills player photo, date of birth, club and position from Wikidata.
 * No API key required (Wikidata/Wikimedia are open). Matches our roster to
 * Wikidata items by name, keeping only candidates described as footballers.
 *
 * Usage:
 *   # dry run, no DB writes, first N players (eyeball match quality):
 *   DRY_RUN=1 LIMIT=15 SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<key> \
 *     npx tsx --env-file=.env.local scripts/fetch-wikidata-players.ts
 *
 *   # full run — refreshes ALL players (writes to DB):
 *   npx tsx --env-file=.env.local scripts/fetch-wikidata-players.ts
 *
 *   # gap-fill — only players still missing a photo/club/dob (faster refresh):
 *   ONLY_MISSING=1 npx tsx --env-file=.env.local scripts/fetch-wikidata-players.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const DRY_RUN = process.env.DRY_RUN === '1'
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity
// ONLY_MISSING=1 → only players still missing a photo/club/dob (fast gap-fill refresh).
const ONLY_MISSING = process.env.ONLY_MISSING === '1'

if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1) }
if (!SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const WD = 'https://www.wikidata.org/w/api.php'
const UA = 'MatchDay-WC2026/1.0 (https://matchday.app; dartharyan2017@gmail.com)'
const FOOTBALLER_HINT = /football|soccer/i

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function wd<T>(params: Record<string, string>): Promise<T> {
  const url = `${WD}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

interface SearchHit { id: string; label?: string; description?: string }
async function searchPlayer(name: string): Promise<SearchHit | null> {
  const data = await wd<{ search: SearchHit[] }>({
    action: 'wbsearchentities', search: name, language: 'en', uselang: 'en', type: 'item', limit: '6',
  })
  const hits = data.search ?? []
  // Prefer a candidate explicitly described as a footballer; else nothing (conservative).
  return hits.find((h) => h.description && FOOTBALLER_HINT.test(h.description)) ?? null
}

interface Claim { mainsnak: { datavalue?: { value: any } }; qualifiers?: Record<string, { datavalue?: { value: any } }[]> }
interface Entity { claims?: Record<string, Claim[]>; labels?: Record<string, { value: string }> }

function pickCurrentTeamQid(claims: Record<string, Claim[]>): string | null {
  const teams = claims.P54 ?? []
  if (teams.length === 0) return null
  // Prefer a statement with a start date (P580) and no end date (P582) = current.
  const current = teams.filter((c) => !c.qualifiers?.P582)
  const pool = current.length ? current : teams
  const withStart = pool
    .map((c) => ({ qid: c.mainsnak.datavalue?.value?.id as string | undefined, start: c.qualifiers?.P580?.[0]?.datavalue?.value?.time as string | undefined }))
    .filter((x) => x.qid)
  withStart.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))
  return withStart[0]?.qid ?? null
}

async function main() {
  // Supabase caps each read at 1000 rows — paginate to get the whole roster.
  const PAGE = 1000
  type Row = { id: number; name: string; nationality: string | null; team_name: string; photo_url: string | null; club: string | null; dob: string | null }
  const allPlayers: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('players').select('id, name, nationality, team_name, photo_url, club, dob').order('id').range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allPlayers.push(...(data as Row[]))
    if (data.length < PAGE) break
  }
  // Gap-fill mode skips players who already have all three fields.
  const candidates = ONLY_MISSING
    ? allPlayers.filter((p) => !p.photo_url || !p.club || !p.dob)
    : allPlayers
  const roster = candidates.slice(0, LIMIT)
  if (ONLY_MISSING) console.log(`Gap-fill: ${candidates.length} of ${allPlayers.length} players are missing photo/club/dob.`)
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Resolving ${roster.length} players against Wikidata…\n`)

  // Phase 1 — name → QID
  const resolved: { id: number; name: string; qid: string }[] = []
  let unmatched = 0
  for (const p of roster) {
    try {
      const hit = await searchPlayer(p.name)
      if (hit) resolved.push({ id: p.id, name: p.name, qid: hit.id })
      else { unmatched++; if (DRY_RUN) console.log(`  ✗ ${p.name} — no footballer match`) }
    } catch (e) { console.warn(`  search failed for ${p.name}:`, (e as Error).message) }
    await sleep(120)
  }
  console.log(`\nMatched ${resolved.length}, unmatched ${unmatched}. Fetching entity data…\n`)

  // Phase 2 — batch-fetch entities (claims), 40 at a time
  const entities: Record<string, Entity> = {}
  for (let i = 0; i < resolved.length; i += 40) {
    const ids = resolved.slice(i, i + 40).map((r) => r.qid).join('|')
    const data = await wd<{ entities: Record<string, Entity> }>({ action: 'wbgetentities', ids, props: 'claims', languages: 'en' })
    Object.assign(entities, data.entities)
    await sleep(150)
  }

  // Phase 3 — resolve club QIDs → labels (one batch)
  const clubQids = new Set<string>()
  const perPlayerClub: Record<number, string | null> = {}
  for (const r of resolved) {
    const claims = entities[r.qid]?.claims
    const qid = claims ? pickCurrentTeamQid(claims) : null
    perPlayerClub[r.id] = qid
    if (qid) clubQids.add(qid)
  }
  const clubLabels: Record<string, string> = {}
  const clubList = [...clubQids]
  for (let i = 0; i < clubList.length; i += 40) {
    const ids = clubList.slice(i, i + 40).join('|')
    if (!ids) break
    const data = await wd<{ entities: Record<string, Entity> }>({ action: 'wbgetentities', ids, props: 'labels', languages: 'en' })
    for (const [qid, ent] of Object.entries(data.entities)) clubLabels[qid] = ent.labels?.en?.value ?? ''
    await sleep(150)
  }

  // Phase 4 — extract + write
  let written = 0
  for (const r of resolved) {
    const claims = entities[r.qid]?.claims
    if (!claims) continue
    const dobRaw = claims.P569?.[0]?.mainsnak.datavalue?.value?.time as string | undefined  // "+1996-05-04T00:00:00Z"
    const dob = dobRaw ? dobRaw.slice(1, 11) : null
    const imageFile = claims.P18?.[0]?.mainsnak.datavalue?.value as string | undefined
    const photo_url = imageFile
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile.replace(/ /g, '_'))}?width=256`
      : null
    const clubQid = perPlayerClub[r.id]
    let club = clubQid ? (clubLabels[clubQid] || null) : null
    // Some players' "current team" resolves to their national side — not a club.
    if (club && /national (football|soccer)?\s*team|men's national/i.test(club)) club = null

    if (DRY_RUN) {
      console.log(`  ✓ ${r.name} → ${r.qid}  dob=${dob ?? '–'}  club=${club ?? '–'}  photo=${photo_url ? 'yes' : 'no'}`)
      continue
    }
    const update: Record<string, unknown> = {}
    if (dob) update.dob = dob
    if (photo_url) update.photo_url = photo_url
    if (club) update.club = club
    if (Object.keys(update).length === 0) continue
    const { error: e } = await supabase.from('players').update(update).eq('id', r.id)
    if (e) console.warn(`  write failed ${r.name}:`, e.message)
    else written++
  }

  console.log(`\nDone.${DRY_RUN ? ' (dry run — no writes)' : ` Updated ${written} players.`}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
