'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import {
  Card, Pill, Button, ScoreStepper, SectionHeader, Avatar, Skeleton,
  LockIcon, Countdown, EmptyState, ConfettiBurst, ChevDown,
} from '@/components/ui'
import { ScoreDisplay } from '@/components/football'
import { type DBMatch } from '@/lib/match-ui'
import { POINTS, weightedMatchPoints, DEFAULT_WEIGHTS, type ScoringWeights, type MatchBreakdown } from '@/lib/scoring'
import { getActiveLeague } from '@/lib/league'
import { PlayerCardPicker, type PlayerForPicker } from '@/components/PlayerCardPicker'
import { fmtDateTime } from '@/lib/date-format'

interface OtherPred extends MatchBreakdown {
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
  const [scorerId, setScorerId] = useState<number | 'none' | null>(null)
  const [predTotalGoals, setPredTotalGoals] = useState<number | null>(null)
  const [predGoalDiff, setPredGoalDiff] = useState<number | null>(null)
  const [predBtts, setPredBtts] = useState<boolean | null>(null)
  const [tgManual, setTgManual] = useState(false)
  const [gdManual, setGdManual] = useState(false)
  const [bttsManual, setBttsManual] = useState(false)
  const [players, setPlayers] = useState<PlayerForPicker[]>([])
  const [others, setOthers] = useState<OtherPred[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [revealPredictions, setRevealPredictions] = useState(false)
  const [confetti, setConfetti] = useState(0)
  const [expandedPicks, setExpandedPicks] = useState<Set<string>>(new Set())
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
        .select('id, name, team_name, jersey_number, position')
        .in('team_name', [home.playerKey, away.playerKey])
        .order('jersey_number', { ascending: true, nullsFirst: false })
      type PlRow = { id: number; name: string; team_name: string; jersey_number: number | null; position: string | null }
      setPlayers((pl ?? []).map((p) => {
        const { id, name, team_name, jersey_number, position } = p as PlRow
        return { id, name, jersey_number, position: position ?? null, team_code: team_name === home.playerKey ? dbm.home_team : dbm.away_team }
      }))

      const { data: mine } = await supabase
        .from('predictions')
        .select('pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, pred_total_goals, pred_goal_diff, pred_btts, pred_no_scorer')
        .eq('user_id', user.id).eq('match_id', id).maybeSingle()
      if (mine) {
        const p = mine as Record<string, unknown>
        setH(p.pred_home as number); setA(p.pred_away as number)
        setFirstTeam((p.pred_first_goal_team as string) ?? null)
        setScorerId(p.pred_no_scorer ? 'none' : ((p.pred_first_scorer_id as number) ?? null))
        if (p.pred_total_goals != null) { setPredTotalGoals(p.pred_total_goals as number); setTgManual(true) }
        if (p.pred_goal_diff != null) { setPredGoalDiff(p.pred_goal_diff as number); setGdManual(true) }
        if (p.pred_btts != null) { setPredBtts(p.pred_btts as boolean); setBttsManual(true) }
        // Celebrate an exact-score call
        if (dbm.real_home_score != null && dbm.real_home_score === p.pred_home && dbm.real_away_score === p.pred_away) {
          setConfetti((c) => c + 1)
        }
      }

      const { league, weights: w, memberIds } = await getActiveLeague(supabase, user.id)
      setWeights(w)
      setRevealPredictions(league?.reveal_predictions === true)

      // Fetch picks for this match scoped to league members.
      // Profiles fetched separately — the embedded join (profiles(username,avatar_url))
      // can fail silently on some Supabase plans, returning null data with no error shown.
      const predSelect = 'user_id, pred_home, pred_away, pred_first_goal_team, pred_first_scorer_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer'
      const predBase = supabase.from('predictions').select(predSelect).eq('match_id', id)
      const { data: predRows } = await (memberIds.length ? predBase.in('user_id', memberIds) : predBase)

      // Fetch profiles for the returned prediction owners
      const predUserIds = (predRows ?? []).map((p) => (p as { user_id: string }).user_id)
      const profileMap = new Map<string, { username: string; avatar_url: string | null }>()
      if (predUserIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', predUserIds)
        for (const pr of profs ?? []) {
          const row = pr as { id: string; username: string; avatar_url: string | null }
          profileMap.set(row.id, { username: row.username, avatar_url: row.avatar_url })
        }
      }

      setOthers((predRows ?? []).map((p) => ({
        ...p,
        profiles: profileMap.get((p as { user_id: string }).user_id) ?? null,
      })) as unknown as OtherPred[])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-sync derived values when score changes (unless user has manually overridden)
  useEffect(() => {
    if (!tgManual && h != null && a != null) setPredTotalGoals(h + a)
  }, [h, a, tgManual])

  useEffect(() => {
    if (!gdManual && h != null && a != null) setPredGoalDiff(h - a)
  }, [h, a, gdManual])

  useEffect(() => {
    if (!bttsManual && h != null && a != null) setPredBtts(h > 0 && a > 0)
  }, [h, a, bttsManual])

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
    const { error } = await supabase.from('predictions').upsert({
      user_id: userId, match_id: id,
      pred_home: h, pred_away: a,
      pred_first_goal_team: firstTeam,
      pred_first_scorer_id: typeof scorerId === 'number' ? scorerId : null,
      pred_no_scorer: scorerId === 'none',
      pred_total_goals: predTotalGoals,
      pred_goal_diff: predGoalDiff,
      pred_btts: bttsManual ? predBtts : null,
    }, { onConflict: 'user_id,match_id' })
    setSaving(false)
    if (error) { toast.error(`Couldn't save: ${error.message}`); return }
    toast.success(`Prediction locked in — ${home.code} ${h}–${a} ${away.code}`)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <ConfettiBurst trigger={confetti} />
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

          {/* scoring category overrides */}
          {h != null && a != null && (
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {/* Total Goals — editable */}
                <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border/60">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-texts">Total goals</p>
                  <ScoreStepper
                    value={predTotalGoals}
                    onChange={(v) => { setPredTotalGoals(v); setTgManual(v !== h + a) }}
                    compact min={0} max={30}
                  />
                  {tgManual && predTotalGoals !== h + a ? (
                    <button onClick={() => { setTgManual(false); setPredTotalGoals(h + a) }} className="text-[9px] text-primary">↺ Auto</button>
                  ) : (
                    <p className="text-[9px] text-texts">+{POINTS.totalGoals} if correct</p>
                  )}
                </div>
                {/* Both Score — editable hedge */}
                <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border/60">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-texts">Both score</p>
                  {(() => {
                    const derived = h > 0 && a > 0
                    const eff = bttsManual ? predBtts : derived
                    return (
                      <>
                        <div className="flex gap-1">
                          {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map((o) => (
                            <button
                              key={o.l}
                              onClick={() => { setPredBtts(o.v); setBttsManual(o.v !== derived) }}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all ${eff === o.v ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-card text-texts'}`}
                            >{o.l}</button>
                          ))}
                        </div>
                        {bttsManual && predBtts !== derived ? (
                          <button onClick={() => { setBttsManual(false); setPredBtts(derived) }} className="text-[9px] text-primary">↺ Auto</button>
                        ) : (
                          <p className="text-[9px] text-texts">+{POINTS.btts} if correct</p>
                        )}
                      </>
                    )
                  })()}
                </div>
                {/* Goal Diff — editable, supports negative */}
                <div className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-surface border border-border/60">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-texts">Goal diff</p>
                  <ScoreStepper
                    value={predGoalDiff}
                    onChange={(v) => { setPredGoalDiff(v); setGdManual(v !== h - a) }}
                    compact min={-20} max={20}
                  />
                  {gdManual && predGoalDiff !== h - a ? (
                    <button onClick={() => { setGdManual(false); setPredGoalDiff(h - a) }} className="text-[9px] text-primary">↺ Auto</button>
                  ) : (
                    <p className="text-[9px] text-texts">+{POINTS.goalDiff} if correct</p>
                  )}
                </div>
              </div>
              {((tgManual && predTotalGoals !== h + a) || (gdManual && predGoalDiff !== h - a) || (bttsManual && predBtts !== (h > 0 && a > 0))) && (
                <p className="text-[10px] text-gold text-center font-medium">Custom overrides active — earn pts even if your score is wrong</p>
              )}
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
        <SectionHeader title="League predictions" sub={locked ? 'Revealed — picks are in.' : revealPredictions ? 'Visible pre-game in this league.' : 'Hidden until kickoff to keep it fair.'} />
        {!locked && !revealPredictions ? (
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
              const pkPts = pk.points_awarded != null ? weightedMatchPoints(pk, weights) : null
              const scorerName = pk.pred_first_scorer_id ? players.find((p) => p.id === pk.pred_first_scorer_id)?.name : null
              const fgtLabel = pk.pred_first_goal_team === match.home_team ? home.code : pk.pred_first_goal_team === match.away_team ? away.code : pk.pred_first_goal_team === 'NONE' ? '–' : null
              const isExpanded = expandedPicks.has(pk.user_id)
              const hasBreakdown = pk.points_awarded != null
              const toggleExpand = () => setExpandedPicks((s) => {
                const next = new Set(s)
                if (next.has(pk.user_id)) next.delete(pk.user_id); else next.add(pk.user_id)
                return next
              })
              return (
                <div key={pk.user_id} className={`rounded-lg border overflow-hidden ${you ? 'bg-blue/[0.07] border-blue/30' : 'bg-surface border-border'}`}>
                  <button
                    className="w-full flex items-center gap-2.5 p-2.5 text-left"
                    onClick={hasBreakdown ? toggleExpand : undefined}
                  >
                    <Avatar name={pk.profiles?.username ?? '?'} src={pk.profiles?.avatar_url} size={30} you={you} />
                    <span className="font-bold text-sm flex-1 truncate">{pk.profiles?.username ?? '?'}{you && ' (you)'}</span>
                    <span className={`font-extrabold tabular-nums ${correct ? 'text-primary' : 'text-textp'}`}>{pk.pred_home}–{pk.pred_away}</span>
                    {pkPts != null && <Pill tone={pkPts >= 6 ? 'green' : pkPts > 0 ? 'gold' : 'red'} className="!px-2 tabular-nums">+{pkPts}</Pill>}
                    {hasBreakdown && <ChevDown size={12} className={`shrink-0 text-texts transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />}
                  </button>

                  {!isExpanded && (fgtLabel || scorerName) && (
                    <div className="flex items-center gap-3 pb-2 pl-[46px] pr-2.5 text-[11px] text-texts font-medium">
                      {fgtLabel && <span>⚡ {fgtLabel}</span>}
                      {scorerName && <span>⚽ {scorerName}</span>}
                    </div>
                  )}

                  {isExpanded && hasBreakdown && (
                    <div className="px-2.5 pb-2.5 border-t border-border/40">
                      <div className="grid grid-cols-4 gap-1 mt-2 sm:grid-cols-8">
                        {([
                          { label: 'Outcome', pts: pk.pts_outcome },
                          { label: 'Exact', pts: pk.pts_exact },
                          { label: 'Goal diff', pts: pk.pts_goal_diff },
                          { label: 'Tot goals', pts: pk.pts_total_goals },
                          { label: 'Tm goals', pts: pk.pts_team_goals },
                          { label: 'BTTS', pts: pk.pts_btts },
                          { label: '1st team', pts: pk.pts_first_team },
                          { label: '1st scorer', pts: pk.pts_first_scorer },
                        ] as { label: string; pts: number | null | undefined }[]).map(({ label, pts }) => (
                          <div key={label} className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-md bg-surface/60">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-texts text-center leading-tight">{label}</span>
                            <span className={`text-[11px] font-extrabold tabular-nums ${(pts ?? 0) > 0 ? 'text-primary' : 'text-texts/40'}`}>
                              {(pts ?? 0) > 0 ? `+${pts}` : '–'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {(fgtLabel || scorerName) && (
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-texts font-medium">
                          {fgtLabel && <span>⚡ {fgtLabel}</span>}
                          {scorerName && <span>⚽ {scorerName}</span>}
                        </div>
                      )}
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

