// scripts/seed-squads.js
// Seeds World Cup 2026 squads into the `players` Supabase table.
//
// Usage:
//   node scripts/seed-squads.js
//
// Required env vars (in .env at project root):
//   SUPABASE_URL              – your project URL
//   SUPABASE_SERVICE_ROLE_KEY – service-role key (bypasses RLS)
//
// Optional env var:
//   FOOTBALL_DATA_API_KEY     – football-data.org token (free at football-data.org)
//                               Required to call the live API; without it the
//                               script falls back to scripts/squads-fallback.json
//
// Fallback file format (scripts/squads-fallback.json):
//   {
//     "teams": [
//       {
//         "id": 123,
//         "name": "Brazil",
//         "squad": [
//           { "id": 456, "name": "Vinícius Jr.", "position": "Forward",
//             "nationality": "Brazilian", "shirtNumber": 7 }
//         ]
//       }
//     ]
//   }

'use strict'

const path    = require('path')
const fs      = require('fs')
const https   = require('https')
// Load .env.local first (Next.js convention), fall back to .env
const envLocal = path.resolve(__dirname, '../.env.local')
const envFile  = path.resolve(__dirname, '../.env')
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envFile })

const { createClient } = require('@supabase/supabase-js')

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL    = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const FD_API_KEY      = process.env.FOOTBALL_DATA_API_KEY  // optional
const FALLBACK_FILE   = path.resolve(__dirname, 'squads-fallback.json')
const API_URL         = 'https://api.football-data.org/v4/competitions/WC/teams'
const BATCH_SIZE      = 50   // upsert rows per batch

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'wc26-predictor/1.0', ...headers },
    }
    https.get(url, options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
        } else {
          try { resolve(JSON.parse(body)) }
          catch (e) { reject(new Error('Invalid JSON: ' + e.message)) }
        }
      })
    }).on('error', reject)
  })
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchTeams() {
  // 1. Try live API if key is available
  if (FD_API_KEY) {
    console.log('🌐  Fetching squads from football-data.org …')
    try {
      const data = await fetchJson(API_URL, { 'X-Auth-Token': FD_API_KEY })
      if (data.teams && data.teams.length > 0) {
        console.log(`✅  Live API returned ${data.teams.length} teams`)
        return data.teams
      }
      console.warn('⚠️   API returned no teams — falling back to static file')
    } catch (err) {
      console.warn(`⚠️   API error (${err.message}) — falling back to static file`)
    }
  } else {
    console.log('ℹ️   No FOOTBALL_DATA_API_KEY set — skipping live API')
  }

  // 2. Fall back to static JSON
  if (!fs.existsSync(FALLBACK_FILE)) {
    console.error(`❌  Fallback file not found: ${FALLBACK_FILE}`)
    console.error('    Create scripts/squads-fallback.json with { "teams": [...] }')
    process.exit(1)
  }
  console.log('📂  Loading squads from scripts/squads-fallback.json …')
  const raw = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8'))
  if (!raw.teams || raw.teams.length === 0) {
    console.error('❌  Fallback file has no teams')
    process.exit(1)
  }
  console.log(`✅  Fallback file has ${raw.teams.length} teams`)
  return raw.teams
}

// ─── Transform ────────────────────────────────────────────────────────────────

function transformTeam(team) {
  const squad = team.squad ?? []
  if (squad.length === 0) {
    console.warn(`  ⚠️  ${team.name}: no squad data`)
  }
  return squad.map(player => ({
    id:            player.id,
    name:          player.name,
    position:      player.position   ?? null,
    nationality:   player.nationality ?? null,
    team_id:       team.id,
    team_name:     team.name,
    jersey_number: player.shirtNumber ?? null,
    last_updated:  new Date().toISOString(),
  }))
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function upsertBatch(players) {
  const { error } = await supabase
    .from('players')
    .upsert(players, { onConflict: 'id' })
  if (error) throw new Error(`Supabase upsert error: ${error.message}`)
}

async function main() {
  console.log('\n🏆  WC 2026 Squad Seeder\n' + '─'.repeat(40))

  const teams   = await fetchTeams()
  let allPlayers = []

  for (const team of teams) {
    const players = transformTeam(team)
    allPlayers = allPlayers.concat(players)
    console.log(`  ✔  ${team.name.padEnd(30)} ${players.length} players`)
  }

  if (allPlayers.length === 0) {
    console.error('❌  No player records to insert')
    process.exit(1)
  }

  console.log(`\n📤  Upserting ${allPlayers.length} players in batches of ${BATCH_SIZE} …`)

  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    const batch = allPlayers.slice(i, i + BATCH_SIZE)
    await upsertBatch(batch)
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, allPlayers.length)}/${allPlayers.length}\r`)
  }

  console.log(`\n✅  Done — ${allPlayers.length} players upserted across ${teams.length} teams`)
}

main().catch(err => {
  console.error('\n❌ ', err.message)
  process.exit(1)
})
