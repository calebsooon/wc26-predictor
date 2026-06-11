'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import {
  PageHeader, Card, Button, Pill, ScoreStepper, ChipRow, Skeleton, ChevDown, SearchIcon, SectionHeader,
} from '@/components/ui'
import { WEIGHT_FIELDS, resolveWeights, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'

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
  rounds: { name: string } | null
}

interface Player { id: number; name: string; team_code: string }

function AdminRow({ m, onSaved }: { m: Match; onSaved: (m: Match) => void }) {
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
  const [msg, setMsg] = useState<string | null>(null)

  const hasScore = m.real_home_score !== null && m.real_away_score !== null
  const isKnockout = !m.group_name

  async function expand() {
    const opening = !open
    setOpen(opening)
    if (opening && players.length === 0) {
      const { data } = await supabase.from('players').select('id, name, team_name').in('team_name', [home.playerKey, away.playerKey])
      setPlayers((data ?? []).map((p) => ({
        id: (p as { id: number }).id, name: (p as { name: string }).name,
        team_code: (p as { team_name: string }).team_name === home.playerKey ? m.home_team : m.away_team,
      })))
    }
  }

  async function save() {
    if (h == null || a == null) { setMsg('Both scores required'); return }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('matches').update({
      real_home_score: h, real_away_score: a, is_locked: true,
      first_goal_team: fgt, first_goal_player_id: scorerId,
      ...(isKnockout ? { match_winner: matchWinner } : {}),
    }).eq('id', m.id)
    if (error) { setMsg(error.message); setSaving(false); return }
    const res = await fetch('/api/score-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: m.id }) })
    setSaving(false)
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? 'Scoring failed'); return }
    onSaved({ ...m, real_home_score: h, real_away_score: a, is_locked: true, first_goal_team: fgt, first_goal_player_id: scorerId, match_winner: matchWinner })
    setMsg('Saved ✓')
  }

  const scorerName = players.find((p) => p.id === scorerId)?.name ?? ''
  const scorerOptions = players.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card className={`p-3 ${hasScore ? 'border-primary/30' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span>{home.flag}</span><span className="truncate">{home.name}</span>
            <span className="text-texts">v</span>
            <span>{away.flag}</span><span className="truncate">{away.name}</span>
          </div>
          <div className="text-[11px] text-texts mt-0.5">{fmt(m.match_date)} · {m.rounds?.name ?? '—'}</div>
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
                  {scorerOptions.map((o) => (
                    <button key={o.id} onClick={() => { setScorerId(o.id); setScorerOpen(false); setSearch('') }} className="w-full px-3 h-10 flex items-center gap-2 hover:bg-surface text-left">
                      <span>{getTeam(o.team_code).flag}</span><span className="text-sm text-textp flex-1">{o.name}</span>
                      {scorerId === o.id && <span className="text-primary">✓</span>}
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
                    <span>{o.t.flag}</span>{o.t.code}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        {msg && <span className={`text-xs ${msg.includes('✓') ? 'text-primary' : 'text-error'}`}>{msg}</span>}
        {hasScore && <Pill tone="green">{m.real_home_score}–{m.real_away_score}</Pill>}
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & score'}</Button>
      </div>
    </Card>
  )
}

function AdminActions() {
  const [busy, setBusy] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Record<string, string>>({})

  async function call(key: string, url: string, body?: object) {
    setBusy(key); setMsgs((m) => ({ ...m, [key]: '' }))
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await res.json().catch(() => ({}))
      setMsgs((m) => ({ ...m, [key]: res.ok ? JSON.stringify(json) : (json.error ?? 'Error') }))
    } catch (e) {
      setMsgs((m) => ({ ...m, [key]: String(e) }))
    }
    setBusy(null)
  }

  const actions = [
    { key: 'snapshot', label: 'Snapshot leaderboard', sub: 'Records current rank positions for movement arrows', url: '/api/snapshot-ranks' },
    { key: 'groups', label: 'Score group predictions', sub: 'Awards points for correct group order picks (all complete groups)', url: '/api/score-groups' },
    { key: 'tournament', label: 'Score tournament picks', sub: 'Awards points for champion / finalist / semi / quarter picks', url: '/api/score-tournament' },
    { key: 'rescore', label: 'Rescore all matches', sub: 'Recalculates every prediction for all scored matches (use after rule changes)', url: '/api/rescore-all' },
  ]

  return (
    <Card className="p-4">
      <SectionHeader title="Tournament actions" sub="Run these after results are in." />
      <div className="space-y-3 mt-3">
        {actions.map((a) => (
          <div key={a.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-textp truncate">{a.label}</p>
              <p className="text-[11px] text-texts truncate">{a.sub}</p>
              {msgs[a.key] && <p className="text-[11px] text-primary mt-0.5 font-mono truncate">{msgs[a.key]}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => call(a.key, a.url)} disabled={busy === a.key} className="shrink-0">
              {busy === a.key ? '…' : 'Run'}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

interface LeagueAdminRow { id: string; name: string; type: 'money' | 'points'; join_code: string; scoring: unknown; members: number }

function ScoringEditor({ league, onClose }: { league: LeagueAdminRow; onClose: () => void }) {
  const supabase = createClient()
  const [w, setW] = useState<ScoringWeights>(() => resolveWeights(league.scoring))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const groups = ['Match', 'Group', 'Tournament'] as const

  async function save() {
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('leagues').update({ scoring: w }).eq('id', league.id)
    setSaving(false)
    setMsg(error ? error.message : 'Saved — leaderboards recompute on next load.')
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
        {msg && <span className="text-[11px] text-primary font-medium">{msg}</span>}
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

function LeagueAdmin() {
  const supabase = createClient()
  const [leagues, setLeagues] = useState<LeagueAdminRow[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<'money' | 'points'>('points')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  async function load() {
    const [{ data: ls }, { data: ms }] = await Promise.all([
      supabase.from('leagues').select('id, name, type, join_code, scoring').order('created_at'),
      supabase.from('league_members').select('league_id'),
    ])
    const counts = new Map<string, number>()
    for (const m of (ms ?? []) as { league_id: string }[]) counts.set(m.league_id, (counts.get(m.league_id) ?? 0) + 1)
    setLeagues(((ls ?? []) as Omit<LeagueAdminRow, 'members'>[]).map((l) => ({ ...l, members: counts.get(l.id) ?? 0 })))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create() {
    if (!name.trim()) { setMsg('Name required'); return }
    setBusy(true); setMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    // Retry on the (rare) unique-code collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode()
      const { error } = await supabase.from('leagues').insert({ name: name.trim(), type, join_code: code, created_by: user?.id ?? null })
      if (!error) { setName(''); setMsg(`Created “${name.trim()}” · code ${code}`); await load(); break }
      if (!error.message.toLowerCase().includes('duplicate')) { setMsg(error.message); break }
    }
    setBusy(false)
  }

  return (
    <Card className="p-4">
      <SectionHeader title="Leagues" sub="Create leagues and share their join codes. Only the money league shows the prize pool." />
      <div className="flex flex-wrap items-end gap-2 mt-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-texts mb-1">League name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office League"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary" />
        </div>
        <ChipRow chips={[{ key: 'points', label: 'Points' }, { key: 'money', label: 'Money' }]} value={type} onChange={(v) => setType(v as 'money' | 'points')} />
        <Button size="sm" variant="primary" onClick={create} disabled={busy || !name.trim()}>{busy ? '…' : 'Create'}</Button>
      </div>
      {msg && <p className="text-[12px] text-primary mt-2 font-medium">{msg}</p>}

      <div className="mt-4 divide-y divide-border/60">
        {leagues.map((l) => (
          <div key={l.id} className="py-2.5">
            <div className="flex items-center gap-3">
              <Pill tone={l.type === 'money' ? 'gold' : 'green'}>{l.type === 'money' ? 'Money' : 'Points'}</Pill>
              <span className="flex-1 font-bold text-sm text-textp truncate">{l.name}</span>
              <span className="text-[11px] text-texts font-medium">{l.members} member{l.members !== 1 ? 's' : ''}</span>
              <span className="font-mono text-[13px] font-extrabold tracking-widest text-textp bg-surface border border-border rounded px-2 py-0.5">{l.join_code}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(editing === l.id ? null : l.id)}>
                {editing === l.id ? 'Hide' : 'Scoring'}
              </Button>
            </div>
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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }
      const { data } = await supabase
        .from('matches')
        .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, first_goal_team, first_goal_player_id, match_winner, rounds(name)')
        .order('match_date')
      setMatches((data ?? []) as unknown as Match[])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => matches.filter((m) => {
    const done = m.real_home_score !== null
    return filter === 'all' ? true : filter === 'done' ? done : !done
  }), [matches, filter])

  if (loading) return <div className="space-y-3"><Skeleton className="h-9 w-40" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Enter results" sub="Saving a result locks the match and recalculates points." />
      <LeagueAdmin />
      <AdminActions />
      <ChipRow chips={[{ key: 'pending', label: 'Pending' }, { key: 'done', label: 'Scored' }, { key: 'all', label: 'All' }]} value={filter} onChange={setFilter} />
      <div className="space-y-2.5">
        {filtered.map((m) => (
          <AdminRow key={m.id} m={m} onSaved={(nm) => setMatches((prev) => prev.map((x) => x.id === nm.id ? nm : x))} />
        ))}
      </div>
    </div>
  )
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false }).format(new Date(iso))
}
