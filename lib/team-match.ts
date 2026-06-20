// Resolve external team names (Kickoffapi / football-data.org) to our 3-letter
// codes, and group our players by team. Shared by the live-data routes.

import { TEAMS } from '@/lib/teams'

export function normTeam(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
}

// Build a normalised lookup from every alias we know for each team.
const NAME_TO_CODE = new Map<string, string>()
for (const t of Object.values(TEAMS)) {
  for (const alias of [t.name, t.fullName, t.playerKey, t.code]) {
    const k = normTeam(alias)
    if (k && !NAME_TO_CODE.has(k)) NAME_TO_CODE.set(k, t.code)
  }
}
// Hand-written aliases for source-specific spellings.
const EXTRA: Record<string, string> = {
  republicofkorea: 'KOR', korea: 'KOR', koreasouth: 'KOR',
  czechrepublic: 'CZE',
  cotedivoire: 'CIV', ivorycoast: 'CIV',
  congodr: 'COD', drcongo: 'COD', democraticrepublicofthecongo: 'COD',
  unitedstates: 'USA', unitedstatesofamerica: 'USA', usmnt: 'USA',
  capeverdeislands: 'CPV',
  turkiye: 'TUR',
}
for (const [k, code] of Object.entries(EXTRA)) if (!NAME_TO_CODE.has(k)) NAME_TO_CODE.set(k, code)

export function teamNameToCode(name: string | null | undefined): string | null {
  if (!name) return null
  return NAME_TO_CODE.get(normTeam(name)) ?? null
}

export interface RosterPlayer { id: number; name: string; team_name: string }

// Group our players by team code so a lineup can be matched within one squad.
export function groupPlayersByCode(players: RosterPlayer[]): Map<string, RosterPlayer[]> {
  const map = new Map<string, RosterPlayer[]>()
  for (const p of players) {
    const code = teamNameToCode(p.team_name)
    if (!code) continue
    const arr = map.get(code) ?? []
    arr.push(p)
    map.set(code, arr)
  }
  return map
}

function normPerson(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
}

// Match an external player name to one of our roster rows. Tries full-name,
// then last-token (handles "K. Mbappé" vs "Kylian Mbappé").
export function matchPlayer(name: string, candidates: RosterPlayer[]): RosterPlayer | null {
  const target = normPerson(name)
  const hit = candidates.find((c) => normPerson(c.name) === target)
  if (hit) return hit
  const lastTok = name.trim().split(/\s+/).pop() ?? ''
  if (lastTok.length >= 3) {
    const lt = normPerson(lastTok)
    const matches = candidates.filter((c) => normPerson(c.name).endsWith(lt))
    if (matches.length === 1) return matches[0]
  }
  return null
}
