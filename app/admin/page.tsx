'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getTeam, TEAMS } from '@/lib/teams'
import {
  PageHeader, Card, Button, Pill, ScoreStepper, ChipRow, Skeleton, ChevDown, SearchIcon, SectionHeader, LeagueBadge,
} from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { WEIGHT_FIELDS, resolveWeights, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { fmtDateTime } from '@/lib/date-format'
import { normalisePosition, POSITION_ABBR } from '@/lib/teams'
import { resolveCurrentFormation, resolveLineupState, type LineupFormationChange, type LineupPlayerState, type LineupSubstitution } from '@/lib/lineup-state'
import { parseFormation, resolvePitchLayout } from '@/lib/lineup-layout'
import { validateLineup } from '@/lib/lineup-validation'

/* ── EditConfirmButton ───────────────────────────────────────────────────── */
function EditConfirmButton({ saving, onConfirm, label }: { saving: boolean; onConfirm: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-amber/10 border border-amber/30 rounded-lg px-3 py-1.5">
        <span className="text-[11.5px] text-amber font-semibold max-w-[220px] leading-snug">{label}</span>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
        <Button size="sm" onClick={() => { setConfirming(false); onConfirm() }} disabled={saving}>
          {saving ? 'Saving…' : 'Confirm'}
        </Button>
      </div>
    )
  }
  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={saving}>
      {saving ? 'Saving…' : 'Edit result'}
    </Button>
  )
}

/* ── LineupEditor ────────────────────────────────────────────────────────── */
const POS_OPTIONS = ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'DM', 'CM', 'RM', 'LM', 'CAM', 'AM', 'RW', 'LW', 'CF', 'ST', 'SS']
const PITCH_ROWS = [{ value: '0', label: 'GK' }, { value: '1', label: 'Def' }, { value: '2', label: 'Low mid' }, { value: '3', label: 'High mid' }, { value: '4', label: 'Fwd' }]
const PITCH_LANES = [{ value: '1', label: 'Far L' }, { value: '2', label: 'Left' }, { value: '3', label: 'Centre' }, { value: '4', label: 'Right' }, { value: '5', label: 'Far R' }]
const FORMATION_PRESETS = ['3-4-3', '3-5-2', '3-4-2-1', '3-1-4-2', '4-3-3', '4-4-2', '4-2-3-1', '4-1-4-1', '4-2-2-2', '4-3-1-2', '4-3-2-1', '5-3-2', '5-4-1', '5-2-3']

interface LineupEntry { playerId: number; name: string; jersey: number | null; status: 'out' | 'starter' | 'sub'; posLabel: string; grid: string | null }
type LayoutMode = 'formation' | 'manual'

function defaultGrid(position: string) {
  const pos = position.toUpperCase()
  if (pos === 'GK') return '0:3'
  if (['RB', 'RWB'].includes(pos)) return '1:5'
  if (['LB', 'LWB'].includes(pos)) return '1:1'
  if (pos === 'CB') return '1:3'
  if (['DM', 'CDM'].includes(pos)) return '2:3'
  if (['RM', 'RW'].includes(pos)) return '2:5'
  if (['LM', 'LW'].includes(pos)) return '2:1'
  if (['CAM', 'AM', 'CM'].includes(pos)) return '2:3'
  return '3:3'
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.at(-1) ?? name
}

function LineupPreview({ teamCode, entries, formation, layoutMode }: {
  teamCode: string
  entries: LineupEntry[]
  formation: string | null
  layoutMode: LayoutMode
}) {
  const starters = entries.filter((entry) => entry.status === 'starter')
  const positioned = resolvePitchLayout(
    starters.map((entry, index) => ({
      player_id: entry.playerId,
      position_label: entry.posLabel || null,
      grid: layoutMode === 'manual' ? entry.grid : null,
      sort_order: index,
    })),
    true,
    formation,
  )
  const byId = new Map(entries.map((entry) => [entry.playerId, entry]))

  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-texts"><FlagChip code={teamCode} w={15} h={10} r={2} />Live pitch preview</span>
        <span className="text-[10px] font-bold text-primary">{formation ?? 'Auto shape'}</span>
      </div>
      <div className="relative h-[235px] overflow-hidden rounded-lg border border-white/10" style={{ background: 'linear-gradient(180deg, #0b653b, #07512f)' }}>
        <div className="absolute inset-[8px] border border-white/25 rounded-[3px]" />
        <div className="absolute left-[8px] right-[8px] top-1/2 h-px bg-white/25" />
        <div className="absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute bottom-[8px] left-1/2 h-[39px] w-[47%] -translate-x-1/2 border border-b-0 border-white/25" />
        {positioned.map((slot) => {
          const entry = byId.get(slot.player.player_id)
          if (!entry) return null
          return (
            <div key={entry.playerId} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: 52 }}>
              <span className="mx-auto grid h-5 w-5 place-items-center rounded-full border border-white/50 bg-primary text-[9px] font-black text-[#042614] shadow-lg">{entry.jersey ?? '–'}</span>
              <span className="mt-0.5 block truncate rounded bg-black/65 px-1 py-px text-[8px] font-bold text-white">{shortName(entry.name)}</span>
            </div>
          )
        })}
        {starters.length === 0 && <p className="absolute inset-0 grid place-items-center text-xs font-semibold text-white/60">Choose starters to preview the shape</p>}
      </div>
    </div>
  )
}

type AdminLineupRow = LineupPlayerState & { team_code: string; players: { name: string } | null }

