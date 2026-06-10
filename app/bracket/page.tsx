'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam, TEAMS } from '@/lib/teams'
import MatchModal, { type ModalMatch } from '@/components/MatchModal'
import { PageHeader, Card, Tabs, Skeleton, EmptyState, TreeIcon, Pill, Button, SectionHeader, SearchIcon } from '@/components/ui'
import { TOURNAMENT_POINTS } from '@/lib/scoring'

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  round_id?: string
  rounds: { name: string; order: number }
}

interface TournamentPick {
  champion: string | null
  runner_up: string | null
  semi: string[]
  quarter: string[]
  pts_champion: number | null
  pts_runner_up: number | null
  pts_semi: number | null
  pts_quarter: number | null
}

const ROUND_IDS = {
  R32: '00000000-0000-0000-0000-000000000002',
  R16: '00000000-0000-0000-0000-000000000003',
  QF: '00000000-0000-0000-0000-000000000004',
  SF: '00000000-0000-0000-0000-000000000005',
  BF: '00000000-0000-0000-0000-000000000006',
  FIN: '00000000-0000-0000-0000-000000000007',
}

const ALL_TEAMS = Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name))

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false }).format(new Date(iso))
}

function winner(m: Match): string | null {
  if (m.real_home_score === null || m.real_away_score === null) return null
  if (m.real_home_score > m.real_away_score) return m.home_team
  if (m.real_away_score > m.real_home_score) return m.away_team
  return null
}

function BracketCard({ match, onClick }: { match: Match | undefined; onClick?: (m: Match) => void }) {
  if (!match) {
    return <div className="w-44 rounded-xl border-2 border-dashed border-border py-3 px-3 text-center"><p className="text-xs text-texts">TBD</p></div>
  }
  const isTBC = match.home_team === 'TBC'
  const w = winner(match)
  const hasScore = match.real_home_score !== null

  const Row = ({ code, score, win }: { code: string; score: number | null; win: boolean }) => {
    const t = getTeam(code)
    return (
      <div className={`flex items-center gap-2 px-2.5 py-2 ${win ? 'bg-primary/15' : ''}`}>
        <span className="text-base leading-none shrink-0">{isTBC ? '🏳️' : t.flag}</span>
        <span className={`text-xs font-bold flex-1 truncate ${win ? 'text-primary' : 'text-textp'}`}>{isTBC ? 'TBD' : t.name}</span>
        {hasScore && <span className={`text-xs font-extrabold tabular-nums ${win ? 'text-primary' : 'text-texts'}`}>{score}</span>}
      </div>
    )
  }

  return (
    <button onClick={() => onClick?.(match)} className="w-44 rounded-xl border border-border bg-card hover:border-texts/40 transition-all text-left overflow-hidden">
      <div className="bg-surface border-b border-border px-2.5 py-1"><p className="text-[10px] text-texts font-bold">{fmtDate(match.match_date)}</p></div>
      <Row code={match.home_team} score={match.real_home_score} win={w === match.home_team} />
      <div className="h-px bg-border/60" />
      <Row code={match.away_team} score={match.real_away_score} win={w === match.away_team} />
    </button>
  )
}

function RoundColumn({ label, matches, onSelect, highlight }: { label: string; matches: (Match | undefined)[]; onSelect: (m: Match) => void; highlight?: boolean }) {
  return (
    <div className="flex flex-col shrink-0">
      <div className={`text-center mb-3 px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-widest ${highlight ? 'bg-primary/15 text-primary' : 'bg-surface text-texts'}`}>{label}</div>
      <div className="flex flex-col gap-3 justify-around flex-1">
        {matches.map((m, i) => <BracketCard key={m?.id ?? i} match={m} onClick={onSelect} />)}
      </div>
    </div>
  )
}

