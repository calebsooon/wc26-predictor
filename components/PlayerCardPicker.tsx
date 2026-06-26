'use client'

import { useMemo, useState, useRef } from 'react'
import { getTeam, normalisePosition, POSITION_ABBR } from '@/lib/teams'
import { nameKey } from '@/lib/normalize'
import { DialogShell, SearchIcon } from '@/components/ui'
import FlagChip from '@/components/FlagChip'

export interface PlayerForPicker {
  id: number
  name: string
  team_code: string
  jersey_number: number | null
  position?: string | null
  fifa_player_id?: number | null
  photo_url?: string | null
}

/** Short group abbrev (GK/DEF/MID/FWD) for either coarse sections or detailed positions. */
function posAbbr(raw: string | null | undefined): string | null {
  if (!raw) return null
  const g = normalisePosition(raw)
  if (POSITION_ABBR[g]) return POSITION_ABBR[g]
  const s = raw.toLowerCase()
  if (s.includes('keeper')) return 'GK'
  if (s.includes('back') || s.includes('defen')) return 'DEF'
  if (s.includes('midfield')) return 'MID'
  if (s.includes('forward') || s.includes('wing') || s.includes('strik') || s.includes('attack') || s.includes('offence')) return 'FWD'
  return raw.slice(0, 3).toUpperCase()
}

function Silhouette() {
  return (
    <svg viewBox="0 0 44 56" fill="currentColor" className="w-full h-full">
      <circle cx="22" cy="12" r="9" />
      <path d="M8 56C8 36 6 28 12 22C15 17 19 15 22 15C25 15 29 17 32 22C38 28 36 36 36 56Z" />
    </svg>
  )
}

