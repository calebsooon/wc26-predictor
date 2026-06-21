/** Pull FIFA's published Golden Boot tables and cache them for the app. */
import { createClient } from '@supabase/supabase-js'
import { normaliseFifaGoldenBootActors, type FifaGoldenBootActor, type FifaGoldenBootRow } from '@/lib/golden-boot'
import { groupPlayersByCode, type RosterPlayer } from '@/lib/team-match'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !serviceKey) throw new Error('Missing Supabase environment variables')

const supabase = createClient(url, serviceKey)
const FIFA_API = 'https://cxm-api.fifa.com/fifaplusweb/api'
const FIFA_GAMEDAY_API = 'https://gameday-prod.fifa.mangodev.co.uk/1-0'
const FIFA_SEASON_ID = '285023'
const FIFA_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

interface FifaStory {
  actors: FifaGoldenBootActor[]
  tags: Array<{ name: string; value: unknown }>
}

function storyTag(story: FifaStory, name: string) {
  return story.tags.find((tag) => tag.name === name)?.value
}

async function fifaToken() {
  const response = await fetch(`${FIFA_API}/external/gameDay/token`, { headers: { 'user-agent': FIFA_USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`FIFA token request failed (${response.status})`)
  const payload = await response.json() as { token?: string }
  if (!payload.token) throw new Error('FIFA token response did not contain a token')
  return payload.token
}

async function fifaStory(token: string, rankedBy: 'goals' | 'assists', page: number): Promise<FifaStory> {
  const classification = `urn:gd:story:classification:gcp_top_scorer:competitionId:${FIFA_SEASON_ID}:${rankedBy}:rank_asc:page:${page}$`
  const query = `(and resourceStatus==\`urn:gd:resourceStatus:active\` _externalId~\`${classification}\`)`
  const params = new URLSearchParams({ query, skip: '0', limit: '1', sort: 'tags.name==urn:gd:tag:story:fifa:column_number:asc' })
  const response = await fetch(`${FIFA_GAMEDAY_API}/stories?${params}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/plain, */*',
      origin: 'https://www.fifa.com',
      referer: 'https://www.fifa.com/',
      'user-agent': FIFA_USER_AGENT,
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`FIFA ${rankedBy} page ${page} request failed (${response.status}): ${(await response.text()).slice(0, 160)}`)
  const payload = await response.json() as { items?: FifaStory[] }
  const story = payload.items?.[0]
  if (!story?.actors?.length) throw new Error(`FIFA ${rankedBy} page ${page} did not contain any players`)
  return story
}

function compactImage(source: string) {
  return `${source}${source.includes('?') ? '&' : '?'}quality=70&io=transform%3Afit%2Cwidth%3A480`
}

async function cacheGoldenBootPhotos(rows: FifaGoldenBootRow[]) {
  const { data, error } = await supabase.storage.from('fifa-media').list('golden-boot', { limit: 1000 })
  if (error) throw error
  const cached = new Set((data ?? []).map((file) => file.name))
  const candidates = rows.filter((row) => row.photo_url?.includes('digitalhub.fifa.com'))
  let cursor = 0
  let downloaded = 0

  await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
    while (true) {
      const row = candidates[cursor++]
      if (!row) return
      const source = row.photo_url
      if (!source) continue
      const name = `${row.provider_player_id}.png`
      const path = `golden-boot/${name}`
      const ownUrl = supabase.storage.from('fifa-media').getPublicUrl(path).data.publicUrl
      if (cached.has(name)) { row.photo_url = ownUrl; continue }
      try {
        const response = await fetch(compactImage(source), { headers: { 'user-agent': FIFA_USER_AGENT }, signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength > 1048576) throw new Error('exceeded 1MB cache limit')
        const { error: uploadError } = await supabase.storage.from('fifa-media').upload(path, bytes, {
          contentType: 'image/png', cacheControl: '31536000', upsert: true,
        })
        if (uploadError) throw uploadError
        row.photo_url = ownUrl
        downloaded += 1
      } catch (cacheError) {
        // Never ship a provider URL to the client if the optional image cache
        // misses. The UI falls back to initials instead.
        row.photo_url = null
        console.warn(`  Golden Boot image ${row.provider_player_id} skipped: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`)
      }
    }
  }))
  return { candidates: candidates.length, downloaded }
}

async function allFifaActors(token: string, rankedBy: 'goals' | 'assists') {
  const first = await fifaStory(token, rankedBy, 1)
  const pages = Number(storyTag(first, 'urn:gd:tag:story:page_count'))
  if (!Number.isInteger(pages) || pages < 1 || pages > 100) throw new Error(`Unexpected FIFA ${rankedBy} page count: ${pages}`)
  const stories = [first]
  for (let page = 2; page <= pages; page += 1) stories.push(await fifaStory(token, rankedBy, page))
  return stories.flatMap((story) => story.actors)
}

async function main() {
  console.log('Fetching FIFA’s published Golden Boot tables…')
  const [{ data: players, error: playersError }, token] = await Promise.all([
    supabase.from('players').select('id, name, team_name'),
    fifaToken(),
  ])
  if (playersError) throw playersError
  const rosterByCode = groupPlayersByCode((players ?? []) as RosterPlayer[])
  const [goalActors, assistActors] = await Promise.all([
    allFifaActors(token, 'goals'),
    allFifaActors(token, 'assists'),
  ])
  const stats = new Map(normaliseFifaGoldenBootActors(goalActors, rosterByCode, 'goals').map((row) => [row.provider_player_id, row]))
  for (const row of normaliseFifaGoldenBootActors(assistActors, rosterByCode, 'assists')) {
    const existing = stats.get(row.provider_player_id)
    if (existing) {
      existing.fifa_assist_rank = row.fifa_assist_rank
      existing.fifa_assist_order = row.fifa_assist_order
    }
    else stats.set(row.provider_player_id, row)
  }
  const rows = Array.from(stats.values()).filter((row) => row.goals > 0 || row.assists > 0)
  if (rows.length < 10) throw new Error(`FIFA returned only ${rows.length} players with a goal or assist; refusing to replace cached standings`)
  const media = await cacheGoldenBootPhotos(rows)
  const { error } = await supabase.rpc('replace_golden_boot_stats', { p_rows: rows })
  if (error) throw error
  console.log(`Done — ${rows.length} FIFA-ranked player rows cached from ${goalActors.length} scorer and ${assistActors.length} assist records (${media.downloaded} new Golden Boot images; ${media.candidates} total cached candidates).`)
}

main().catch((error) => { console.error(error); process.exit(1) })