function FullMatchLineupPreview({
  matchId, homeCode, awayCode, homeFormation, awayFormation, refreshKey,
}: {
  matchId: string
  homeCode: string
  awayCode: string
  homeFormation: string | null
  awayFormation: string | null
  refreshKey: number
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<AdminLineupRow[] | null>(null)
  const [subs, setSubs] = useState<LineupSubstitution[]>([])
  const [formationChanges, setFormationChanges] = useState<LineupFormationChange[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('lineups').select('team_code, player_id, is_starting, shirt_number, position_label, grid, sort_order, players(name)').eq('match_id', matchId),
      supabase.from('lineup_substitutions').select('id, team_code, player_out_id, player_in_id, minute, source, created_at').eq('match_id', matchId),
      supabase.from('match_formation_changes').select('id, team_code, minute, formation, source, created_at').eq('match_id', matchId).order('minute'),
    ]).then(([lineups, substitutions, shapes]) => {
      if (cancelled) return
      setRows((lineups.data ?? []) as unknown as AdminLineupRow[])
      setSubs((substitutions.data ?? []) as LineupSubstitution[])
      setFormationChanges((shapes.data ?? []) as LineupFormationChange[])
    })
    return () => { cancelled = true }
  }, [matchId, refreshKey, supabase])

  if (rows === null) return <div className="grid h-64 place-items-center rounded-xl border border-border bg-surface text-xs text-texts">Loading both XIs…</div>
  if (!rows.length) return <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-xs text-texts">Save at least one announced lineup to preview both teams.</div>

  const home = resolveLineupState(rows.filter((row) => row.team_code === homeCode), subs, homeCode)
  const away = resolveLineupState(rows.filter((row) => row.team_code === awayCode), subs, awayCode)
  const currentHomeFormation = resolveCurrentFormation(homeFormation, formationChanges, homeCode)
  const currentAwayFormation = resolveCurrentFormation(awayFormation, formationChanges, awayCode)
  const homePlayers = resolvePitchLayout(home.current, true, currentHomeFormation)
  const awayPlayers = resolvePitchLayout(away.current, false, currentAwayFormation)
  const nameById = new Map(rows.map((row) => [row.player_id, row.players?.name ?? 'Player']))
  const renderPlayer = (player: typeof homePlayers[number], side: 'home' | 'away') => (
    <div key={`${side}-${player.player.player_id}`} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${player.x}%`, top: `${player.y}%`, width: 56 }}>
      <span className={`mx-auto grid h-5 w-5 place-items-center rounded-full border border-white/50 text-[9px] font-black shadow-lg ${side === 'home' ? 'bg-primary text-[#042614]' : 'bg-blue text-white'}`}>{player.player.shirt_number ?? '–'}</span>
      <span className="mt-0.5 block truncate rounded bg-black/65 px-1 py-px text-[8px] font-bold text-white">{shortName(nameById.get(player.player.player_id) ?? 'Player')}</span>
    </div>
  )

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-bold">
        <span className="flex items-center gap-1.5"><FlagChip code={awayCode} w={16} h={11} r={2} />{getTeam(awayCode).name}<span className="text-faint">{currentAwayFormation ?? 'Auto'}</span></span>
        <span className="text-[10px] uppercase tracking-wider text-texts">Current XI preview</span>
        <span className="flex items-center gap-1.5"><span className="text-faint">{currentHomeFormation ?? 'Auto'}</span>{getTeam(homeCode).name}<FlagChip code={homeCode} w={16} h={11} r={2} /></span>
      </div>
      <div className="relative h-[480px] overflow-hidden rounded-xl border border-white/10" style={{ background: 'repeating-linear-gradient(180deg, #0b653b 0 10%, #07512f 10% 20%)' }}>
        <div className="absolute inset-[10px] rounded-[4px] border border-white/25" />
        <div className="absolute left-[10px] right-[10px] top-1/2 h-px bg-white/25" />
        <div className="absolute left-1/2 top-1/2 h-[82px] w-[82px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute bottom-[10px] left-1/2 h-[72px] w-[48%] -translate-x-1/2 border border-b-0 border-white/25" />
        <div className="absolute top-[10px] left-1/2 h-[72px] w-[48%] -translate-x-1/2 border border-t-0 border-white/25" />
        {awayPlayers.map((player) => renderPlayer(player, 'away'))}
        {homePlayers.map((player) => renderPlayer(player, 'home'))}
      </div>
      <p className="mt-2 text-[10px] text-texts">Shows the current XI after verified substitutions. Formation-first spacing is used unless that team has saved manual grid coordinates.</p>
    </div>
  )
}

function FormationOverrideControl({
  matchId, teamCode, providerFormation, override, column, onSaved,
}: {
  matchId: string
  teamCode: string
  providerFormation: string | null
  override: string | null
  column: 'home_formation_override' | 'away_formation_override'
  onSaved: (formation: string | null) => void
}) {
  const supabase = createClient()
  const [draft, setDraft] = useState(override ?? '')
  const [saving, setSaving] = useState(false)
  const listId = `formation-presets-${matchId}-${teamCode}`

  useEffect(() => { setDraft(override ?? '') }, [override])

  async function save(next: string | null) {
    const value = next?.trim() || null
    if (value && !parseFormation(value)) { toast.error('Use a valid formation such as 4-2-3-1 or 3-5-2'); return }
    setSaving(true)
    const { error } = await supabase.from('matches').update({ [column]: value }).eq('id', matchId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setDraft(value ?? '')
    onSaved(value)
    toast.success(value ? `${teamCode} formation override saved` : `${teamCode} is using the FIFA formation`)
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-texts">Formation source</p><p className="mt-0.5 text-[11px] text-textp">{override ? `Manual override · ${override}` : `FIFA default · ${providerFormation ?? 'not published'}`}</p></div>
        {override && <button onClick={() => save(null)} disabled={saving} className="text-[10px] font-bold text-texts underline hover:text-primary">Use FIFA</button>}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          list={listId}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/\s/g, ''))}
          placeholder="Override e.g. 3-4-3"
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-[11px] text-textp placeholder:text-faint"
          aria-label={`${teamCode} formation override`}
        />
        <datalist id={listId}>{FORMATION_PRESETS.map((preset) => <option key={preset} value={preset} />)}</datalist>
        <Button size="sm" variant="outline" onClick={() => save(draft)} disabled={saving || draft.trim() === (override ?? '')}>{saving ? '…' : 'Save'}</Button>
      </div>
    </div>
  )
}

type FormationChange = { id: string; team_code: string; minute: number; formation: string; source: 'fifa' | 'manual'; created_at: string }

function FormationChangesEditor({ matchId, teamCode, baseFormation, onChanged }: { matchId: string; teamCode: string; baseFormation: string | null; onChanged?: () => void }) {
  const supabase = createClient()
  const [changes, setChanges] = useState<FormationChange[]>([])
  const [minute, setMinute] = useState('60')
  const [formation, setFormation] = useState(baseFormation ?? '4-3-3')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ id: string; minute: string; formation: string } | null>(null)
  const listId = `formation-change-presets-${matchId}-${teamCode}`

  const load = useCallback(async () => {
    const { data } = await supabase.from('match_formation_changes').select('id, team_code, minute, formation, source, created_at').eq('match_id', matchId).eq('team_code', teamCode).order('minute')
    setChanges((data ?? []) as FormationChange[])
  }, [matchId, supabase, teamCode])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!changes.length) setFormation(baseFormation ?? '4-3-3') }, [baseFormation, changes.length])

  async function add() {
    const eventMinute = Number(minute)
    const value = formation.trim().replace(/\s/g, '')
    if (!Number.isInteger(eventMinute) || eventMinute < 0 || eventMinute > 130) { toast.error('Choose a minute from 0 to 130'); return }
    if (!parseFormation(value)) { toast.error('Use a valid formation such as 4-2-3-1 or 3-5-2'); return }
    setSaving(true)
    const { error } = await supabase.from('match_formation_changes').insert({ match_id: matchId, team_code: teamCode, minute: eventMinute, formation: value, source: 'manual' })
    setSaving(false)
    if (error) { toast.error(error.message.includes('unique') ? 'A shape change already exists at that minute — remove it first.' : error.message); return }
    await load()
    onChanged?.()
    toast.success('Formation change recorded')
  }

  async function saveEdit() {
    if (!editing) return
    const eventMinute = Number(editing.minute)
    const value = editing.formation.trim().replace(/\s/g, '')
    if (!Number.isInteger(eventMinute) || eventMinute < 0 || eventMinute > 130) { toast.error('Choose a minute from 0 to 130'); return }
    if (!parseFormation(value)) { toast.error('Use a valid formation such as 4-2-3-1 or 3-5-2'); return }
    setSaving(true)
    const { error } = await supabase.from('match_formation_changes').update({ minute: eventMinute, formation: value }).eq('id', editing.id)
    setSaving(false)
    if (error) { toast.error(error.message.includes('unique') ? 'A shape change already exists at that minute.' : error.message); return }
    setEditing(null)
    await load()
    onChanged?.()
    toast.success('Formation change updated')
  }

  async function remove(id: string) {
    const { error } = await supabase.from('match_formation_changes').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    await load()
    if (editing?.id === id) setEditing(null)
    onChanged?.()
    toast.success('Formation change removed')
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">Tactical shape changes</p><span className="text-[10px] text-texts">Latest shape powers Current XI</span></div>
      {changes.length > 0 && <div className="space-y-1">{changes.map((change) => editing?.id === change.id ? (
        <div key={change.id} className="grid grid-cols-[52px_1fr_auto_auto] gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-1.5">
          <input value={editing.minute} onChange={(event) => setEditing({ ...editing, minute: event.target.value })} inputMode="numeric" aria-label="Edited formation change minute" className="min-w-0 rounded-md border border-border bg-surface px-1 text-center text-[11px]" />
          <input list={listId} value={editing.formation} onChange={(event) => setEditing({ ...editing, formation: event.target.value.replace(/\s/g, '') })} aria-label="Edited formation" className="min-w-0 rounded-md border border-border bg-surface px-2 text-[11px] text-textp" />
          <Button size="sm" onClick={saveEdit} disabled={saving}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      ) : (
        <div key={change.id} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-[11px]"><span className="font-bold text-primary">{change.minute}′</span><span className="flex-1 font-semibold text-textp">{change.formation}</span><span className="text-texts">{change.source}</span>{change.source === 'manual' && <button onClick={() => setEditing({ id: change.id, minute: String(change.minute), formation: change.formation })} title="Edit this formation change" className="font-bold text-primary">Edit</button>}<button onClick={() => remove(change.id)} title="Remove this formation change" className="font-bold text-coral">×</button></div>
      ))}</div>}
      <div className="grid grid-cols-[52px_1fr_auto] gap-1.5">
        <input value={minute} onChange={(event) => setMinute(event.target.value)} inputMode="numeric" aria-label="Formation change minute" className="rounded-md border border-border bg-surface px-1 text-center text-[11px]" />
        <input list={listId} value={formation} onChange={(event) => setFormation(event.target.value.replace(/\s/g, ''))} aria-label="Formation after the change" className="min-w-0 rounded-md border border-border bg-surface px-2 text-[11px] text-textp" />
        <datalist id={listId}>{FORMATION_PRESETS.map((preset) => <option key={preset} value={preset} />)}</datalist>
        <Button size="sm" variant="outline" onClick={add} disabled={saving}>Add</Button>
      </div>
    </div>
  )
}

function LineupEditor({ matchId, teamCode, playerKey, formation, onSaved }: { matchId: string; teamCode: string; playerKey: string; formation: string | null; onSaved?: () => void }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<LineupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'starter' | 'sub' | 'out'>('starter')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('formation')
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: players }, { data: lineup }] = await Promise.all([
        supabase.from('players').select('id, name, jersey_number, position').eq('team_name', playerKey).order('jersey_number', { nullsFirst: false }),
        supabase.from('lineups').select('player_id, is_starting, position_label, shirt_number, grid').eq('match_id', matchId).eq('team_code', teamCode),
      ])
      const lineupMap = new Map((lineup ?? []).map((l: { player_id: number; is_starting: boolean; position_label: string | null; shirt_number: number | null; grid: string | null }) =>
        [l.player_id, { is_starting: l.is_starting, posLabel: l.position_label ?? '', jersey: l.shirt_number, grid: l.grid }]
      ))
      setLayoutMode((lineup ?? []).some((l: { is_starting: boolean; grid: string | null }) => l.is_starting && l.grid) ? 'manual' : 'formation')
      setEntries((players ?? []).filter((p: { id: number; name: string; jersey_number: number | null; position: string | null }) =>
        normalisePosition(p.position) !== 'Coach'
      ).map((p: { id: number; name: string; jersey_number: number | null; position: string | null }) => {
        const l = lineupMap.get(p.id)
        return {
          playerId: p.id, name: p.name, jersey: p.jersey_number,
          status: l ? (l.is_starting ? 'starter' : 'sub') : 'out',
          posLabel: l?.posLabel ?? POSITION_ABBR[normalisePosition(p.position ?? '')] ?? '',
          grid: l?.grid ?? null,
        }
      }))
      setWarningsAcknowledged(false)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, teamCode, playerKey])

  function update(playerId: number, patch: Partial<LineupEntry>) {
    setEntries((prev) => prev.map((e) => e.playerId === playerId ? { ...e, ...patch } : e))
    setWarningsAcknowledged(false)
  }

  async function save() {
    if (lineupWarnings.length > 0 && !warningsAcknowledged) {
      toast.error('Review and acknowledge the lineup warnings before saving')
      return
    }
    setSaving(true)
    const selected = entries.filter((e) => e.status !== 'out')
    await supabase.from('lineups').delete().eq('match_id', matchId).eq('team_code', teamCode)
    if (selected.length > 0) {
      const rows = selected.map((e, i) => ({
        match_id: matchId, team_code: teamCode, player_id: e.playerId,
        is_starting: e.status === 'starter', shirt_number: e.jersey,
        position_label: e.posLabel || null,
        // Formation-first persists no grid values: the shared renderer then
        // derives even tactical rows from the announced formation + position.
        // Manual mode is deliberately opt-in and retains exact coordinates.
        grid: e.status === 'starter' && layoutMode === 'manual' ? (e.grid ?? defaultGrid(e.posLabel)) : null,
        sort_order: i, source: 'manual',
      }))
      const { error } = await supabase.from('lineups').insert(rows)
      if (error) { toast.error(error.message); setSaving(false); return }
    }
    toast.success(`Lineup saved — ${selected.filter((e) => e.status === 'starter').length} starters, ${selected.filter((e) => e.status === 'sub').length} subs`)
    onSaved?.()
    setSaving(false)
  }

  async function clearLineup() {
    await supabase.from('lineups').delete().eq('match_id', matchId).eq('team_code', teamCode)
    setEntries((prev) => prev.map((e) => ({ ...e, status: 'out' })))
    setWarningsAcknowledged(false)
    onSaved?.()
    toast.success('Lineup cleared')
  }

  const filtered = entries.filter((e) => tab === 'out' ? e.status === 'out' : e.status === tab)
  const starterEntries = entries.filter((e) => e.status === 'starter')
  const starterCount = starterEntries.length
  const subCount = entries.filter((e) => e.status === 'sub').length
  const lineupWarnings = useMemo(() => validateLineup(
    entries.filter((entry) => entry.status === 'starter').map((entry) => ({ player_id: entry.playerId, position_label: entry.posLabel || null })),
    formation,
  ), [entries, formation])

  if (loading) return <div className="py-4 flex justify-center"><div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" /></div>

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-surface p-2">
        <div role="tablist" aria-label={`${teamCode} pitch layout mode`} className="grid grid-cols-2 gap-1 rounded-md bg-surface2 p-1">
          <button
            role="tab"
            aria-selected={layoutMode === 'formation'}
            onClick={() => { setLayoutMode('formation'); setWarningsAcknowledged(false) }}
            className={`rounded-md px-2 py-1.5 text-[10.5px] font-bold transition-all ${layoutMode === 'formation' ? 'bg-primary/15 text-primary shadow-sm' : 'text-texts hover:text-textp'}`}
          >
            Formation-first
          </button>
          <button
            role="tab"
            aria-selected={layoutMode === 'manual'}
            onClick={() => { setLayoutMode('manual'); setWarningsAcknowledged(false) }}
            className={`rounded-md px-2 py-1.5 text-[10.5px] font-bold transition-all ${layoutMode === 'manual' ? 'bg-gold/15 text-gold shadow-sm' : 'text-texts hover:text-textp'}`}
          >
            Manual grid
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-texts">
          {layoutMode === 'formation'
            ? `Recommended. Uses ${formation ? `the ${formation} match formation` : 'the match formation when it is available'} and player positions to centre and space each line automatically.`
            : 'Use only to fine-tune a specific player’s side or tactical row. Saved grid coordinates override formation placement.'}
        </p>
      </div>
      <LineupPreview teamCode={teamCode} entries={entries} formation={formation} layoutMode={layoutMode} />
      {lineupWarnings.length > 0 && (
        <div className="rounded-lg border border-amber/30 bg-amber/10 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber">Lineup checks</p>
          <ul className="mt-1 space-y-1">
            {lineupWarnings.map((warning) => <li key={warning.code} className={`text-[10.5px] leading-snug ${warning.level === 'error' ? 'text-coral' : 'text-amber'}`}>{warning.level === 'error' ? '• ' : '– '}{warning.message}</li>)}
          </ul>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[10.5px] font-semibold text-textp"><input type="checkbox" checked={warningsAcknowledged} onChange={(event) => setWarningsAcknowledged(event.target.checked)} className="h-3.5 w-3.5 accent-[rgb(var(--primary))]" />I&apos;ve reviewed these warnings</label>
        </div>
      )}
      {/* Filter tabs */}
      <div role="tablist" aria-label={`${teamCode} lineup selection`} className="flex gap-1 bg-surface2 border border-border rounded-lg p-1 w-fit">
        {(['starter', 'sub', 'out'] as const).map((t) => {
          const label = t === 'starter' ? `Starters (${starterCount})` : t === 'sub' ? `Subs (${subCount})` : 'Not selected'
          return (
            <button key={t} id={`lineup-tab-${teamCode}-${t}`} role="tab" aria-selected={tab === t} aria-controls={`lineup-panel-${teamCode}-${t}`} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-[11.5px] font-bold transition-all ${tab === t ? 'bg-card text-textp shadow-sm' : 'text-texts'}`}>
              {label}
            </button>
          )
        })}
      </div>
      {tab === 'starter' && layoutMode === 'manual' && <p className="text-[10px] text-texts">Set each starter&apos;s row and lane to place left/right centre-backs, midfielders, and wide players accurately on the match pitch.</p>}

      <div id={`lineup-panel-${teamCode}-${tab}`} role="tabpanel" aria-labelledby={`lineup-tab-${teamCode}-${tab}`} className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="text-sm text-texts py-3 text-center">None</p>}
        {filtered.map((e) => (
          <div key={e.playerId} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
            <span className="w-6 text-center text-[11px] font-mono text-texts shrink-0">{e.jersey ?? '–'}</span>
            <span className="text-sm text-textp flex-1 truncate">{e.name}</span>
            {e.status !== 'out' && (
              <select
                value={e.posLabel}
                onChange={(ev) => update(e.playerId, { posLabel: ev.target.value })}
                className="text-[11px] h-7 rounded-md border border-border bg-surface text-textp px-1"
              >
                <option value="">Pos</option>
                {POS_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {e.status === 'starter' && layoutMode === 'manual' && <>
              <select value={e.grid?.split(':')[0] ?? defaultGrid(e.posLabel).split(':')[0]} onChange={(ev) => update(e.playerId, { grid: `${ev.target.value}:${e.grid?.split(':')[1] ?? defaultGrid(e.posLabel).split(':')[1]}` })} className="h-7 rounded-md border border-border bg-surface px-1 text-[10px] text-textp" aria-label={`${e.name} pitch row`}>
                {PITCH_ROWS.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
              </select>
              <select value={e.grid?.split(':')[1] ?? defaultGrid(e.posLabel).split(':')[1]} onChange={(ev) => update(e.playerId, { grid: `${e.grid?.split(':')[0] ?? defaultGrid(e.posLabel).split(':')[0]}:${ev.target.value}` })} className="h-7 rounded-md border border-border bg-surface px-1 text-[10px] text-textp" aria-label={`${e.name} pitch lane`}>
                {PITCH_LANES.map((lane) => <option key={lane.value} value={lane.value}>{lane.label}</option>)}
              </select>
            </>}
            <div className="flex gap-1 shrink-0">
              <button onClick={() => update(e.playerId, { status: 'starter', grid: layoutMode === 'manual' ? (e.grid ?? defaultGrid(e.posLabel)) : null })}
                className={`px-2 py-1 rounded text-[10.5px] font-bold border transition-all ${e.status === 'starter' ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-texts hover:text-textp'}`}>
                XI
              </button>
              <button onClick={() => update(e.playerId, { status: 'sub' })}
                className={`px-2 py-1 rounded text-[10.5px] font-bold border transition-all ${e.status === 'sub' ? 'bg-blue/15 border-blue/40 text-blue' : 'border-border text-texts hover:text-textp'}`}>
                Sub
              </button>
              {e.status !== 'out' && (
                <button onClick={() => update(e.playerId, { status: 'out' })}
                  className="px-2 py-1 rounded text-[10.5px] font-bold border border-border text-texts hover:text-coral">
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button onClick={clearLineup} className="text-[11px] text-texts hover:text-coral underline">Clear lineup</button>
        <Button size="sm" onClick={save} disabled={saving || (lineupWarnings.length > 0 && !warningsAcknowledged)}>{saving ? 'Saving…' : lineupWarnings.length > 0 ? 'Save with warnings' : 'Save lineup'}</Button>
      </div>
    </div>
  )
}

function SubstitutionEditor({ matchId, teamCode, onChanged }: { matchId: string; teamCode: string; onChanged?: () => void }) {
  const supabase = createClient()
  const [rows, setRows] = useState<LineupPlayerState[]>([])
  const [events, setEvents] = useState<LineupSubstitution[]>([])
  const [outId, setOutId] = useState('')
  const [inId, setInId] = useState('')
  const [minute, setMinute] = useState('60')
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const [lineups, subs] = await Promise.all([
      supabase.from('lineups').select('player_id, is_starting, shirt_number, position_label, grid, sort_order, players(name)').eq('match_id', matchId).eq('team_code', teamCode),
      supabase.from('lineup_substitutions').select('id, team_code, player_out_id, player_in_id, minute, source, created_at').eq('match_id', matchId).eq('team_code', teamCode).order('minute'),
    ])
    setRows((lineups.data ?? []) as unknown as LineupPlayerState[])
    setEvents((subs.data ?? []) as LineupSubstitution[])
  }, [matchId, supabase, teamCode])
  useEffect(() => { load() }, [load])
  const state = resolveLineupState(rows, events, teamCode)
  const name = (id: number) => rows.find((row) => row.player_id === id)?.players?.name ?? 'Player'
  async function add() {
    const playerOut = Number(outId), playerIn = Number(inId), eventMinute = Number(minute)
    if (!playerOut || !playerIn || playerOut === playerIn || !Number.isInteger(eventMinute) || eventMinute < 1 || eventMinute > 130) { toast.error('Choose a valid outgoing player, incoming player, and minute'); return }
    setSaving(true)
    const { error } = await supabase.from('lineup_substitutions').insert({ match_id: matchId, team_code: teamCode, player_out_id: playerOut, player_in_id: playerIn, minute: eventMinute, source: 'manual' })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setOutId(''); setInId(''); await load(); onChanged?.(); toast.success('Substitution added')
  }
  async function remove(id: string) {
    const { error } = await supabase.from('lineup_substitutions').delete().eq('id', id)
    if (error) toast.error(error.message); else { await load(); onChanged?.(); toast.success('Substitution removed') }
  }
  if (!rows.length) return <p className="text-xs text-texts">Save the announced lineup first to record substitutions.</p>
  return <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
    <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-texts">Live substitutions</p><span className="text-[10px] text-texts">Current XI preview: {state.current.length}</span></div>
    {events.length > 0 && <div className="space-y-1">{events.map((event) => <div key={event.id} className="flex items-center gap-2 text-[11px] rounded-lg bg-surface px-2 py-1.5"><span className="font-bold text-primary">{event.minute}′</span><span className="flex-1 truncate">{name(event.player_out_id)} → {name(event.player_in_id)}</span><span className="text-texts">{event.source}</span>{event.id && <button onClick={() => remove(event.id!)} title="Remove so you can correct this event" className="text-coral font-bold">×</button>}</div>)}</div>}
    <div className="grid grid-cols-[1fr_1fr_56px_auto] gap-1.5">
      <select value={outId} onChange={(event) => setOutId(event.target.value)} className="min-w-0 rounded-md border border-border bg-surface px-1 text-[11px]"><option value="">Player out</option>{state.current.map((row) => <option key={row.player_id} value={row.player_id}>{row.players?.name}</option>)}</select>
      <select value={inId} onChange={(event) => setInId(event.target.value)} className="min-w-0 rounded-md border border-border bg-surface px-1 text-[11px]"><option value="">Player in</option>{state.bench.map((row) => <option key={row.player_id} value={row.player_id}>{row.players?.name}</option>)}</select>
      <input value={minute} onChange={(event) => setMinute(event.target.value)} inputMode="numeric" aria-label="Minute" className="rounded-md border border-border bg-surface px-1 text-center text-[11px]" />
      <Button size="sm" variant="outline" onClick={add} disabled={saving}>Add</Button>
    </div>
  </div>
}

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  first_goal_team: string | null
  first_goal_player_id: number | null
  match_winner: string | null
  home_formation: string | null
  away_formation: string | null
  home_formation_override: string | null
  away_formation_override: string | null
  rounds: { name: string } | null
}

interface Player { id: number; name: string; team_code: string }

interface AdminRowHandle { save: () => Promise<void> }

const AdminRow = forwardRef<AdminRowHandle, { m: Match; onSaved: (m: Match) => void }>(
function AdminRow({ m, onSaved }, ref) {
  const supabase = createClient()
  const home = getTeam(m.home_team), away = getTeam(m.away_team)
  const [open, setOpen] = useState(false)
  const [h, setH] = useState<number | null>(m.real_home_score)
  const [a, setA] = useState<number | null>(m.real_away_score)
  const [fgt, setFgt] = useState<string | null>(m.first_goal_team)
  const [scorerId, setScorerId] = useState<number | null>(m.first_goal_player_id)
  const [matchWinner, setMatchWinner] = useState<string | null>(m.match_winner)
  const [players, setPlayers] = useState<Player[]>([])
  const [scorerOpen, setScorerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [scoringFailed, setScoringFailed] = useState(false)
  const [homeFormationOverride, setHomeFormationOverride] = useState<string | null>(m.home_formation_override)
  const [awayFormationOverride, setAwayFormationOverride] = useState<string | null>(m.away_formation_override)
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(0)

  const hasScore = m.real_home_score !== null && m.real_away_score !== null
  const isKnockout = !m.group_name

  async function expand() {
    const opening = !open
    setOpen(opening)
    if (opening && players.length === 0) {
      const { data } = await supabase.from('players').select('id, name, team_name').in('team_name', [home.playerKey, away.playerKey])
      type PlayerRow = { id: number; name: string; team_name: string }
      setPlayers((data ?? []).map((p) => {
        const { id, name, team_name } = p as PlayerRow
        return { id, name, team_code: team_name === home.playerKey ? m.home_team : m.away_team }
      }))
    }
  }

  const scoreOnly = useCallback(async () => {
    setSaving(true)
    setScoringFailed(false)
    const res = await fetch('/api/score-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: m.id }) })
    setSaving(false)
    if (!res.ok) {
      setScoringFailed(true)
      toast.error((await res.json().catch(() => ({}))).error ?? 'Retry failed — check API logs')
      return
    }
    onSaved({ ...m, real_home_score: h, real_away_score: a, is_locked: true, first_goal_team: fgt, first_goal_player_id: scorerId, match_winner: matchWinner })
    toast.success(`${home.name} ${h}–${a} ${away.name} re-scored`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, a, fgt, scorerId, m.id, home.name, away.name])

  const save = useCallback(async () => {
    if (h == null || a == null) { toast.error('Both scores required'); return }
    setSaving(true)
    setScoringFailed(false)
    const { error } = await supabase.from('matches').update({
      real_home_score: h, real_away_score: a, is_locked: true,
      // -1 is the "Own goal" sentinel — no creditable scorer, so store NULL
      // (the FK only accepts a real players.id or NULL).
      first_goal_team: fgt, first_goal_player_id: scorerId === -1 ? null : scorerId,
      ...(isKnockout ? { match_winner: matchWinner } : {}),
    }).eq('id', m.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    const res = await fetch('/api/score-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: m.id }) })
    setSaving(false)
    if (!res.ok) {
      setScoringFailed(true)
      toast.error('Match saved but scoring failed — use "Retry scoring" to fix')
      return
    }
    onSaved({ ...m, real_home_score: h, real_away_score: a, is_locked: true, first_goal_team: fgt, first_goal_player_id: scorerId, match_winner: matchWinner })
    toast.success(`${home.name} ${h}–${a} ${away.name} saved & scored`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, a, fgt, scorerId, matchWinner, m.id, m.group_name, home.name, away.name])

  useImperativeHandle(ref, () => ({ save }), [save])

  const scorerName = scorerId === -1 ? 'Own goal' : (players.find((p) => p.id === scorerId)?.name ?? '')
  const scorerOptions = players.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card className={`p-3 ${hasScore ? 'border-primary/30' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="basis-full sm:basis-auto flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FlagChip code={home.code} w={18} h={12} r={2} /><span className="truncate">{home.name}</span>
            <span className="text-texts">v</span>
            <FlagChip code={away.code} w={18} h={12} r={2} /><span className="truncate">{away.name}</span>
          </div>
          <div className="text-[11px] text-texts mt-0.5">{fmtDateTime(m.match_date)} · {m.rounds?.name ?? '—'}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ScoreStepper value={h} onChange={setH} />
          <span className="text-texts">:</span>
          <ScoreStepper value={a} onChange={setA} />
        </div>
        <button onClick={expand} className="shrink-0 w-9 h-9 grid place-items-center rounded-md border border-border text-texts hover:text-textp">
          <ChevDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-texts">First-goal team</label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {[{ k: m.home_team, l: home.code }, { k: 'NONE', l: 'None' }, { k: m.away_team, l: away.code }].map((o) => (
                <button key={o.k} onClick={() => setFgt(fgt === o.k ? null : o.k)}
                  className={`h-10 rounded-lg border text-sm font-bold transition-all ${fgt === o.k ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-surface text-texts'}`}>{o.l}</button>
              ))}
            </div>
          </div>
          <div className="relative">
            <label className="text-[11px] font-bold uppercase tracking-wider text-texts">First scorer</label>
            <button onClick={() => setScorerOpen((o) => !o)} className="mt-1.5 w-full h-10 px-3 rounded-lg border border-border bg-surface flex items-center justify-between text-sm font-semibold">
              <span className={scorerName ? 'text-textp' : 'text-texts'}>{scorerName || 'Pick a player…'}</span>
              <ChevDown className="text-texts" />
            </button>
            {scorerOpen && (
              <div className="absolute z-30 mt-1 w-full bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-border flex items-center gap-2">
                  <SearchIcon className="text-texts" />
                  <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="flex-1 bg-transparent text-sm text-textp outline-none placeholder:text-texts" />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <button onClick={() => { setScorerId(null); setScorerOpen(false) }} className="w-full px-3 h-10 text-left text-sm text-texts hover:bg-surface">— Clear —</button>
                  <button onClick={() => { setScorerId(-1); setScorerOpen(false); setSearch('') }} className={`w-full px-3 h-10 flex items-center gap-2 text-left text-sm font-bold hover:bg-surface ${scorerId === -1 ? 'text-primary' : 'text-textp'}`}>
                    <span>⚽</span><span className="flex-1">Own goal</span>
                    {scorerId === -1 && <span className="text-primary">✓</span>}
                  </button>
                  {scorerOptions.map((o) => (
                    <button key={o.id} onClick={() => { setScorerId(o.id); setScorerOpen(false); setSearch('') }} className="w-full px-3 h-10 flex items-center gap-2 hover:bg-surface text-left">
                      <FlagChip code={o.team_code} w={16} h={11} r={2} /><span className="text-sm text-textp flex-1">{o.name}</span>
                      {scorerId === o.id && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><path d="m5 12 5 5L20 7"/></svg>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isKnockout && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-texts">
                Match winner <span className="normal-case font-normal text-texts/60">(set only if draw → penalties)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {[{ k: m.home_team, t: home }, { k: m.away_team, t: away }].map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setMatchWinner(matchWinner === o.k ? null : o.k)}
                    className={`h-10 rounded-lg border text-sm font-bold flex items-center justify-center gap-1.5 transition-all
                      ${matchWinner === o.k ? 'border-gold bg-gold/10 text-gold' : 'border-border bg-surface text-texts'}`}
                  >
                    <FlagChip code={o.t.code} w={16} h={11} r={2} />{o.t.code}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-1">
            <div className="mb-2 flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-wider text-texts">Lineup management</p><Button size="sm" variant="outline" onClick={() => setFullPreviewOpen((value) => !value)}>{fullPreviewOpen ? 'Hide full pitch' : 'Preview both teams'}</Button></div>
            {fullPreviewOpen && <div className="mb-3"><FullMatchLineupPreview matchId={m.id} homeCode={m.home_team} awayCode={m.away_team} homeFormation={homeFormationOverride ?? m.home_formation} awayFormation={awayFormationOverride ?? m.away_formation} refreshKey={previewVersion} /></div>}
            {['home', 'away'].map((side) => {
              const team = side === 'home' ? home : away
              const code = side === 'home' ? m.home_team : m.away_team
              const providerFormation = side === 'home' ? m.home_formation : m.away_formation
              const formationOverride = side === 'home' ? homeFormationOverride : awayFormationOverride
              const formation = formationOverride ?? providerFormation
              const formationColumn = side === 'home' ? 'home_formation_override' : 'away_formation_override'
              return (
                <div key={side} className="mb-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-texts flex items-center gap-2">
                    <FlagChip code={code} w={16} h={11} r={2} /> {team.name} lineup
                  </label>
                  <div className="mt-1.5 bg-surface border border-border rounded-lg p-3">
                    <FormationOverrideControl
                      matchId={m.id}
                      teamCode={code}
                      providerFormation={providerFormation}
                      override={formationOverride}
                      column={formationColumn}
                      onSaved={(next) => { if (side === 'home') setHomeFormationOverride(next); else setAwayFormationOverride(next); setPreviewVersion((version) => version + 1) }}
                    />
                    <div className="mt-3">
                    <LineupEditor matchId={m.id} teamCode={code} playerKey={team.playerKey} formation={formation} onSaved={() => setPreviewVersion((version) => version + 1)} />
                    </div>
                    <SubstitutionEditor matchId={m.id} teamCode={code} onChanged={() => setPreviewVersion((version) => version + 1)} />
                    <FormationChangesEditor matchId={m.id} teamCode={code} baseFormation={formation} onChanged={() => setPreviewVersion((version) => version + 1)} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
        {hasScore && <Pill tone="green">{m.real_home_score}–{m.real_away_score} (scored)</Pill>}
        {scoringFailed && (
          <Button size="sm" variant="outline" onClick={scoreOnly} disabled={saving}>
            {saving ? '…' : 'Retry scoring'}
          </Button>
        )}
        {hasScore ? (
          <EditConfirmButton saving={saving} onConfirm={save}
            label={`Update ${home.name} vs ${away.name} — this will re-score all predictions for this match.`}
          />
        ) : (
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & score'}</Button>
        )}
      </div>
    </Card>
  )
})

/* ── QuickImport ─────────────────────────────────────────────────────────── */
function QuickImport({ matches, onDone }: { matches: Match[]; onDone: (updated: Match[]) => void }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return
    setBusy(true)
    let ok = 0; let fail = 0
    const updatedMatches = [...matches]
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length !== 4) { fail++; continue }
      const [homeCode, awayCode, hs, as_] = parts
      const homeScore = parseInt(hs ?? '', 10)
      const awayScore = parseInt(as_ ?? '', 10)
      if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || homeScore > 20 || awayScore < 0 || awayScore > 20) { fail++; continue }
      const idx = updatedMatches.findIndex(
        (m) => m.home_team.toUpperCase() === homeCode?.toUpperCase() &&
               m.away_team.toUpperCase() === awayCode?.toUpperCase() &&
               m.real_home_score === null
      )
      if (idx < 0) { fail++; continue }
      const match = updatedMatches[idx]!
      const { error } = await supabase.from('matches').update({
        real_home_score: homeScore, real_away_score: awayScore, is_locked: true,
      }).eq('id', match.id)
      if (error) { fail++; continue }
      await fetch('/api/score-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: match.id }) })
      updatedMatches[idx] = { ...match, real_home_score: homeScore, real_away_score: awayScore, is_locked: true }
      ok++
    }
    setBusy(false)
    if (ok > 0) { toast.success(`Imported ${ok} result${ok !== 1 ? 's' : ''}`); onDone(updatedMatches); setText(''); setOpen(false) }
    if (fail > 0) toast.error(`${fail} line${fail !== 1 ? 's' : ''} skipped — check codes or already scored`)
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-bold text-primary hover:underline"
      >
        {open ? 'Hide quick import' : '+ Quick import (paste results)'}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-xl border border-border bg-surface/40 space-y-2">
          <p className="text-[11px] text-texts font-medium">
            One result per line: <code className="bg-surface2 px-1 py-0.5 rounded text-[10px]">HOME AWAY home_score away_score</code>
            {' '}e.g. <code className="bg-surface2 px-1 py-0.5 rounded text-[10px]">ARG BRA 2 1</code>
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={'ARG BRA 2 1\nFRA ENG 0 0\nESP GER 3 2'}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-textp placeholder:text-texts/40 focus:outline-none focus:border-primary resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={run} disabled={busy || !text.trim()}>{busy ? 'Importing…' : 'Import & score'}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setText('') }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

type FifaSyncSummary = {
  mapped: number
  started: number
  completeLineups: number
  completeStats: number
  missingLineups: Array<{ id: string; home_team: string; away_team: string }>
  missingStats: Array<{ id: string; home_team: string; away_team: string }>
  latestSourceUpdate: string | null
  ageMinutes: number | null
  latest: Record<string, { status: string; finished_at: string | null; records_read?: number; records_written?: number; error_summary?: string | null; scope?: string | null }>
}

function FifaSyncDashboard() {
  const [summary, setSummary] = useState<FifaSyncSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/fifa-health', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not load FIFA sync status')
      setSummary(payload as FifaSyncSummary)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load FIFA sync status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command)
      toast.success('Command copied')
    } catch {
      toast.error('Could not copy command')
    }
  }

  const commands = [
    { label: 'Daily refresh', command: 'npm run data:fifa:daily', sub: 'Fixtures, nearby XI/stats, finished goals/cards, and Golden Boot' },
    { label: 'Teams + media', command: 'npm run data:fifa-teams', sub: 'All 48 squads, team stats, flags, crests, and FIFA player images' },
    { label: 'Fixtures only', command: 'npm run data:fifa:fixtures', sub: 'All FIFA IDs, times, status, and venue data' },
    { label: 'Full backfill', command: 'npm run data:fifa:backfill', sub: 'Historical XI, substitutions, stats, goals, and cards' },
    { label: 'Database audit', command: 'npm run data:audit', sub: 'Read-only coverage and sync-health report; no FIFA call or writes' },
  ]

  return <Card className="p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <SectionHeader title="FIFA sync cockpit" sub="Database health and copyable local commands. Opening this panel never calls FIFA." />
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Refresh status'}</Button>
    </div>
    {loading || !summary ? <Skeleton className="mt-3 h-24 rounded-xl" /> : <>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SyncMetric label="Fixtures mapped" value={`${summary.mapped}/104`} tone={summary.mapped >= 72 ? 'primary' : 'gold'} />
        <SyncMetric label="Last FIFA update" value={summary.latestSourceUpdate ? fmtDateTime(summary.latestSourceUpdate) : 'Never'} tone={summary.ageMinutes != null && summary.ageMinutes > 720 ? 'gold' : 'default'} />
        <SyncMetric label="Started with XI" value={`${summary.completeLineups}/${summary.started}`} tone={summary.missingLineups.length ? 'gold' : 'primary'} />
        <SyncMetric label="Started with stats" value={`${summary.completeStats}/${summary.started}`} tone={summary.missingStats.length ? 'gold' : 'primary'} />
      </div>
      <p className="mt-2 text-[10px] text-texts">{summary.ageMinutes == null ? 'No official source timestamp yet.' : `Source freshness: ${summary.ageMinutes < 60 ? `${summary.ageMinutes} min ago` : `${Math.floor(summary.ageMinutes / 60)}h ago`}.`} Missing counts only include fixtures that have started.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SyncGap title="Lineup coverage" matches={summary.missingLineups} command="FIFA_SYNC_MODE=lineups MATCH_ID=" onCopy={copy} />
        <SyncGap title="Stat coverage" matches={summary.missingStats} command="FIFA_SYNC_MODE=stats MATCH_ID=" onCopy={copy} />
      </div>
      <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-texts">Latest import runs</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          {(['fifa_matches', 'events', 'fifa_teams', 'golden_boot'] as const).map((kind) => {
            const run = summary.latest[kind]
            const tone = run?.status === 'success' ? 'text-primary' : run?.status === 'failed' ? 'text-error' : run?.status === 'partial' ? 'text-gold' : 'text-texts'
            return <div key={kind} className="min-w-0"><p className="text-[10px] font-bold uppercase text-texts">{kind.replace('_', ' ')}</p><p className={`mt-0.5 truncate text-[11px] font-bold ${tone}`}>{run ? `${run.status} · ${run.records_written ?? 0} writes` : 'Not run'}</p>{run?.error_summary && <p className="mt-0.5 truncate text-[10px] text-error" title={run.error_summary}>{run.error_summary}</p>}</div>
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {commands.map((item) => <button key={item.command} onClick={() => void copy(item.command)} className="rounded-xl border border-border bg-surface p-3 text-left transition hover:border-primary/45 hover:bg-primary/[0.04]">
          <p className="text-xs font-bold text-textp">{item.label}</p><p className="mt-0.5 text-[10px] text-texts">{item.sub}</p><code className="mt-2 block truncate text-[10px] font-bold text-primary">{item.command}</code>
        </button>)}
      </div>
    </>}
  </Card>
}

function SyncGap({ title, matches, command, onCopy }: { title: string; matches: Array<{ id: string; home_team: string; away_team: string }>; command: string; onCopy: (command: string) => Promise<void> }) {
  return <div className="rounded-xl border border-border bg-surface p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-textp">{title}</p><Pill tone={matches.length ? 'gold' : 'green'}>{matches.length ? `${matches.length} missing` : 'Complete'}</Pill></div>{matches.length ? <div className="mt-2 space-y-1.5">{matches.slice(0, 3).map((match) => <button key={match.id} onClick={() => void onCopy(`${command}${match.id} npm run data:fifa:match`)} className="block w-full truncate text-left text-[10px] font-semibold text-primary hover:underline" title="Copy a targeted refresh command">{match.home_team} v {match.away_team} · copy refresh</button>)}</div> : <p className="mt-1.5 text-[10px] text-texts">Every started match is covered.</p>}</div>
}

function SyncMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'gold' }) {
  const colour = tone === 'primary' ? 'text-primary' : tone === 'gold' ? 'text-gold' : 'text-textp'
  return <div className="rounded-xl border border-border bg-surface px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-wider text-texts">{label}</p><p className={`mt-1 truncate text-sm font-extrabold tabular-nums ${colour}`} title={value}>{value}</p></div>
}

function AdminActions() {
  const [busy, setBusy] = useState<string | null>(null)
  const [health, setHealth] = useState<Record<string, { status: string; finished_at: string | null; details: Record<string, unknown> }>>({})

  async function loadHealth() {
    try {
      const response = await fetch('/api/live-status')
      const data = await response.json()
      if (response.ok) setHealth(data.latest ?? {})
    } catch {}
  }

  useEffect(() => { void loadHealth() }, [])

  async function call(key: string, label: string, url: string, body?: object) {
    setBusy(key)
    const tid = toast.loading(`Running: ${label}…`)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(json.message ?? `${label} done`, { id: tid })
        void loadHealth()
      }
      else toast.error(json.error ?? 'Error', { id: tid })
    } catch (e) {
      toast.error(String(e), { id: tid })
    }
    setBusy(null)
  }

  const actions = [
    { key: 'sync', label: 'Sync final results', sub: 'Pull finished FIFA scores, then auto-score all predictions', url: '/api/sync-results' },
    { key: 'events', label: 'Sync recent goals + cards', sub: 'Pull FIFA goal and card events for matches finished in the last six hours', url: '/api/sync-events' },
    { key: 'snapshot', label: 'Snapshot leaderboard', sub: 'Records current rank positions for movement arrows', url: '/api/snapshot-ranks' },
    { key: 'groups', label: 'Score group predictions', sub: 'Awards points for correct group order picks (all complete groups)', url: '/api/score-groups' },
    { key: 'tournament', label: 'Score tournament picks', sub: 'Awards points for champion / finalist / semi / quarter picks', url: '/api/score-tournament' },
    { key: 'rescore', label: 'Rescore all matches', sub: 'Recalculates every prediction for all scored matches (use after rule changes)', url: '/api/rescore-all' },
  ]

  return (
    <Card className="p-4">
      <SectionHeader title="Tournament actions" sub="Run these after results are in." />
      <div className="grid grid-cols-2 gap-2 mt-3 mb-4">
        {(['results', 'events'] as const).map((kind) => {
          const run = health[kind]
          const tone = run?.status === 'success' ? 'text-primary' : run?.status === 'partial' ? 'text-gold' : run?.status === 'failed' ? 'text-error' : 'text-texts'
          return (
            <div key={kind} className="rounded-lg border border-border bg-surface px-2.5 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-texts">{kind}</p>
              <p className={`text-xs font-bold capitalize mt-0.5 ${tone}`}>{run?.status ?? 'Not run'}</p>
              <p className="text-[10px] text-faint mt-0.5 truncate">{run?.finished_at ? fmtDateTime(run.finished_at) : 'No completed sync'}</p>
            </div>
          )
        })}
      </div>
      <div className="space-y-3 mt-3">
        {actions.map((a) => (
          <div key={a.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-textp truncate">{a.label}</p>
              <p className="text-[11px] text-texts truncate">{a.sub}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => call(a.key, a.label, a.url)} disabled={busy === a.key} className="shrink-0">
              {busy === a.key ? '…' : 'Run'}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

interface LabelRow { id: string; name: string; color: string }
interface LeagueAdminRow { id: string; name: string; type: 'money' | 'points'; join_code: string; scoring: unknown; bracket_enabled: boolean; reveal_predictions: boolean; prize_pool: boolean; banners_enabled: boolean; label_id: string | null; league_labels: { name: string; color: string } | null; memberIds: string[]; bannerCount: number }
interface LeagueAdminRaw extends Omit<LeagueAdminRow, 'league_labels' | 'memberIds' | 'bannerCount'> { label_name: string | null; label_color: string | null }
interface BannerItem { id: string; image_url: string; storage_path: string; display_order: number }
interface AdminProfile { id: string; username: string | null }

function ScoringEditor({ league, onClose }: { league: LeagueAdminRow; onClose: () => void }) {
  const supabase = createClient()
  const [w, setW] = useState<ScoringWeights>(() => resolveWeights(league.scoring))
  const [saving, setSaving] = useState(false)
  const groups = ['Match', 'Group', 'Tournament'] as const

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('leagues').update({ scoring: w }).eq('id', league.id)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Scoring weights saved')
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {groups.map((g) => (
        <div key={g}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-1.5">{g}</p>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {WEIGHT_FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-textp truncate">{f.label}</span>
                <ScoreStepper value={w[f.key]} onChange={(v) => setW((p) => ({ ...p, [f.key]: v }))} compact min={0} max={50} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save weights'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setW({ ...DEFAULT_WEIGHTS })}>Reset to default</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function LeagueManage({
  league, leagues, profiles, labels, onChanged,
}: { league: LeagueAdminRow; leagues: LeagueAdminRow[]; profiles: AdminProfile[]; labels: LabelRow[]; onChanged: () => Promise<void> | void }) {
  const supabase = createClient()
  const [name, setName] = useState(league.name)
  const [code, setCode] = useState(league.join_code)
  const [memberSearch, setMemberSearch] = useState('')
  const [banners, setBanners] = useState<BannerItem[]>([])
  const [bannerUploading, setBannerUploading] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('league_banners')
      .select('id, image_url, storage_path, display_order')
      .eq('league_id', league.id)
      .order('display_order')
      .then(({ data }) => setBanners((data ?? []) as BannerItem[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id])

  async function uploadBanner(file: File) {
    setBannerUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const storagePath = `${league.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('banners').upload(storagePath, file)
      if (upErr) { toast.error(upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('banners').getPublicUrl(storagePath)
      const nextOrder = banners.length
      const { data: inserted, error: dbErr } = await supabase.from('league_banners')
        .insert({ league_id: league.id, image_url: publicUrl, storage_path: storagePath, display_order: nextOrder })
        .select('id, image_url, storage_path, display_order')
        .single()
      if (dbErr) {
        await supabase.storage.from('banners').remove([storagePath])
        toast.error(dbErr.message)
      } else {
        setBanners((b) => [...b, inserted as BannerItem])
        toast.success('Banner uploaded')
      }
    } finally {
      setBannerUploading(false)
    }
  }

  async function deleteBanner(item: BannerItem) {
    const { error: storageErr } = await supabase.storage.from('banners').remove([item.storage_path])
    if (storageErr) { toast.error(storageErr.message); return }
    const { error } = await supabase.from('league_banners').delete().eq('id', item.id)
    if (error) toast.error(error.message)
    else { setBanners((b) => b.filter((x) => x.id !== item.id)); toast.success('Banner removed') }
  }

  const nameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.username ?? '?'])), [profiles])
  const otherLeagues = leagues.filter((l) => l.id !== league.id)
  const members = league.memberIds
  const addable = profiles.filter((p) => !members.includes(p.id) && (p.username ?? '').toLowerCase().includes(memberSearch.toLowerCase())).slice(0, 8)

  async function patch(fields: Record<string, unknown>, note: string) {
    const { error } = await supabase.from('leagues').update(fields).eq('id', league.id)
    if (error) toast.error(error.message); else { toast.success(note); await onChanged() }
  }
  async function addMember(uid: string) {
    const { error } = await supabase.from('league_members').insert({ league_id: league.id, user_id: uid })
    if (error) toast.error(error.message); else { toast.success('Member added'); await onChanged() }
  }
  async function removeMember(uid: string) {
    const { error } = await supabase.from('league_members').delete().eq('league_id', league.id).eq('user_id', uid)
    if (error) toast.error(error.message); else { toast.success('Member removed'); await onChanged() }
  }
  async function moveMember(uid: string, toLeague: string) {
    if (!toLeague) return
    const { error: e1 } = await supabase.from('league_members').insert({ league_id: toLeague, user_id: uid })
    if (e1 && !e1.message.toLowerCase().includes('duplicate')) { toast.error(e1.message); return }
    const { error: e2 } = await supabase.from('league_members').delete().eq('league_id', league.id).eq('user_id', uid)
    if (e2) toast.error(e2.message); else { toast.success('Member moved'); await onChanged() }
  }

  const inputCls = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary'

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      {/* settings */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">Name</label>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className={`flex-1 ${inputCls}`} />
            <Button size="sm" variant="surface" onClick={() => patch({ name: name.trim() }, 'Name saved.')} disabled={!name.trim() || name.trim() === league.name}>Save</Button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">Join code</label>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`flex-1 font-mono tracking-widest uppercase ${inputCls}`} />
            <Button size="sm" variant="surface" onClick={() => patch({ join_code: code.trim().toUpperCase() }, 'Code saved.')} disabled={!code.trim() || code.trim().toUpperCase() === league.join_code}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { const c = randomCode(); setCode(c); patch({ join_code: c }, `New code ${c}.`) }}>↻</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Label</span>
          <select
            value={league.label_id ?? ''}
            onChange={(e) => patch({ label_id: e.target.value || null }, 'Label updated.')}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-textp focus:outline-none focus:border-primary"
          >
            <option value="">No label</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Prize pool</span>
          <Button size="sm" variant={league.prize_pool ? 'gold' : 'surface'} onClick={() => patch({ prize_pool: !league.prize_pool, type: !league.prize_pool ? 'money' : 'points' }, league.prize_pool ? 'Prize pool off.' : 'Prize pool on.')}>
            {league.prize_pool ? 'On' : 'Off'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Bracket game</span>
          <Button size="sm" variant={league.bracket_enabled ? 'primary' : 'surface'} onClick={() => patch({ bracket_enabled: !league.bracket_enabled }, league.bracket_enabled ? 'Bracket disabled.' : 'Bracket enabled.')}>
            {league.bracket_enabled ? 'On' : 'Off'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Reveal picks pre-game</span>
          <Button size="sm" variant={league.reveal_predictions ? 'primary' : 'surface'} onClick={() => patch({ reveal_predictions: !league.reveal_predictions }, league.reveal_predictions ? 'Predictions hidden until kickoff.' : 'Predictions visible pre-game.')}>
            {league.reveal_predictions ? 'On' : 'Off'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Banners</span>
          <Button size="sm" variant={league.banners_enabled ? 'primary' : 'surface'} onClick={() => patch({ banners_enabled: !league.banners_enabled }, league.banners_enabled ? 'Banners hidden.' : 'Banner slider enabled.')}>
            {league.banners_enabled ? 'On' : 'Off'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Manual GD edit</span>
          {(() => {
            const scoring = (typeof league.scoring === 'object' && league.scoring !== null) ? league.scoring as Record<string, unknown> : {}
            const disabled = !!scoring.disable_gd
            return (
              <Button size="sm" variant={disabled ? 'surface' : 'primary'} onClick={() => patch({ scoring: { ...scoring, disable_gd: !disabled } }, disabled ? 'Manual GD override enabled.' : 'Manual GD override disabled.')}>
                {disabled ? 'Off' : 'On'}
              </Button>
            )
          })()}
        </div>
      </div>

      {/* Banner image management */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">
          Banners{!league.banners_enabled && <span className="normal-case font-normal text-texts/60 ml-1">(enable above to show on dashboard)</span>}
        </p>

        <div className="space-y-2">
          {banners.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <Image src={item.image_url} alt="" width={80} height={40} className="w-20 h-10 object-cover rounded-md shrink-0 bg-card" />
              <span className="text-[12px] text-texts flex-1 truncate">Banner {i + 1}</span>
              <Button size="sm" variant="danger" onClick={() => deleteBanner(item)}>Remove</Button>
            </div>
          ))}
          {banners.length === 0 && <p className="text-[13px] text-texts">No banners uploaded yet.</p>}
        </div>

        <input
          ref={bannerInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBanner(f); e.target.value = '' }}
        />
        <Button
          size="sm"
          variant="surface"
          className="mt-2"
          disabled={bannerUploading}
          onClick={() => bannerInputRef.current?.click()}
        >
          {bannerUploading ? 'Uploading…' : '+ Upload banner'}
        </Button>
        <p className="text-[11px] text-texts mt-1">JPEG/PNG/WebP · max 10 MB · images are shown at 16:7 aspect ratio</p>
      </div>

      {/* members */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-1.5">Members ({members.length})</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {members.map((uid) => (
            <div key={uid} className="flex items-center gap-2">
              <span className="flex-1 text-[13px] font-semibold text-textp truncate">{nameById.get(uid) ?? uid}</span>
              {otherLeagues.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => { moveMember(uid, e.target.value); e.currentTarget.value = '' }}
                  className="text-[12px] rounded-md border border-border bg-surface px-2 py-1 text-texts focus:outline-none"
                >
                  <option value="" disabled>Move to…</option>
                  {otherLeagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <Button size="sm" variant="ghost" onClick={() => removeMember(uid)}>Remove</Button>
            </div>
          ))}
          {members.length === 0 && <p className="text-[13px] text-texts">No members yet.</p>}
        </div>
      </div>

      {/* add member */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-1.5">Add member</p>
        <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search players…" className={`w-full ${inputCls}`} />
        {memberSearch && (
          <div className="mt-1.5 space-y-1">
            {addable.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 text-[13px] text-textp truncate">{p.username ?? p.id}</span>
                <Button size="sm" variant="surface" onClick={() => addMember(p.id)}>Add</Button>
              </div>
            ))}
            {addable.length === 0 && <p className="text-[13px] text-texts">No matching players.</p>}
          </div>
        )}
      </div>

    </div>
  )
}

function UserLeagueAssign({
  leagues, profiles, onChanged,
}: { leagues: LeagueAdminRow[]; profiles: AdminProfile[]; onChanged: () => Promise<void> | void }) {
  const supabase = createClient()
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)

  async function toggle(leagueId: string, isMember: boolean) {
    if (!userId) return
    setBusy(true)
    const { error } = isMember
      ? await supabase.from('league_members').delete().eq('league_id', leagueId).eq('user_id', userId)
      : await supabase.from('league_members').insert({ league_id: leagueId, user_id: userId })
    setBusy(false)
    if (error) toast.error(error.message)
    else { toast.success('League membership updated'); await onChanged() }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <SectionHeader title="Assign a user to leagues" sub="Pick a user, then tick the leagues they belong to. Users can be in several leagues at once." />
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="w-full sm:w-72 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp focus:outline-none focus:border-primary"
      >
        <option value="">Select a user…</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.username ?? p.id}</option>)}
      </select>

      {userId && (
        <div className="space-y-1.5">
          {leagues.map((l) => {
            const isMember = l.memberIds.includes(userId)
            return (
              <button
                key={l.id}
                onClick={() => toggle(l.id, isMember)}
                disabled={busy}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${isMember ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-surface hover:border-texts/40'}`}
              >
                <span className={`w-4 h-4 rounded grid place-items-center text-[10px] font-black shrink-0 ${isMember ? 'bg-primary text-[#04210F]' : 'border border-border'}`}>{isMember ? '✓' : ''}</span>
                <span className="flex-1 text-[13px] font-semibold text-textp truncate">{l.name}</span>
                <LeagueBadge name={l.league_labels?.name} color={l.league_labels?.color} money={l.prize_pool} />
              </button>
            )
          })}
          {leagues.length === 0 && <p className="text-[13px] text-texts">No leagues yet.</p>}
        </div>
      )}
    </div>
  )
}

function LabelManager({ labels, onChanged }: { labels: LabelRow[]; onChanged: () => Promise<void> | void }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#22C55E')

  async function create() {
    if (!name.trim()) return
    const { error } = await supabase.from('league_labels').insert({ name: name.trim(), color })
    if (error) toast.error(error.message)
    else { toast.success('Label created'); setName(''); await onChanged() }
  }
  async function del(id: string) {
    const { error } = await supabase.from('league_labels').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Label deleted'); await onChanged() }
  }

  return (
    <div className="mt-3">
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-bold text-primary hover:underline">
        {open ? 'Hide labels' : `Manage labels (${labels.length})`}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-xl border border-border bg-surface/40 space-y-3">
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1">
                <LeagueBadge name={l.name} color={l.color} />
                <button onClick={() => del(l.id)} className="text-texts hover:text-error text-xs" title="Delete label">✕</button>
              </span>
            ))}
            {labels.length === 0 && <span className="text-[12px] text-texts">No labels yet — create one below.</span>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label name (e.g. Elite)"
              className="flex-1 min-w-[140px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary" />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded-lg border border-border bg-surface cursor-pointer" title="Label colour" />
            <Button size="sm" variant="surface" onClick={create} disabled={!name.trim()}>Add label</Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface BracketRow { champion: string | null; runner_up: string | null; semi: string[]; quarter: string[] }

function BracketResultsEditor() {
  const supabase = useMemo(() => createClient(), [])
  const [champion, setChampion] = useState<string | null>(null)
  const [runnerUp, setRunnerUp] = useState<string | null>(null)
  const [semi, setSemi] = useState<string[]>([])
  const [quarter, setQuarter] = useState<string[]>([])
  const [loadingBR, setLoadingBR] = useState(true)
  const [saving, setSaving] = useState(false)

  const allTeams = useMemo(
    () => Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  )

  useEffect(() => {
    supabase.from('bracket_results').select('champion, runner_up, semi, quarter').eq('id', 'wc2026').maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as BracketRow
          setChampion(d.champion ?? null)
          setRunnerUp(d.runner_up ?? null)
          setSemi(d.semi ?? [])
          setQuarter(d.quarter ?? [])
        }
        setLoadingBR(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('bracket_results').upsert({
      id: 'wc2026', champion, runner_up: runnerUp, semi, quarter,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    })
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Bracket results saved — correctness badges now appear on the bracket page')
  }

  function toggle(list: string[], set: (v: string[]) => void, code: string, max: number) {
    set(list.includes(code) ? list.filter((c) => c !== code) : list.length < max ? [...list, code] : list)
  }

  const selectCls = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp focus:outline-none focus:border-primary'

  if (loadingBR) return <Skeleton className="h-28 rounded-xl" />

  return (
    <Card className="p-4">
      <SectionHeader title="Bracket results" sub="Set the real knockout results so correctness badges show on users' bracket pages." />
      <div className="mt-3 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">Champion</label>
            <select value={champion ?? ''} onChange={(e) => setChampion(e.target.value || null)} className={selectCls}>
              <option value="">— Not yet —</option>
              {allTeams.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">Runner-up</label>
            <select value={runnerUp ?? ''} onChange={(e) => setRunnerUp(e.target.value || null)} className={selectCls}>
              <option value="">— Not yet —</option>
              {allTeams.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-2">
            Semi-finalists <span className="normal-case font-normal text-texts/60">({semi.length}/4 selected)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {allTeams.map((t) => {
              const active = semi.includes(t.code)
              return (
                <button
                  key={t.code}
                  onClick={() => toggle(semi, setSemi, t.code, 4)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11.5px] font-bold transition-all ${active ? 'border-primary bg-primary/12 text-primary' : 'border-border text-texts hover:border-texts/40'}`}
                >
                  <FlagChip code={t.code} w={16} h={11} r={2} />{t.code}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-2">
            Quarter-finalists <span className="normal-case font-normal text-texts/60">({quarter.length}/8 selected)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {allTeams.map((t) => {
              const active = quarter.includes(t.code)
              return (
                <button
                  key={t.code}
                  onClick={() => toggle(quarter, setQuarter, t.code, 8)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11.5px] font-bold transition-all ${active ? 'border-gold bg-gold/10 text-gold' : 'border-border text-texts hover:border-texts/40'}`}
                >
                  <FlagChip code={t.code} w={16} h={11} r={2} />{t.code}
                </button>
              )
            })}
          </div>
        </div>

        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save bracket results'}</Button>
      </div>
    </Card>
  )
}

function LeagueAdmin() {
  const supabase = createClient()
  const [leagues, setLeagues] = useState<LeagueAdminRow[]>([])
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [labels, setLabels] = useState<LabelRow[]>([])
  const [name, setName] = useState('')
  const [prizePool, setPrizePool] = useState(false)
  const [labelId, setLabelId] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)   // scoring editor
  const [managing, setManaging] = useState<string | null>(null) // manage panel
  const [assignOpen, setAssignOpen] = useState(false)           // per-user assignment

  async function load() {
    const [{ data: ls }, { data: ms }, { data: ps }, { data: lbs }, { data: bs }] = await Promise.all([
      supabase.rpc('get_admin_leagues'),
      supabase.from('league_members').select('league_id, user_id'),
      supabase.from('profiles').select('id, username').order('username'),
      supabase.from('league_labels').select('id, name, color').order('name'),
      supabase.from('league_banners').select('league_id'),
    ])
    const byLeague = new Map<string, string[]>()
    for (const m of (ms ?? []) as { league_id: string; user_id: string }[]) {
      const arr = byLeague.get(m.league_id) ?? []; arr.push(m.user_id); byLeague.set(m.league_id, arr)
    }
    const bannerCounts = new Map<string, number>()
    for (const b of (bs ?? []) as { league_id: string }[]) bannerCounts.set(b.league_id, (bannerCounts.get(b.league_id) ?? 0) + 1)
    setProfiles((ps ?? []) as AdminProfile[])
    setLabels((lbs ?? []) as LabelRow[])
    setLeagues(((ls ?? []) as LeagueAdminRaw[]).map(({ label_name, label_color, ...l }) => ({
      ...l,
      league_labels: label_name && label_color ? { name: label_name, color: label_color } : null,
      memberIds: byLeague.get(l.id) ?? [],
      bannerCount: bannerCounts.get(l.id) ?? 0,
    })))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create() {
    if (!name.trim()) { toast.error('Name required'); return }
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode()
      const { error } = await supabase.from('leagues').insert({
        name: name.trim(), join_code: code, created_by: user?.id ?? null,
        type: prizePool ? 'money' : 'points', prize_pool: prizePool,
        label_id: labelId || null,
      })
      if (!error) { setName(''); toast.success(`League “${name.trim()}” created · code ${code}`); await load(); break }
      if (!error.message.toLowerCase().includes('duplicate')) { toast.error(error.message); break }
    }
    setBusy(false)
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="League management" sub="Create leagues, tune scoring, manage members, and control banners." />
        <Button size="sm" variant={assignOpen ? 'primary' : 'outline'} onClick={() => setAssignOpen((o) => !o)} className="shrink-0">Assign users</Button>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts">Leagues</p>
          <p className="text-xl font-extrabold tabular-nums text-textp">{leagues.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts">Members</p>
          <p className="text-xl font-extrabold tabular-nums text-textp">{leagues.reduce((s, l) => s + l.memberIds.length, 0)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-texts">Banners</p>
          <p className="text-xl font-extrabold tabular-nums text-textp">{leagues.reduce((s, l) => s + l.bannerCount, 0)}</p>
        </div>
      </div>

      {assignOpen && <UserLeagueAssign leagues={leagues} profiles={profiles} onChanged={load} />}

      <LabelManager labels={labels} onChanged={load} />

      <div className="flex flex-wrap items-end gap-2 mt-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">League name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office League"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">Label</label>
          <select value={labelId} onChange={(e) => setLabelId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp focus:outline-none focus:border-primary">
            <option value="">No label</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <Button size="sm" variant={prizePool ? 'gold' : 'surface'} onClick={() => setPrizePool((p) => !p)}>Prize pool: {prizePool ? 'On' : 'Off'}</Button>
        <Button size="sm" variant="primary" onClick={create} disabled={busy || !name.trim()}>{busy ? '…' : 'Create'}</Button>
      </div>
      <div className="mt-4 space-y-2">
        {leagues.map((l) => (
          <div key={l.id} className="rounded-xl border border-border bg-surface/45 p-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <LeagueBadge name={l.league_labels?.name} color={l.league_labels?.color} money={l.prize_pool} />
              <span className="flex-1 min-w-[120px] font-bold text-sm text-textp truncate">{l.name}</span>
              {!l.bracket_enabled && <Pill tone="default">Bracket off</Pill>}
              {l.reveal_predictions && <Pill tone="blue">Reveal on</Pill>}
              {l.banners_enabled && <Pill tone="green">{l.bannerCount} banner{l.bannerCount !== 1 ? 's' : ''}</Pill>}
              <span className="text-[11px] text-texts font-medium">{l.memberIds.length} member{l.memberIds.length !== 1 ? 's' : ''}</span>
              <span className="font-mono text-[13px] font-extrabold tracking-widest text-textp bg-surface border border-border rounded px-2 py-0.5">{l.join_code}</span>
              <Button size="sm" variant="ghost" onClick={() => { setManaging(managing === l.id ? null : l.id); setEditing(null) }}>
                {managing === l.id ? 'Hide' : 'Manage'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(editing === l.id ? null : l.id); setManaging(null) }}>
                {editing === l.id ? 'Hide' : 'Scoring'}
              </Button>
            </div>
            {managing === l.id && <LeagueManage league={l} leagues={leagues} profiles={profiles} labels={labels} onChanged={load} />}
            {editing === l.id && <ScoringEditor league={l} onClose={() => setEditing(null)} />}
          </div>
        ))}
        {leagues.length === 0 && <p className="text-sm text-texts py-3">No leagues yet — create one above.</p>}
      </div>
    </Card>
  )
}

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [matches, setMatches] = useState<Match[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [batchSaving, setBatchSaving] = useState(false)
  const rowHandles = useRef(new Map<string, AdminRowHandle>())

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
        if (!profile?.is_admin) { router.replace('/dashboard'); return }
        const { data, error } = await supabase
          .from('matches')
          .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, first_goal_team, first_goal_player_id, match_winner, home_formation, away_formation, home_formation_override, away_formation_override, rounds(name)')
          .order('match_date')
        if (error) throw error
        setMatches((data ?? []) as unknown as Match[])
      } catch (e) {
        toast.error(`Failed to load: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => matches.filter((m) => {
    const done = m.real_home_score !== null
    return filter === 'all' ? true : filter === 'done' ? done : !done
  }), [matches, filter])

  async function saveAll() {
    const pending = filtered.filter((m) => m.real_home_score === null)
    if (pending.length === 0) { toast.info('No pending matches to batch-save'); return }
    setBatchSaving(true)
    for (const m of pending) {
      const handle = rowHandles.current.get(m.id)
      if (handle) await handle.save()
    }
    setBatchSaving(false)
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-9 w-40" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>

  const pendingCount = filtered.filter((m) => m.real_home_score === null).length

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Admin console" sub="League setup, results entry, and tournament actions." />
      <LeagueAdmin />
      <FifaSyncDashboard />
      <AdminActions />
      <div className="flex items-center justify-between gap-3">
        <SectionHeader title="Results entry" sub="Saving a result locks the match and recalculates points." />
        {filter !== 'done' && pendingCount > 0 && (
          <Button size="sm" variant="outline" onClick={saveAll} disabled={batchSaving} className="shrink-0">
            {batchSaving ? 'Saving…' : `Save all ${pendingCount}`}
          </Button>
        )}
      </div>
      <QuickImport matches={matches} onDone={(updated) => setMatches(updated)} />
      <ChipRow chips={[{ key: 'pending', label: 'Pending' }, { key: 'done', label: 'Scored' }, { key: 'all', label: 'All' }]} value={filter} onChange={setFilter} />
      <div className="space-y-2.5">
        {filtered.map((m) => (
          <AdminRow
            key={m.id}
            ref={(handle) => { if (handle) rowHandles.current.set(m.id, handle); else rowHandles.current.delete(m.id) }}
            m={m}
            onSaved={(nm) => setMatches((prev) => prev.map((x) => x.id === nm.id ? nm : x))}
          />
        ))}
      </div>
      <BracketResultsEditor />
    </div>
  )
}