function PlayerCard({
  player, selected, onClick,
}: {
  player: PlayerForPicker; selected: boolean; onClick: () => void
}) {
  const team = getTeam(player.team_code)
  const position = posAbbr(player.position)
  return (
    <button
      onClick={onClick}
      title={player.name}
      className={`relative flex flex-col items-center rounded-xl overflow-hidden border transition-all aspect-[3/4]
        ${selected
          ? 'border-gold bg-gold/10 shadow-[0_0_0_2px_rgb(var(--gold)/0.35)]'
          : 'border-border bg-surface hover:border-texts/40 hover:bg-card'}`}
    >
      <div className="flex-1 w-full flex items-end justify-center relative overflow-hidden pb-1 pt-2">
        <div className="w-3/5 text-texts/20" style={{ lineHeight: 0 }}>
          <Silhouette />
        </div>
        <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-1">
          {player.jersey_number != null && (
            <span className="text-[11px] font-extrabold tabular-nums text-texts/50">{player.jersey_number}</span>
          )}
        </div>
        {selected && (
          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gold grid place-items-center">
            <span className="text-[9px] font-black text-white leading-none">✓</span>
          </div>
        )}
      </div>
      <div className="w-full px-1 pb-1.5 text-center bg-gradient-to-t from-card/90 to-transparent">
        <p className="text-[9px] font-extrabold text-textp leading-tight truncate px-0.5">
          {lastName(player.name)}
        </p>
        <div className="mt-1 flex items-center justify-center gap-1">
          <FlagChip code={team.code} w={18} h={12} r={3} />
          {position && (
            <span className="rounded bg-surface3 px-1 py-px text-[7.5px] font-extrabold leading-none tracking-wide text-texts">
              {position}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function lastName(name: string) {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1]
}

function dedupePlayers(players: PlayerForPicker[], selectedId: number | null): PlayerForPicker[] {
  const byPlayer = new Map<string, PlayerForPicker>()
  for (const player of players) {
    const key = `${player.team_code}:${nameKey(player.name)}`
    const current = byPlayer.get(key)
    if (!current) {
      byPlayer.set(key, player)
      continue
    }

    if (current.id === selectedId) continue
    if (player.id === selectedId) {
      byPlayer.set(key, player)
      continue
    }

    const currentScore =
      (current.fifa_player_id ? 8 : 0) +
      (current.photo_url ? 4 : 0) +
      (current.jersey_number != null ? 2 : 0) +
      (current.position ? 1 : 0)
    const nextScore =
      (player.fifa_player_id ? 8 : 0) +
      (player.photo_url ? 4 : 0) +
      (player.jersey_number != null ? 2 : 0) +
      (player.position ? 1 : 0)

    if (nextScore > currentScore || (nextScore === currentScore && player.id > current.id)) {
      byPlayer.set(key, player)
    }
  }
  return [...byPlayer.values()]
}

export function PlayerCardPicker({
  players,
  value,
  onChange,
  pts,
  label = 'First scorer',
}: {
  players: PlayerForPicker[]
  value: number | 'none' | null
  onChange: (id: number | 'none' | null) => void
  pts: number
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const noScorer = value === 'none'
  const ownGoal = value === -1
  const selectedId = typeof value === 'number' && value !== -1 ? value : null
  const visiblePlayers = useMemo(() => dedupePlayers(players, selectedId), [players, selectedId])
  const selected = selectedId != null ? (visiblePlayers.find((p) => p.id === selectedId) ?? players.find((p) => p.id === selectedId) ?? null) : null
  const selectedPosition = posAbbr(selected?.position)
  const hasChoice = noScorer || ownGoal || !!selected

  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q ? visiblePlayers.filter((p) => p.name.toLowerCase().includes(q)) : visiblePlayers
    const map = new Map<string, PlayerForPicker[]>()
    for (const p of filtered) {
      const arr = map.get(p.team_code) ?? []
      arr.push(p)
      map.set(p.team_code, arr)
    }
    return map
  }, [visiblePlayers, search])

  function pick(id: number) {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
  }

  function close() {
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-texts">
          {label} <span className="text-gold normal-case">+{pts}</span>
        </label>
        {hasChoice && (
          <button onClick={clear} className="text-[10px] font-bold text-texts hover:text-error transition-colors">
            Clear
          </button>
        )}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-11 px-3 rounded-xl border flex items-center gap-2.5 text-sm font-semibold transition-all
          ${hasChoice ? 'border-gold/40 bg-gold/[0.05]' : 'border-border bg-surface hover:border-texts/30'}`}
      >
        {noScorer ? (
          <span className="flex items-center gap-2 flex-1 text-left">
            <span className="w-6 h-6 rounded-full border-2 border-faint/50 flex items-center justify-center shrink-0">
              <svg width="10" height="2" viewBox="0 0 10 2"><rect width="10" height="2" rx="1" fill="currentColor" className="text-faint" /></svg>
            </span>
            <span className="text-textp">No scorer</span>
          </span>
        ) : ownGoal ? (
          <span className="flex items-center gap-2 flex-1 text-left">
            <span className="w-6 h-6 rounded-full bg-faint/10 border border-faint/30 flex items-center justify-center shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="text-faint" />
                <path d="M12 6l3.2 2.3-1.2 3.7H10L8.8 8.3z" fill="currentColor" className="text-faint" />
                <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-faint" />
              </svg>
            </span>
            <span className="text-textp">Own goal</span>
            <span className="text-[11px] text-faint font-medium">(first goal scored against own team)</span>
          </span>
        ) : selected ? (
          <>
            <FlagChip code={selected.team_code} w={24} h={16} r={4} />
            <span className="flex-1 text-left text-textp truncate">{selected.name}</span>
            {selectedPosition && (
              <span className="rounded-md bg-surface3 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-texts shrink-0">{selectedPosition}</span>
            )}
            {selected.jersey_number != null && (
              <span className="text-[11px] text-texts font-extrabold tabular-nums shrink-0">#{selected.jersey_number}</span>
            )}
          </>
        ) : (
          <span className="flex-1 text-left text-texts">Pick first scorer…</span>
        )}
        <svg width="12" height="7" viewBox="0 0 12 7" className={`text-texts shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      <DialogShell
        open={open}
        onClose={close}
        ariaLabel={`Pick ${label.toLowerCase()}`}
        maxWidth="max-w-lg"
        zIndexClassName="z-[200]"
        initialFocusRef={searchRef}
        portal
        panelClassName="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div style={{ maxHeight: '85dvh' }} className="flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-extrabold text-textp">{label}</p>
                <p className="text-[11px] text-texts mt-0.5">Pick who scores the first goal</p>
              </div>
              <button
                onClick={close}
                className="h-8 w-8 rounded-xl border border-border flex items-center justify-center text-texts hover:text-textp transition-colors"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
              <SearchIcon className="text-texts shrink-0" size={14} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players…"
                className="flex-1 bg-transparent text-sm text-textp placeholder:text-texts outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-texts text-xs hover:text-textp shrink-0">✕</button>
              )}
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 p-3 space-y-1">
              {!search && (
                <div className="mb-3 space-y-1">
                  {/* No scorer */}
                  <button
                    onClick={() => { onChange('none'); close() }}
                    className={`w-full flex items-center gap-3 px-3 h-12 rounded-xl border text-left transition-colors ${noScorer ? 'border-gold/40 bg-gold/10' : 'border-border bg-surface hover:bg-card'}`}
                  >
                    <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${noScorer ? 'border-gold bg-gold/10' : 'border-border'}`}>
                      <svg width="10" height="2" viewBox="0 0 10 2"><rect width="10" height="2" rx="1" fill="currentColor" className={noScorer ? 'text-gold' : 'text-faint'} /></svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-bold ${noScorer ? 'text-gold' : 'text-textp'}`}>No scorer</span>
                      <span className="text-[11px] text-texts font-medium ml-2">predict nobody scores first</span>
                    </div>
                    {noScorer && <span className="w-5 h-5 rounded-full bg-gold grid place-items-center shrink-0"><svg width="8" height="6" viewBox="0 0 8 6"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg></span>}
                  </button>

                  {/* Own goal */}
                  <button
                    onClick={() => { onChange(-1); close() }}
                    className={`w-full flex items-center gap-3 px-3 h-12 rounded-xl border text-left transition-colors ${ownGoal ? 'border-gold/40 bg-gold/10' : 'border-border bg-surface hover:bg-card'}`}
                  >
                    <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${ownGoal ? 'border-gold bg-gold/10' : 'border-border'}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className={ownGoal ? 'text-gold' : 'text-faint'} />
                        <path d="M12 5.5l3.2 2.4-1.2 3.7H10L8.8 7.9z" fill="currentColor" className={ownGoal ? 'text-gold' : 'text-faint'} />
                        <line x1="8" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={ownGoal ? 'text-gold' : 'text-faint'} />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-bold ${ownGoal ? 'text-gold' : 'text-textp'}`}>Own goal</span>
                      <span className="text-[11px] text-texts font-medium ml-2">first goal scored against own team</span>
                    </div>
                    {ownGoal && <span className="w-5 h-5 rounded-full bg-gold grid place-items-center shrink-0"><svg width="8" height="6" viewBox="0 0 8 6"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg></span>}
                  </button>

                  <div className="pt-2 pb-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-texts px-1">Players</p>
                  </div>
                </div>
              )}

              {Array.from(grouped.entries()).map(([teamCode, teamPlayers]) => {
                const team = getTeam(teamCode)
                return (
                  <div key={teamCode} className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <FlagChip code={team.code} w={20} h={14} r={3} />
                      <span className="text-[10px] font-extrabold text-texts uppercase tracking-widest">{team.name}</span>
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                      {teamPlayers.map((p) => (
                        <PlayerCard
                          key={p.id}
                          player={p}
                          selected={p.id === value}
                          onClick={() => pick(p.id)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
              {grouped.size === 0 && (
                <p className="text-sm text-texts text-center py-8">No players found</p>
              )}
            </div>
        </div>
      </DialogShell>
    </div>
  )
}
