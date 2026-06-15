'use client'

import { useMemo, useState } from 'react'
import { getTeam, normalisePosition, POSITION_ABBR } from '@/lib/teams'
import { SearchIcon } from '@/components/ui'

export interface PlayerForPicker {
  id: number
  name: string
  team_code: string
  jersey_number: number | null
  position?: string | null
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
          {posAbbr(player.position) && (
            <span className="text-[8px] font-extrabold tracking-wide text-texts/40">{posAbbr(player.position)}</span>
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
        <p className="text-sm leading-none mt-0.5">{team.flag}</p>
      </div>
    </button>
  )
}

function lastName(name: string) {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1]
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

  const noScorer = value === 'none'
  const ownGoal = value === -1
  const selected = typeof value === 'number' && value !== -1 ? (players.find((p) => p.id === value) ?? null) : null
  const hasChoice = noScorer || ownGoal || !!selected

  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players
    const map = new Map<string, PlayerForPicker[]>()
    for (const p of filtered) {
      const arr = map.get(p.team_code) ?? []
      arr.push(p)
      map.set(p.team_code, arr)
    }
    return map
  }, [players, search])

  function pick(id: number) {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
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
          <span className="flex-1 text-left text-textp">🚫 No scorer</span>
        ) : ownGoal ? (
          <span className="flex-1 text-left text-textp">⚽ Own goal</span>
        ) : selected ? (
          <>
            <span className="text-lg leading-none">{getTeam(selected.team_code).flag}</span>
            <span className="flex-1 text-left text-textp truncate">{selected.name}</span>
            {selected.position && (
              <span className="text-[10px] text-texts font-bold uppercase tracking-wide shrink-0">{normalisePosition(selected.position)}</span>
            )}
            {selected.jersey_number != null && (
              <span className="text-[11px] text-texts font-extrabold tabular-nums shrink-0">#{selected.jersey_number}</span>
            )}
          </>
        ) : (
          <span className="flex-1 text-left text-texts">Pick first scorer…</span>
        )}
        <span className="text-texts text-[10px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute z-40 mt-2 w-full bg-card border border-border rounded-xl shadow-2xl flex flex-col"
          style={{ maxHeight: '440px' }}
        >
          <div className="p-2.5 border-b border-border flex items-center gap-2 shrink-0">
            <SearchIcon className="text-texts shrink-0" size={14} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="flex-1 bg-transparent text-sm text-textp placeholder:text-texts outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-texts text-xs shrink-0">✕</button>
            )}
          </div>

          {!search && (
            <>
              <button
                onClick={() => { onChange('none'); setOpen(false) }}
                className={`flex items-center gap-2 px-3 h-11 border-b border-border text-left text-sm font-bold transition-colors ${noScorer ? 'bg-gold/10 text-gold' : 'text-textp hover:bg-surface'}`}
              >
                🚫 No scorer <span className="text-[11px] font-medium text-texts">(predict nobody scores first)</span>
                {noScorer && <span className="ml-auto text-gold">✓</span>}
              </button>
              <button
                onClick={() => { onChange(-1); setOpen(false) }}
                className={`flex items-center gap-2 px-3 h-11 border-b border-border text-left text-sm font-bold transition-colors ${ownGoal ? 'bg-gold/10 text-gold' : 'text-textp hover:bg-surface'}`}
              >
                ⚽ Own goal <span className="text-[11px] font-medium text-texts">(first goal is an own goal)</span>
                {ownGoal && <span className="ml-auto text-gold">✓</span>}
              </button>
            </>
          )}

          <div className="overflow-y-auto p-3 space-y-4">
            {Array.from(grouped.entries()).map(([teamCode, teamPlayers]) => {
              const team = getTeam(teamCode)
              return (
                <div key={teamCode}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-base leading-none">{team.flag}</span>
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
              <p className="text-sm text-texts text-center py-6">No players found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
