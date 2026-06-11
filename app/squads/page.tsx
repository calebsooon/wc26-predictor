'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { TEAMS, getTeam, type TeamInfo, normalisePosition, POSITION_ORDER, POSITION_ABBR } from '@/lib/teams'
import { PageHeader, Card, Skeleton, SearchIcon, Pill, EmptyState, UsersIcon } from '@/components/ui'

interface Player { id: number; name: string; position: string | null; jersey_number: number | null; nationality: string | null; team_name: string }

const ALL_TEAMS: TeamInfo[] = Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name))

function sortPlayers(players: Player[]) {
  return [...players].sort((a, b) => {
    const po = (POSITION_ORDER[normalisePosition(a.position)] ?? 9) - (POSITION_ORDER[normalisePosition(b.position)] ?? 9)
    return po !== 0 ? po : (a.jersey_number ?? 99) - (b.jersey_number ?? 99)
  })
}

function SquadDetail({ team, players }: { team: TeamInfo; players: Player[] }) {
  const sorted = sortPlayers(players.filter((p) => normalisePosition(p.position) !== 'Coach'))
  const grouped: Record<string, Player[]> = {}
  for (const p of sorted) { const pos = normalisePosition(p.position); (grouped[pos] ||= []).push(p) }
  const posOrder = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-5xl leading-none">{team.flag}</span>
        <div><h2 className="text-xl font-extrabold text-textp">{team.fullName}</h2><p className="text-sm text-texts">{sorted.length} players</p></div>
      </div>
      {sorted.length === 0 ? <p className="text-sm text-texts italic">No squad data available.</p> : (
        <div className="space-y-5">
          {posOrder.filter((pos) => grouped[pos]).map((pos) => (
            <div key={pos}>
              <div className="flex items-center gap-2 mb-2">
                <Pill tone="default">{POSITION_ABBR[pos] ?? pos}</Pill>
                <span className="text-xs text-texts">{grouped[pos].length}</span>
              </div>
              <Card className="overflow-hidden">
                {grouped[pos].map((p, idx) => (
                  <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${idx < grouped[pos].length - 1 ? 'border-b border-border/60' : ''}`}>
                    <span className="w-7 text-center text-sm font-mono text-texts shrink-0">{p.jersey_number ?? '–'}</span>
                    <span className="text-sm font-medium text-textp flex-1">{p.name}</span>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SquadsPage() {
  const supabase = createClient()
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        // WC2026 has 48 teams × ~26 players = ~1248 players; range(0,1499) covers all safely
        const { data, error: e } = await supabase.from('players').select('id, name, position, jersey_number, nationality, team_name').range(0, 1499)
        if (e) throw e
        setAllPlayers((data ?? []) as Player[])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load squads')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playersByCode = useMemo(() => {
    const map: Record<string, Player[]> = {}
    for (const p of allPlayers) {
      const team = Object.values(TEAMS).find((t) => t.playerKey === p.team_name)
      if (team) (map[team.code] ||= []).push(p)
    }
    return map
  }, [allPlayers])

  const filteredTeams = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return ALL_TEAMS
    return ALL_TEAMS.filter((t) => t.name.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
  }, [search])

  const selectedTeam = selected ? getTeam(selected) : null
  const selectedPlayers = selected ? (playersByCode[selected] ?? []) : []

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-40" /><Skeleton className="h-96 rounded-xl" /></div>
  if (error) return (
    <div className="space-y-5">
      <PageHeader eyebrow="48 nations" title="Squads" />
      <EmptyState icon={<UsersIcon size={22} />} title="Couldn't load squads" desc={error} />
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="48 nations" title="Squads" sub={`${allPlayers.length} players registered.`} />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 shrink-0">
          <div className="relative mb-3">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-texts pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-surface text-textp placeholder:text-texts focus:outline-none focus:border-primary" />
          </div>
          <Card className="overflow-hidden">
            {filteredTeams.length === 0 ? <p className="text-sm text-texts text-center py-8">No teams found</p> : (
              filteredTeams.map((team, idx) => {
                const count = playersByCode[team.code]?.filter((p) => normalisePosition(p.position) !== 'Coach').length ?? 0
                const isSel = selected === team.code
                return (
                  <button key={team.code} onClick={() => { setSelected(team.code); setMobileOpen(true) }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${idx < filteredTeams.length - 1 ? 'border-b border-border/60' : ''} ${isSel ? 'bg-primary/12' : 'hover:bg-surface'}`}>
                    <span className="text-xl leading-none shrink-0">{team.flag}</span>
                    <span className={`text-sm font-bold flex-1 truncate ${isSel ? 'text-primary' : 'text-textp'}`}>{team.name}</span>
                    <span className="text-xs tabular-nums shrink-0 text-texts">{count > 0 ? count : '–'}</span>
                  </button>
                )
              })
            )}
          </Card>
        </div>

        <div className="hidden lg:block flex-1 min-w-0">
          {selectedTeam ? <SquadDetail team={selectedTeam} players={selectedPlayers} /> : (
            <EmptyState icon={<UsersIcon size={22} />} title="Select a team" desc="Choose a nation from the list to view their squad." />
          )}
        </div>
      </div>

      {/* Mobile slide-up */}
      {mobileOpen && selectedTeam && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setMobileOpen(false)}>
          <div className="w-full bg-card rounded-t-3xl max-h-[85vh] flex flex-col border-t border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end px-5 pt-4 pb-2 shrink-0">
              <button onClick={() => setMobileOpen(false)} className="text-texts hover:text-textp p-1">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8"><SquadDetail team={selectedTeam} players={selectedPlayers} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