/* ---------- team picker ---------- */
function TeamPicker({ value, onChange, exclude = [], placeholder = 'Pick a team…', disabled = false }: {
  value: string | null
  onChange: (code: string | null) => void
  exclude?: string[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const team = value ? getTeam(value) : null
  const options = useMemo(() => {
    const q = search.toLowerCase()
    return ALL_TEAMS.filter((t) => !exclude.includes(t.code) && (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)))
  }, [search, exclude])

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full h-10 px-3 rounded-lg border flex items-center gap-2 text-sm font-semibold transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed border-border bg-surface' : 'border-border bg-surface hover:border-texts/40 cursor-pointer'}
          ${value ? 'text-textp' : 'text-texts'}`}
      >
        {team ? <><span className="text-lg">{team.flag}</span><span className="flex-1 text-left">{team.name}</span></> : <span className="flex-1 text-left">{placeholder}</span>}
        {value && !disabled && <span onClick={(e) => { e.stopPropagation(); onChange(null) }} className="text-texts hover:text-error text-lg leading-none">×</span>}
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-border flex items-center gap-2">
            <SearchIcon className="text-texts shrink-0" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="flex-1 bg-transparent text-sm text-textp placeholder:text-texts outline-none" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {options.map((t) => (
              <button key={t.code} onClick={() => { onChange(t.code); setOpen(false); setSearch('') }}
                className="w-full px-3 h-10 flex items-center gap-2.5 hover:bg-surface text-left">
                <span className="text-lg">{t.flag}</span>
                <span className="text-sm font-semibold text-textp flex-1">{t.name}</span>
                <span className="text-xs text-texts">{t.code}</span>
                {value === t.code && <span className="text-primary">✓</span>}
              </button>
            ))}
            {options.length === 0 && <div className="px-3 py-4 text-sm text-texts text-center">No teams found</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- tournament picks tab ---------- */
function TournamentPicksTab({ userId, r32Locked }: { userId: string | null; r32Locked: boolean }) {
  const supabase = createClient()
  const [pick, setPick] = useState<TournamentPick>({ champion: null, runner_up: null, semi: [], quarter: [], pts_champion: null, pts_runner_up: null, pts_semi: null, pts_quarter: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    supabase.from('tournament_predictions').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as Record<string, unknown>
          setPick({
            champion: (d.champion as string) ?? null,
            runner_up: (d.runner_up as string) ?? null,
            semi: (d.semi as string[]) ?? [],
            quarter: (d.quarter as string[]) ?? [],
            pts_champion: (d.pts_champion as number) ?? null,
            pts_runner_up: (d.pts_runner_up as number) ?? null,
            pts_semi: (d.pts_semi as number) ?? null,
            pts_quarter: (d.pts_quarter as number) ?? null,
          })
        }
        setLoading(false)
      })
  }, [userId])

  async function save() {
    if (!userId) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('tournament_predictions').upsert(
      { user_id: userId, champion: pick.champion, runner_up: pick.runner_up, semi: pick.semi, quarter: pick.quarter, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    setSaving(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Tournament picks saved!' })
    setTimeout(() => setMsg(null), 3000)
  }

  const setSemi = (i: number, code: string | null) => setPick((p) => {
    const next = [...p.semi]
    if (code === null) next.splice(i, 1)
    else { next[i] = code }
    return { ...p, semi: next.filter(Boolean) }
  })

  const setQuarter = (i: number, code: string | null) => setPick((p) => {
    const next = [...p.quarter]
    if (code === null) next.splice(i, 1)
    else { next[i] = code }
    return { ...p, quarter: next.filter(Boolean) }
  })

  const allTaken = [pick.champion, pick.runner_up, ...pick.semi, ...pick.quarter].filter(Boolean) as string[]

  const scored = pick.pts_champion !== null || pick.pts_runner_up !== null || pick.pts_semi !== null || pick.pts_quarter !== null
  const totalEarned = (pick.pts_champion ?? 0) + (pick.pts_runner_up ?? 0) + (pick.pts_semi ?? 0) + (pick.pts_quarter ?? 0)

  if (loading) return <div className="space-y-3"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /></div>

  const stages = [
    { key: 'champion', label: 'Tournament Champion', pts: TOURNAMENT_POINTS.champion, count: 1 },
    { key: 'runner_up', label: 'Runner-Up', pts: TOURNAMENT_POINTS.runner_up, count: 1 },
    { key: 'semi', label: 'Semi-Finalists', pts: TOURNAMENT_POINTS.semi, count: 2 },
    { key: 'quarter', label: 'Quarter-Finalists', pts: TOURNAMENT_POINTS.quarter, count: 4 },
  ]

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionHeader
          title="Tournament Picks"
          sub={r32Locked ? 'Knockout has started — picks are locked.' : 'Pick the teams that go furthest. Locked when Round of 32 kicks off.'}
          action={scored ? <Pill tone="green">+{totalEarned} pts</Pill> : undefined}
        />

        <div className="space-y-5 mt-4">
          {/* Champion */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-texts">🏆 Champion <span className="text-gold normal-case">+{TOURNAMENT_POINTS.champion}</span></label>
              {pick.pts_champion !== null && <Pill tone={pick.pts_champion > 0 ? 'green' : 'red'}>+{pick.pts_champion}</Pill>}
            </div>
            <TeamPicker
              value={pick.champion}
              onChange={(c) => setPick((p) => ({ ...p, champion: c }))}
              exclude={allTaken.filter((t) => t !== pick.champion)}
              placeholder="Pick tournament winner…"
              disabled={r32Locked}
            />
          </div>

          {/* Runner-up */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-texts">🥈 Runner-Up <span className="text-blue normal-case">+{TOURNAMENT_POINTS.runner_up}</span></label>
              {pick.pts_runner_up !== null && <Pill tone={pick.pts_runner_up > 0 ? 'green' : 'red'}>+{pick.pts_runner_up}</Pill>}
            </div>
            <TeamPicker
              value={pick.runner_up}
              onChange={(c) => setPick((p) => ({ ...p, runner_up: c }))}
              exclude={allTaken.filter((t) => t !== pick.runner_up)}
              placeholder="Pick finalist…"
              disabled={r32Locked}
            />
          </div>

          {/* Semi-finalists */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-texts">🏅 Semi-Finalists <span className="text-primary normal-case">+{TOURNAMENT_POINTS.semi} each</span></label>
              {pick.pts_semi !== null && <Pill tone={pick.pts_semi > 0 ? 'green' : 'red'}>+{pick.pts_semi}</Pill>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((i) => (
                <TeamPicker key={i}
                  value={pick.semi[i] ?? null}
                  onChange={(c) => setSemi(i, c)}
                  exclude={allTaken.filter((t) => t !== pick.semi[i])}
                  placeholder={`Semi #${i + 1}…`}
                  disabled={r32Locked}
                />
              ))}
            </div>
          </div>

          {/* Quarter-finalists */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-texts">🎖 Quarter-Finalists <span className="text-texts normal-case">+{TOURNAMENT_POINTS.quarter} each</span></label>
              {pick.pts_quarter !== null && <Pill tone={pick.pts_quarter > 0 ? 'green' : 'red'}>+{pick.pts_quarter}</Pill>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <TeamPicker key={i}
                  value={pick.quarter[i] ?? null}
                  onChange={(c) => setQuarter(i, c)}
                  exclude={allTaken.filter((t) => t !== pick.quarter[i])}
                  placeholder={`Quarter #${i + 1}…`}
                  disabled={r32Locked}
                />
              ))}
            </div>
          </div>
        </div>

        {!r32Locked && (
          <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-border/60">
            {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-primary' : 'text-error'}`}>{msg.text}</span>}
            <Button onClick={save} disabled={saving || !userId}>
              {saving ? 'Saving…' : 'Save picks'}
            </Button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border/60">
          <p className="text-[11px] text-texts leading-relaxed">
            Max possible: Champion {TOURNAMENT_POINTS.champion} + Runner-up {TOURNAMENT_POINTS.runner_up} + 2× Semi {TOURNAMENT_POINTS.semi * 2} + 4× Quarter {TOURNAMENT_POINTS.quarter * 4} = <span className="font-bold text-textp">{TOURNAMENT_POINTS.champion + TOURNAMENT_POINTS.runner_up + TOURNAMENT_POINTS.semi * 2 + TOURNAMENT_POINTS.quarter * 4} pts</span>
          </p>
        </div>
      </Card>

      {/* scoring rules reference */}
      <Card className="p-4">
        <SectionHeader title="How tournament picks are scored" />
        <div className="space-y-2 mt-3">
          {stages.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-texts">{s.label}</span>
              <span className="text-sm font-extrabold tabular-nums text-primary">+{s.pts}{s.count > 1 ? ` × ${s.count}` : ''}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function BracketPageInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ModalMatch | null>(null)
  const [tab, setTab] = useState(searchParams.get('tab') === 'picks' ? 'picks' : 'bracket')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      const { data } = await supabase.from('matches').select('*, rounds(name, order)').in('round_id', Object.values(ROUND_IDS)).order('match_date', { ascending: true })
      setMatches((data ?? []) as unknown as Match[])
      setLoading(false)
    }
    load()
  }, [])

  const byId: Record<string, Match[]> = {}
  for (const m of matches) {
    const rid = (m as unknown as Record<string, string>).round_id
    ;(byId[rid] ||= []).push(m)
  }
  const r32 = byId[ROUND_IDS.R32] ?? [], r16 = byId[ROUND_IDS.R16] ?? [], qf = byId[ROUND_IDS.QF] ?? []
  const sf = byId[ROUND_IDS.SF] ?? [], bf = byId[ROUND_IDS.BF] ?? [], fin = byId[ROUND_IDS.FIN] ?? []
  const groupStageOver = r32.some((m) => m.home_team !== 'TBC')
  const r32Over = r16.some((m) => m.home_team !== 'TBC')
  const r16Over = qf.some((m) => m.home_team !== 'TBC')
  const qfOver = sf.some((m) => m.home_team !== 'TBC')
  const sfOver = fin.some((m) => m.home_team !== 'TBC')
  const r32Locked = r32.some((m) => m.is_locked || new Date(m.match_date) <= new Date())

  const openModal = (m: Match) => setSelected({ ...m, round_name: (m.rounds as { name: string })?.name ?? '' })

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-12 w-full" /><Skeleton className="h-96 rounded-xl" /></div>

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Knockout" title="Bracket" sub="Round of 32 onward · tap any match for details." />

      <Tabs
        tabs={[{ key: 'bracket', label: 'Bracket' }, { key: 'picks', label: 'My Tournament Picks' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'bracket' ? (
        !groupStageOver ? (
          <EmptyState icon={<TreeIcon size={22} />} title="Group stage still underway" desc="The bracket unlocks once the Round of 32 teams are confirmed." />
        ) : (
          <Card className="overflow-x-auto p-4">
            <div className="flex gap-6 min-w-max items-stretch">
              <RoundColumn label="Round of 32" matches={r32} onSelect={openModal} highlight={!r32Over} />
              <RoundColumn label="Round of 16" matches={r16} onSelect={openModal} highlight={r32Over && !r16Over} />
              <RoundColumn label="Quarter-Finals" matches={qf} onSelect={openModal} highlight={r16Over && !qfOver} />
              <RoundColumn label="Semi-Finals" matches={sf} onSelect={openModal} highlight={qfOver && !sfOver} />
              <div className="flex flex-col gap-6 shrink-0">
                <RoundColumn label="Final" matches={fin} onSelect={openModal} highlight={sfOver} />
                <RoundColumn label="3rd Place" matches={bf} onSelect={openModal} highlight={sfOver} />
              </div>
            </div>
          </Card>
        )
      ) : (
        <TournamentPicksTab userId={userId} r32Locked={r32Locked} />
      )}

      {selected && <MatchModal match={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

export default function BracketPage() {
  return (
    <Suspense fallback={<div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-12 w-full" /><Skeleton className="h-96 rounded-xl" /></div>}>
      <BracketPageInner />
    </Suspense>
  )
}
