'use strict'

// scripts/seed-squads.js
// Seeds WC2026 squad data from wc2026_squads.json into the `players` table.
//
// Usage:
//   node scripts/seed-squads.js [path/to/wc2026_squads.json]
//
// Required env vars (loaded from .env.local or .env):
//   SUPABASE_URL              – your project URL
//   SUPABASE_SERVICE_ROLE_KEY – service-role key (bypasses RLS)

const path = require('path')
const fs   = require('fs')

const envLocal = path.resolve(__dirname, '../.env.local')
const envFile  = path.resolve(__dirname, '../.env')
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envFile })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE    = 100

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// Map FIFA squad JSON team names → playerKey values used in the DB and lib/teams.ts
const TEAM_NAME_MAP = {
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina',
  'USA':                    'United States',
  'Turkiye':                'Turkey',
  'Curacao':                'Curaçao',
  'Cape Verde':             'Cape Verde Islands',
  'DR Congo':               'Congo DR',
}

function resolveTeamName(raw) {
  return TEAM_NAME_MAP[raw] ?? raw
}

// Stable integer ID: fifa_id * 100 + shirt_number (e.g. team 43911, shirt 7 → 4391107)
function syntheticId(fifaId, shirtNumber) {
  return parseInt(fifaId, 10) * 100 + (shirtNumber ?? 0)
}

function findJson() {
  const candidates = [
    process.argv[2],
    path.resolve(__dirname, '../wc2026_squads.json'),
    path.resolve(process.env.HOME || '', 'wc2026_squads.json'),
  ].filter(Boolean)
  for (const p of candidates) if (fs.existsSync(p)) return p
  return null
}

async function main() {
  console.log('\n🏆  WC 2026 Squad Seeder\n' + '─'.repeat(44))

  const jsonPath = findJson()
  if (!jsonPath) {
    console.error('❌  wc2026_squads.json not found.')
    console.error('    Place it in the project root or pass the path as an argument.')
    process.exit(1)
  }
  console.log(`📂  Reading ${jsonPath}`)

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const squads = data.squads
  if (!squads || squads.length === 0) {
    console.error('❌  No squads found in JSON')
    process.exit(1)
  }
  console.log(`✅  ${squads.length} teams loaded\n`)

  const rows = []
  for (const squad of squads) {
    const teamName = resolveTeamName(squad.team)
    for (const p of squad.players) {
      rows.push({
        id:            syntheticId(squad.fifa_id, p.shirt_number),
        name:          p.name,
        position:      p.position    || null,
        nationality:   teamName,
        team_id:       parseInt(squad.fifa_id, 10),
        team_name:     teamName,
        jersey_number: p.shirt_number ?? null,
        group_letter:  squad.group    || null,
        dob:           p.dob          || null,
        club:          p.club         || null,
        last_updated:  new Date().toISOString(),
      })
    }
    console.log(`  ✔  ${squad.team.padEnd(32)} ${squad.players.length} players`)
  }

  console.log(`\n📤  Clearing existing players …`)
  const { error: delErr } = await supabase.from('players').delete().gte('id', 0)
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`)

  console.log(`📤  Inserting ${rows.length} players in batches of ${BATCH_SIZE} …`)
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('players').insert(batch)
    if (error) throw new Error(`Insert error at row ${i}: ${error.message}`)
    inserted += batch.length
    process.stdout.write(`  ${inserted}/${rows.length}\r`)
  }

  console.log(`\n✅  Done — ${rows.length} players across ${squads.length} teams`)
}

main().catch(err => {
  console.error('\n❌ ', err.message)
  process.exit(1)
})
