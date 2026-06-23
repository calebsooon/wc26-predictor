import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures: string[] = []

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const migrationDirectory = readdirSync(join(root, 'supabase/migrations'))
const migrations = migrationDirectory.filter((file) => /^\d{14}_.+\.sql$/.test(file)).sort()
if (migrationDirectory.some((file) => file.endsWith('.sql') && !/^\d{14}_.+\.sql$/.test(file))) {
  failures.push('Every Supabase migration must use the timestamped filename convention.')
}
if (new Set(migrations.map((file) => file.slice(0, 14))).size !== migrations.length) failures.push('Supabase migration timestamps must be unique.')

const legacyResultsRoute = join(root, 'app/api/fetch-results/route.ts')
if (existsSync(legacyResultsRoute)) failures.push('Legacy app/api/fetch-results route still exists; use sync-results only.')

for (const path of [
  'lib/kickoff.ts',
  'app/api/sync-injuries/route.ts',
  'scripts/sync-injuries.ts',
  'scripts/sync-lineups.ts',
  'scripts/sync-results.ts',
  'scripts/cache-player-photos.ts',
  'scripts/fill-missing-photos.ts',
]) {
  if (existsSync(join(root, path))) failures.push(`Retired provider file still exists: ${path}`)
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
const scripts = packageJson.scripts ?? {}
if (!scripts['data:fifa:daily']?.includes('data:fifa:events')) {
  failures.push('data:fifa:daily must include the official FIFA event sync.')
}
if (!scripts['data:fifa:backfill']?.includes('sync-events.ts')) {
  failures.push('data:fifa:backfill must include the historical FIFA event sync.')
}

const sourceFiles = [
  ...walk(join(root, 'app')),
  ...walk(join(root, 'lib')),
  ...walk(join(root, 'scripts')),
  join(root, 'next.config.mjs'),
].filter((file) => /\.(?:ts|tsx|mjs)$/.test(file) && file !== join(root, 'scripts/repo-check.ts'))
const envRefs = new Set<string>()
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8')
  if (/kickoffapi/i.test(content)) failures.push(`Retired Kickoffapi reference in ${file.replace(`${root}/`, '')}`)
  for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envRefs.add(match[1])
}

const readme = readFileSync(join(root, 'README.md'), 'utf8')
if (/kickoffapi/i.test(readme)) failures.push('README still describes the retired Kickoffapi integration.')
for (const command of new Set(Array.from(readme.matchAll(/npm run ([\w:-]+)/g), (match) => match[1] ?? ''))) {
  if (command.endsWith(':')) continue // `data:fifa:*` is intentional shorthand.
  if (!scripts[command]) failures.push(`README documents an unknown npm command: ${command}`)
}

const documentedEnv = new Set(
  Array.from(readFileSync(join(root, '.env.example'), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm), (match) => match[1] ?? ''),
)
const commandOnlyEnv = new Set([
  'ADMIN_EMAIL', 'ALL', 'DRY_RUN', 'FIFA_SYNC_MODE', 'LIMIT', 'MATCH_ID', 'NODE_ENV', 'ONLY_MISSING', 'SKIP_IMAGES',
  'SUPABASE_RLS_TEST',
])
for (const key of envRefs) {
  if (!documentedEnv.has(key) && !commandOnlyEnv.has(key)) failures.push(`Undocumented environment variable: ${key}`)
}

const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
for (const requiredPattern of ['/public/sw.js', '/public/workbox-*.js', '/public/worker-*.js']) {
  if (!gitignore.includes(requiredPattern)) failures.push(`Generated PWA asset is not ignored: ${requiredPattern}`)
}

if (/KICKOFF_API_KEY/.test(readFileSync(join(root, '.env.example'), 'utf8'))) {
  failures.push('.env.example still documents the retired KICKOFF_API_KEY.')
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log(`Repository checks passed (${migrations.length} migrations, ${envRefs.size} environment references).`)
