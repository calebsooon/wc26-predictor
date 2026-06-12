'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { motion } from 'framer-motion'
import {
  PageHeader, Card, StatCard, Button, Avatar, ProgressBar, Skeleton, Pill, SectionHeader, EmptyState, TrophyIcon,
} from '@/components/ui'
import { getTeam } from '@/lib/teams'
import { weightedMatchPoints, weightedGroupPoints, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { getActiveLeague } from '@/lib/league'

interface Profile { id: string; username: string; avatar_url: string | null; is_admin: boolean }
interface TournamentPred {
  champion: string | null; runner_up: string | null; semi: string[]; quarter: string[]
  pts_champion: number | null; pts_runner_up: number | null; pts_semi: number | null; pts_quarter: number | null
}
interface GroupPred { group_name: string; ranked_codes: string[]; points_awarded: number | null }
interface ScoredPred {
  match_id: string
  points_awarded: number
  pred_home: number | null
  pred_away: number | null
  pts_outcome: number | null; pts_exact: number | null; pts_goal_diff: number | null
  pts_total_goals: number | null; pts_team_goals: number | null; pts_btts: number | null
  pts_first_team: number | null; pts_first_scorer: number | null
  match?: {
    id: string
    match_date: string
    home_team: string
    away_team: string
    real_home_score: number | null
    real_away_score: number | null
    group_name: string | null
    gw_number: number | null
  } | null
}

const CATEGORIES = [
  { key: 'pts_outcome', label: 'Outcome', weightKey: 'outcome' },
  { key: 'pts_exact', label: 'Exact score', weightKey: 'exact' },
  { key: 'pts_goal_diff', label: 'Goal diff', weightKey: 'goalDiff' },
  { key: 'pts_total_goals', label: 'Total goals', weightKey: 'totalGoals' },
  { key: 'pts_team_goals', label: "Team goals", weightKey: 'teamGoals' },
  { key: 'pts_btts', label: 'Both scored', weightKey: 'btts' },
  { key: 'pts_first_team', label: 'First goal', weightKey: 'firstTeam' },
  { key: 'pts_first_scorer', label: 'First scorer', weightKey: 'firstScorer' },
] as const

export default function ProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [preds, setPreds] = useState<ScoredPred[]>([])
  const [rank, setRank] = useState<number | null>(null)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [tournamentPred, setTournamentPred] = useState<TournamentPred | null>(null)
  const [groupPreds, setGroupPreds] = useState<GroupPred[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data, error: profErr } = await supabase.from('profiles').select('id, username, avatar_url, is_admin').eq('id', user.id).single()
        if (profErr) throw profErr
        if (data) { const p = data as Profile; setProfile(p); setUsername(p.username ?? ''); setAvatarUrl(p.avatar_url ?? null) }

        const [{ data: mine }, { data: tp }, { data: gp }, leagueData] = await Promise.all([
          supabase.from('predictions').select('match_id, points_awarded, pred_home, pred_away, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, match:matches(id, match_date, home_team, away_team, real_home_score, real_away_score, group_name, gw_number)').eq('user_id', user.id).not('points_awarded', 'is', null),
          supabase.from('tournament_predictions').select('*').eq('user_id', user.id).eq('phase', 'pre').maybeSingle(),
          supabase.from('group_predictions').select('group_name, ranked_codes, points_awarded').eq('user_id', user.id).order('group_name'),
          getActiveLeague(supabase, user.id),
        ])
        setPreds((mine ?? []) as unknown as ScoredPred[])
        if (tp) setTournamentPred(tp as unknown as TournamentPred)
        if (gp) setGroupPreds(gp as GroupPred[])

        const { weights: w, memberIds } = leagueData
        setWeights(w)
        const ids = memberIds.length ? memberIds : [user.id]
        const { data: all } = await supabase
          .from('predictions')
          .select('user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer')
          .not('points_awarded', 'is', null)
          .in('user_id', ids)
        const agg = new Map<string, number>()
        for (const r of (all ?? []) as (ScoredPred & { user_id: string })[]) agg.set(r.user_id, (agg.get(r.user_id) ?? 0) + weightedMatchPoints(r, w))
        const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
        setTotalPlayers(ids.length)
        const idx = sorted.findIndex(([uid]) => uid === user.id)
        setRank(idx >= 0 ? idx + 1 : null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const scored = preds.length
    const totalPts = preds.reduce((s, p) => s + weightedMatchPoints(p, weights), 0)
    const exact = preds.filter((p) => (p.pts_exact ?? 0) > 0).length
    const correctOutcome = preds.filter((p) => (p.pts_outcome ?? (p.points_awarded >= 3 ? 1 : 0)) > 0 || p.points_awarded >= 3).length
    const acc = scored ? Math.round((correctOutcome / scored) * 100) : 0
    const activeCats = CATEGORIES.filter((c) => weights[c.weightKey] > 0)
    const cats = activeCats.map((c) => {
      const earned = preds.filter((p) => (p[c.key] ?? 0) > 0).length
      return { ...c, pct: scored ? Math.round((earned / scored) * 100) : 0, earned }
    })
    const ranked = [...cats].sort((a, b) => b.pct - a.pct)
    return { scored, totalPts, exact, acc, cats, best: ranked[0], worst: ranked[ranked.length - 1] }
  }, [preds, weights])

  const gwSeries = useMemo(() => {
    const map = new Map<number, number>()
    for (const p of preds) {
      const gw = p.match?.gw_number
      if (gw == null) continue
      map.set(gw, (map.get(gw) ?? 0) + p.points_awarded)
    }
    return Array.from({ length: 8 }, (_, i) => map.get(i + 1) ?? 0)
  }, [preds])

  const badges = useMemo(() => {
    const c = (key: typeof CATEGORIES[number]['key']) => preds.filter((p) => (p[key] ?? 0) > 0).length
    return [
      { id: 'sniper', name: 'Scoreline Sniper', icon: '🎯', earned: stats.exact >= 5, hint: '5 exact scores' },
      { id: 'boot', name: 'Golden Boot Guru', icon: '⚽', earned: c('pts_first_scorer') >= 3, hint: '3 first scorers' },
      { id: 'prophet', name: 'First Blood Prophet', icon: '🩸', earned: c('pts_first_team') >= 10, hint: '10 first-goal team calls' },
      { id: 'genius', name: 'Group Stage Genius', icon: '📊', earned: stats.totalPts >= 100, hint: '100 points' },
      { id: 'merchant', name: 'Upset Merchant', icon: '💣', earned: stats.scored >= 20 && stats.acc >= 60, hint: '60% over 20 picks' },
      { id: 'fraud', name: 'Fraud Watch', icon: '🤡', earned: stats.scored >= 10 && stats.acc < 30, hint: 'Sub-30% accuracy' },
    ]
  }, [preds, stats])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !profile) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const busted = `${publicUrl}?t=${Date.now()}`
    const { error } = await supabase.from('profiles').update({ avatar_url: busted }).eq('id', profile.id)
    if (error) { toast.error(`DB update failed: ${error.message}`); setUploading(false); return }
    setAvatarUrl(busted)
    toast.success('Avatar updated!')
    setUploading(false)
    // Refresh so AppShell refetches the new avatar_url for the sidebar / mobile header
    setTimeout(() => router.refresh(), 800)
  }

  async function saveUsername() {
    if (!profile) return
    const t = username.trim(); if (!t) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ username: t }).eq('id', profile.id)
    setSaving(false)
    if (error) toast.error(error.message); else toast.success('Username saved!')
  }

  async function logout() { await supabase.auth.signOut(); router.push('/login') }

  if (loading || !profile) {
    if (error) return (
      <div className="space-y-5">
        <div className="pb-4 border-b border-border"><h1 className="text-2xl font-black tracking-tight">Profile</h1></div>
        <EmptyState icon={<TrophyIcon size={22} />} title="Couldn't load profile" desc={error} />
      </div>
    )
    return <div className="space-y-5"><Skeleton className="h-9 w-40" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-72 rounded-xl" /></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your season"
        title={profile.username}
        sub={rank ? `Rank #${rank} of ${totalPlayers}` : 'No scored predictions yet'}
        action={profile.is_admin ? <Pill tone="gold">Admin</Pill> : undefined}
      />

      <div className="flex items-center gap-4">
        <Avatar name={profile.username} src={avatarUrl} size={64} />
        <div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Points" value={stats.totalPts} accent="green" />
        <StatCard label="Rank" value={rank ? `#${rank}` : '–'} accent="gold" />
        <StatCard label="Exact Scores" value={stats.exact} accent="blue" />
        <StatCard label="Outcome Accuracy" value={`${stats.acc}%`} sub={`${stats.scored} scored`} />
      </div>

      {/* GW sparkline */}
      {gwSeries.some((v) => v > 0) && (
        <Card className="p-5">
          <SectionHeader title="Points by gameweek" sub="Your scoring trend across all 8 gameweeks" />
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1 overflow-hidden">
              <Sparkline data={gwSeries} width={320} height={48} />
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-extrabold text-primary tabular-nums">{stats.totalPts}</p>
              <p className="text-[11px] text-texts font-medium">total pts</p>
            </div>
          </div>
          <div className="flex justify-between mt-2">
            {gwSeries.map((v, i) => (
              <div key={i} className="text-center">
                <p className="text-[10px] text-texts font-medium">GW{i + 1}</p>
                <p className="text-[11px] font-extrabold tabular-nums text-textp">{v > 0 ? `+${v}` : '–'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* category accuracy */}
      <Card className="p-5">
        <SectionHeader title="Accuracy by category" sub={stats.best ? `Strongest: ${stats.best.label} · Weakest: ${stats.worst?.label}` : 'Earn points to populate this.'} />
        <div className="space-y-3">
          {stats.cats.map((c) => {
            const isBest = c.label === stats.best?.label
            const isWorst = c.label === stats.worst?.label
            const color = isBest ? 'rgb(var(--primary))' : isWorst ? 'rgb(var(--error))' : 'rgb(var(--blue))'
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-textp whitespace-nowrap">{c.label}</span>
                  <span className="text-texts tabular-nums">{c.pct}%</span>
                </div>
                <ProgressBar pct={c.pct} color={color} height={7} />
              </div>
            )
          })}
        </div>
      </Card>

      {/* badges */}
      <Card className="p-5">
        <SectionHeader title="Badges" sub="Collectible achievements across the tournament." />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {badges.map((b, i) => (
            <motion.div
              key={b.id}
              initial={b.earned ? { scale: 0.7, opacity: 0 } : { opacity: 0.6 }}
              animate={b.earned ? { scale: 1, opacity: 1 } : { opacity: 0.6 }}
              transition={b.earned ? { type: 'spring', stiffness: 500, damping: 18, delay: i * 0.05 } : { duration: 0.2 }}
              className={`flex flex-col items-center text-center gap-2 p-4 rounded-xl border ${b.earned ? 'border-gold/30 bg-gold/[0.06]' : 'border-border bg-surface'}`}
            >
              <div className={`text-2xl grid place-items-center w-11 h-11 rounded-lg ${b.earned ? 'bg-gold/10' : 'bg-card'}`}>{b.earned ? b.icon : '🔒'}</div>
              <span className="text-[11px] font-bold text-textp leading-tight">{b.name}</span>
              <span className="text-[10px] text-texts">{b.hint}</span>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* per-match history */}
      {preds.filter((p) => p.match).length > 0 && (
        <Card className="p-5">
          <SectionHeader
            title="Match history"
            sub={`${preds.filter((p) => p.match).length} scored matches`}
          />
          <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
            {preds
              .filter((p) => p.match)
              .sort((a, b) => new Date(b.match!.match_date).getTime() - new Date(a.match!.match_date).getTime())
              .map((p) => {
                const m = p.match!
                const homeTeam = getTeam(m.home_team)
                const awayTeam = getTeam(m.away_team)
                const ptColor = p.points_awarded >= 8 ? 'text-primary' : p.points_awarded > 0 ? 'text-gold' : 'text-error'
                return (
                  <div key={p.match_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface border border-border/60">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-base leading-none">{homeTeam.flag}</span>
                      <span className="text-[11px] font-extrabold tabular-nums text-textp">{m.real_home_score}–{m.real_away_score}</span>
                      <span className="text-base leading-none">{awayTeam.flag}</span>
                    </div>
                    {p.pred_home != null && p.pred_away != null && (
                      <span className="text-[11px] text-texts font-medium">
                        you: <span className="tabular-nums font-bold">{p.pred_home}–{p.pred_away}</span>
                      </span>
                    )}
                    <span className={`text-[13px] font-extrabold tabular-nums shrink-0 ${ptColor}`}>
                      +{p.points_awarded}
                    </span>
                  </div>
                )
              })}
          </div>
        </Card>
      )}

      {/* tournament picks — for fun, no points */}
      <Card className="p-5">
        <SectionHeader title="Bracket game picks" sub="Your for-fun champion and finalist calls — no effect on points." />
        {!tournamentPred || (!tournamentPred.champion && !tournamentPred.runner_up && !tournamentPred.semi?.length && !tournamentPred.quarter?.length) ? (
          <EmptyState icon={<TrophyIcon size={20} />} title="No bracket picks" desc="Go to Bracket → Bracket Game to make your selections." />
        ) : (
          <div className="space-y-3 mt-3">
            {[
              { label: '🏆 Champion', value: tournamentPred.champion },
              { label: '🥈 Runner-Up', value: tournamentPred.runner_up },
            ].map((row) => row.value && (
              <div key={row.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface border border-border">
                <span className="text-lg">{getTeam(row.value).flag}</span>
                <div>
                  <p className="text-[11px] text-texts font-bold uppercase tracking-wider">{row.label}</p>
                  <p className="text-sm font-bold text-textp">{getTeam(row.value).name}</p>
                </div>
              </div>
            ))}
            {tournamentPred.semi?.length > 0 && (
              <div className="p-2.5 rounded-lg bg-surface border border-border">
                <p className="text-[11px] text-texts font-bold uppercase tracking-wider mb-2">🏅 Semi-Finalists</p>
                <div className="flex flex-wrap gap-2">
                  {tournamentPred.semi.map((code) => (
                    <div key={code} className="flex items-center gap-1.5 text-sm font-semibold">
                      <span>{getTeam(code).flag}</span><span>{getTeam(code).name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tournamentPred.quarter?.length > 0 && (
              <div className="p-2.5 rounded-lg bg-surface border border-border">
                <p className="text-[11px] text-texts font-bold uppercase tracking-wider mb-2">🎖 Quarter-Finalists</p>
                <div className="flex flex-wrap gap-2">
                  {tournamentPred.quarter.map((code) => (
                    <div key={code} className="flex items-center gap-1.5 text-sm font-semibold">
                      <span>{getTeam(code).flag}</span><span>{getTeam(code).name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* group predictions */}
      {groupPreds.length > 0 && (
        <Card className="p-5">
          <SectionHeader title="Group predictions" sub={`+${weights.groupPosition} pts per team in exact finishing position.`} />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
            {groupPreds.map((gp) => (
              <div key={gp.group_name} className={`p-2.5 rounded-lg border text-center ${gp.points_awarded != null ? (gp.points_awarded > 0 ? 'border-primary/30 bg-primary/[0.05]' : 'border-border bg-surface') : 'border-border bg-surface'}`}>
                <p className="text-xs font-extrabold text-texts mb-1">Group {gp.group_name}</p>
                <div className="flex justify-center gap-0.5 mb-1.5">
                  {(gp.ranked_codes ?? []).slice(0, 4).map((code) => (
                    <span key={code} className="text-sm">{getTeam(code).flag}</span>
                  ))}
                </div>
                {gp.points_awarded !== null ? (
                  <span className={`text-xs font-extrabold tabular-nums ${gp.points_awarded > 0 ? 'text-primary' : 'text-texts'}`}>+{weightedGroupPoints(gp.points_awarded, weights)}</span>
                ) : (
                  <span className="text-[10px] text-texts">pending</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* settings */}
      <Card className="p-5">
        <SectionHeader title="Display name" />
        <div className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="Username"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary" />
          <Button onClick={saveUsername} disabled={saving || !username.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </Card>

      <Button variant="danger" className="w-full" onClick={logout}>Log out</Button>
    </div>
  )
}

function Sparkline({ data, width = 200, height = 40, color = 'rgb(var(--primary))' }: {
  data: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pad = 4
  const w = width - pad * 2
  const h = height - pad * 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w
    const y = pad + h - ((v - min) / range) * h
    return `${x},${y}`
  })
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * w
        const y = pad + h - ((v - min) / range) * h
        return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
      })}
    </svg>
  )
}
