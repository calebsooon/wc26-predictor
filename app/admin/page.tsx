'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import {
  PageHeader, Card, Button, Pill, ScoreStepper, ChipRow, Skeleton, ChevDown, SearchIcon, SectionHeader, LeagueBadge,
} from '@/components/ui'
import { WEIGHT_FIELDS, resolveWeights, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { fmtDateTime } from '@/lib/date-format'

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
  const [scoringFailed, setScoringFailed] = useState(false)

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

  async function scoreOnly() {
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
  }

  async function save() {
    if (h == null || a == null) { toast.error('Both scores required'); return }
    setSaving(true)
    setScoringFailed(false)
    const { error } = await supabase.from('matches').update({
      real_home_score: h, real_away_score: a, is_locked: true,
      first_goal_team: fgt, first_goal_player_id: scorerId,
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
  }

  const scorerName = scorerId === -1 ? 'Own goal' : (players.find((p) => p.id === scorerId)?.name ?? '')
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
        {hasScore && <Pill tone="green">{m.real_home_score}–{m.real_away_score}</Pill>}
        {scoringFailed && (
          <Button size="sm" variant="outline" onClick={scoreOnly} disabled={saving}>
            {saving ? '…' : 'Retry scoring'}
          </Button>
        )}
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & score'}</Button>
      </div>
    </Card>
  )
}

function AdminActions() {
  const [busy, setBusy] = useState<string | null>(null)

  async function call(key: string, label: string, url: string, body?: object) {
    setBusy(key)
    const tid = toast.loading(`Running: ${label}…`)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await res.json().catch(() => ({}))
      if (res.ok) toast.success(json.message ?? `${label} done`, { id: tid })
      else toast.error(json.error ?? 'Error', { id: tid })
    } catch (e) {
      toast.error(String(e), { id: tid })
    }
    setBusy(null)
  }

  const actions = [
    { key: 'fetch', label: 'Auto-fetch results', sub: 'Pull finished scores from football-data.org and auto-score predictions', url: '/api/fetch-results' },
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
          <span className="text-[11px] font-bold uppercase tracking-wider text-texts">Goal diff scoring</span>
          {(() => {
            const scoring = (typeof league.scoring === 'object' && league.scoring !== null) ? league.scoring as Record<string, unknown> : {}
            const disabled = !!scoring.disable_gd
            return (
              <Button size="sm" variant={disabled ? 'surface' : 'primary'} onClick={() => patch({ scoring: { ...scoring, disable_gd: !disabled } }, disabled ? 'Goal diff scoring enabled.' : 'Goal diff scoring disabled.')}>
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
              <img src={item.image_url} alt="" className="w-20 h-10 object-cover rounded-md shrink-0 bg-card" />
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
      supabase.from('leagues').select('id, name, type, join_code, scoring, bracket_enabled, reveal_predictions, prize_pool, banners_enabled, label_id, league_labels(name, color)').order('created_at'),
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
    setLeagues(((ls ?? []) as unknown as Omit<LeagueAdminRow, 'memberIds' | 'bannerCount'>[]).map((l) => ({
      ...l,
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

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
        if (!profile?.is_admin) { router.replace('/dashboard'); return }
        const { data, error } = await supabase
          .from('matches')
          .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name, first_goal_team, first_goal_player_id, match_winner, rounds(name)')
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

  if (loading) return <div className="space-y-3"><Skeleton className="h-9 w-40" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Admin console" sub="League setup, results entry, and tournament actions." />
      <LeagueAdmin />
      <AdminActions />
      <SectionHeader title="Results entry" sub="Saving a result locks the match and recalculates points." />
      <ChipRow chips={[{ key: 'pending', label: 'Pending' }, { key: 'done', label: 'Scored' }, { key: 'all', label: 'All' }]} value={filter} onChange={setFilter} />
      <div className="space-y-2.5">
        {filtered.map((m) => (
          <AdminRow key={m.id} m={m} onSaved={(nm) => setMatches((prev) => prev.map((x) => x.id === nm.id ? nm : x))} />
        ))}
      </div>
    </div>
  )
}
