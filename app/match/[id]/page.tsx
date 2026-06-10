'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import {
  Card, Pill, Button, ScoreStepper, SectionHeader, Avatar, Skeleton,
  LockIcon, Countdown, EmptyState,
} from '@/components/ui'
import { ScoreDisplay } from '@/components/football'
import { type DBMatch } from '@/lib/match-ui'
import { POINTS } from '@/lib/scoring'
import { PlayerCardPicker, type PlayerForPicker } from '@/components/PlayerCardPicker'

interface OtherPred {
  user_id: string
  pred_home: number
  pred_away: number
  pred_first_goal_team: string | null
  pred_first_scorer_id: number | null
  points_awarded: number | null
  profiles: { username: string; avatar_url: string | null } | null
}

export default function MatchDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [match, setMatch] = useState<DBMatch | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [h, setH] = useState<number | null>(null)
  const [a, setA] = useState<number | null>(null)
  const [firstTeam, setFirstTeam] = useState<string | null>(null)
  const [scorerId, setScorerId] = useState<number | null>(null)
  const [players, setPlayers] = useState<PlayerForPicker[]>([])
  const [others, setOthers] = useState<OtherPred[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const { data: m } = await supabase
        .from('matches')
        .select('*, rounds(name)')
        .eq('id', id)
        .single()
      if (!m) { setLoading(false); return }
      const dbm: DBMatch = { ...(m as DBMatch), round_name: (m as { rounds?: { name: string } }).rounds?.name ?? null }
      setMatch(dbm)

      const home = getTeam(dbm.home_team), away = getTeam(dbm.away_team)
      const { data: pl } = await supabase
        .from('players')
        .select('id, name, team_name, jersey_number')
        .in('team_name', [home.playerKey, away.playerKey])
        .order('jersey_number', { ascending: true, nullsFirst: false })
      setPlayers((pl ?? []).map((p) => {
        const code = (p as { team_name: string }).team_name === home.playerKey ? dbm.home_team : dbm.away_team
        return {
          id: (p as { id: number }).id,
          name: (p as { name: string }).name,
          team_code: code,
          jersey_number: (p as { jersey_number: number | null }).jersey_number,
        }
      }))

      const { data: mine } = await supabase
        .from('predictions')
        .select('pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id')
        .eq('user_id', user.id).eq('match_id', id).maybeSingle()
      if (mine) {
        const p = mine as Record<string, unknown>
        setH(p.pred_home as number); setA(p.pred_away as number)
        setFirstTeam((p.pred_first_goal_team as string) ?? null)
        setScorerId((p.pred_first_scorer_id as number) ?? null)
      }

      const kickedOff = dbm.is_locked || new Date(dbm.match_date) <= new Date()
      if (kickedOff) {
        const { data: o } = await supabase
          .from('predictions')
          .select('user_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, points_awarded, profiles(username, avatar_url)')
          .eq('match_id', id)
        setOthers((o ?? []) as unknown as OtherPred[])
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-8 w-32" /><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
  }
  if (!match) return <EmptyState title="Match not found" desc="This fixture doesn't exist." />

  const home = getTeam(match.home_team), away = getTeam(match.away_team)
  const scored = match.real_home_score !== null && match.real_away_score !== null
  const locked = scored || match.is_locked || new Date(match.match_date) <= new Date()
  const knockout = !match.group_name
  const canSubmit = h != null && a != null && !locked

  async function submit() {
    if (!userId || h == null || a == null) return
    setSaving(true)
    await supabase.from('predictions').upsert({
      user_id: userId, match_id: id,
      pred_home: h, pred_away: a,
      pred_first_goal_team: firstTeam,
      pred_first_scorer_id: scorerId,
    }, { onConflict: 'user_id,match_id' })
    setSaving(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={() => router.back()} className="text-sm font-bold text-texts hover:text-textp flex items-center gap-1">← Back</button>

      {/* header */}
      <Card glow={!locked} className="p-5 sm:p-6">
        <div className="flex items-center justify-center gap-2 mb-5">
          <Pill tone={knockout ? 'gold' : 'default'}>{knockout ? (match.round_name ?? 'Knockout') : `Group ${match.group_name ?? ''}`.trim()}</Pill>
          {scored && <Pill tone="green">Final</Pill>}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 flex flex-col items-center gap-2.5">
            <span className="text-[56px] leading-none">{home.flag}</span>
            <span className="font-extrabold text-textp text-center leading-tight">{home.name}</span>
          </div>
          <div className="px-3 text-center shrink-0">
            {scored
              ? <ScoreDisplay a={match.real_home_score} b={match.real_away_score} size="text-4xl" />
              : <div className="text-3xl font-black text-texts">VS</div>}
            <div className="text-[11px] text-texts font-bold mt-1.5">{fmtDateTime(match.match_date)}</div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2.5">
            <span className="text-[56px] leading-none">{away.flag}</span>
            <span className="font-extrabold text-textp text-center leading-tight">{away.name}</span>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-center gap-2 text-sm">
          {locked
            ? <span className="flex items-center gap-1.5 text-error font-bold"><LockIcon size={14} /> Predictions locked</span>
            : <span className="flex items-center gap-1.5 font-semibold text-texts"><LockIcon size={14} className="text-gold" /> Locks in <Countdown kickoff={match.match_date} /></span>}
        </div>
      </Card>

      {/* prediction entry */}
      {!locked && (
        <Card className="p-5 sm:p-6">
          <SectionHeader title="Your prediction" sub="Set the exact scoreline. Bonus points for first goal & scorer." />

          <div className="flex items-center justify-center gap-4 sm:gap-7 py-3">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[34px] leading-none">{home.flag}</span>
              <ScoreStepper value={h} onChange={setH} />
            </div>
            <span className="text-2xl font-black text-texts mt-7">:</span>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[34px] leading-none">{away.flag}</span>
              <ScoreStepper value={a} onChange={setA} />
            </div>
          </div>

          {/* auto-derived scoring categories preview */}
          {h != null && a != null && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label: 'Total goals', value: String(h + a), sub: `+${POINTS.totalGoals} if match = ${h + a}` },
                { label: 'Both score', value: h > 0 && a > 0 ? 'Yes' : 'No', sub: `+${POINTS.btts} if correct` },
                { label: 'Goal diff', value: h === a ? '0' : h > a ? `+${h - a}` : `−${a - h}`, sub: `+${POINTS.goalDiff} if correct` },
              ].map((s) => (
                <div key={s.label} className="text-center py-2.5 rounded-xl bg-surface border border-border/60">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-texts">{s.label}</p>
                  <p className="text-base font-extrabold tabular-nums text-textp mt-0.5">{s.value}</p>
                  <p className="text-[9px] text-texts mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* first goal team */}
          <div className="mt-5">
            <label className="text-xs font-bold uppercase tracking-wider text-texts">First goal <span className="text-primary normal-case">+{POINTS.firstTeam}</span></label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[{ k: match.home_team, l: home.code }, { k: 'NONE', l: 'No goal' }, { k: match.away_team, l: away.code }].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setFirstTeam(firstTeam === o.k ? null : o.k)}
                  className={`h-11 rounded-xl border font-bold text-sm transition-all ${firstTeam === o.k ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-surface text-texts hover:text-textp'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* first scorer — FIFA card picker */}
          <div className="mt-5">
            <PlayerCardPicker
              players={players}
              value={scorerId}
              onChange={setScorerId}
              pts={POINTS.firstScorer}
            />
          </div>

          <Button variant={justSaved ? 'gold' : 'primary'} size="lg" className="w-full mt-6" disabled={!canSubmit || saving} onClick={submit}>
            {justSaved ? '✓ Prediction saved!' : saving ? 'Saving…' : h != null && a != null ? `Lock in ${home.code} ${h}–${a} ${away.code}` : 'Set a scoreline first'}
          </Button>
        </Card>
      )}

      {/* league predictions */}
      <Card className="p-5">
        <SectionHeader title="League predictions" sub={locked ? 'Revealed — picks are in.' : 'Hidden until kickoff to keep it fair.'} />
        {!locked ? (
          <div className="relative">
            <div className="grid sm:grid-cols-2 gap-2 blur-sm select-none pointer-events-none opacity-60">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-surface">
                  <Avatar name="?" size={28} /><span className="font-bold text-sm flex-1">Player {i + 1}</span><span className="font-extrabold tabular-nums">2–1</span>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 grid place-items-center"><Pill tone="default" icon={<LockIcon size={12} />}>Unlocks at kickoff</Pill></div>
          </div>
        ) : others.length === 0 ? (
          <EmptyState icon={<LockIcon size={22} />} title="No picks yet" desc="Predictions will show here once they're in." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {others.map((pk) => {
              const correct = scored && pk.pred_home === match.real_home_score && pk.pred_away === match.real_away_score
              const you = pk.user_id === userId
              const scorerName = pk.pred_first_scorer_id ? players.find((p) => p.id === pk.pred_first_scorer_id)?.name : null
              const fgtLabel = pk.pred_first_goal_team === match.home_team ? home.code : pk.pred_first_goal_team === match.away_team ? away.code : pk.pred_first_goal_team === 'NONE' ? '–' : null
              return (
                <div key={pk.user_id} className={`p-2.5 rounded-lg border ${you ? 'bg-blue/[0.07] border-blue/30' : 'bg-surface border-border'}`}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={pk.profiles?.username ?? '?'} src={pk.profiles?.avatar_url} size={30} you={you} />
                    <span className="font-bold text-sm flex-1 truncate">{pk.profiles?.username ?? '?'}{you && ' (you)'}</span>
                    <span className={`font-extrabold tabular-nums ${correct ? 'text-primary' : 'text-textp'}`}>{pk.pred_home}–{pk.pred_away}</span>
                    {pk.points_awarded != null && <Pill tone={pk.points_awarded >= 6 ? 'green' : pk.points_awarded > 0 ? 'gold' : 'red'} className="!px-2 tabular-nums">+{pk.points_awarded}</Pill>}
                  </div>
                  {(fgtLabel || scorerName) && (
                    <div className="flex items-center gap-3 mt-1.5 pl-9 text-[11px] text-texts font-medium">
                      {fgtLabel && <span>⚡ {fgtLabel}</span>}
                      {scorerName && <span>⚽ {scorerName}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false }).format(new Date(iso))
}
