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

const sourceFiles = [
  ...walk(join(root, 'app')),
  ...walk(join(root, 'lib')),
  ...walk(join(root, 'scripts')),
  join(root, 'next.config.mjs'),
].filter((file) => /\.(?:ts|tsx|mjs)$/.test(file))
const envRefs = new Set<string>()
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envRefs.add(match[1])
}

const documentedEnv = new Set(
  Array.from(readFileSync(join(root, '.env.example'), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm), (match) => match[1] ?? ''),
)
const commandOnlyEnv = new Set([
  'ADMIN_EMAIL', 'DRY_RUN', 'LIMIT', 'NODE_ENV', 'ONLY_MISSING',
  'SUPABASE_RLS_TEST',
])
for (const key of envRefs) {
  if (!documentedEnv.has(key) && !commandOnlyEnv.has(key)) failures.push(`Undocumented environment variable: ${key}`)
}

const gitignore = readFileSync(join(root, '.gitignore'), 'utf8')
for (const requiredPattern of ['/public/sw.js', '/public/workbox-*.js', '/public/worker-*.js']) {
  if (!gitignore.includes(requiredPattern)) failures.push(`Generated PWA asset is not ignored: ${requiredPattern}`)
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log(`Repository checks passed (${migrations.length} migrations, ${envRefs.size} environment references).`)
