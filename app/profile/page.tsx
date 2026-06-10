'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  PageHeader, Card, StatCard, Button, Avatar, ProgressBar, Skeleton, Pill, SectionHeader,
} from '@/components/ui'

interface Profile { id: string; username: string; avatar_url: string | null; is_admin: boolean }
interface ScoredPred {
  points_awarded: number
  pts_outcome: number | null; pts_exact: number | null; pts_goal_diff: number | null
  pts_total_goals: number | null; pts_btts: number | null; pts_first_team: number | null
  pts_first_scorer: number | null; pts_knockout: number | null
}

const CATEGORIES = [
  { key: 'pts_outcome', label: 'Outcome' },
  { key: 'pts_exact', label: 'Exact score' },
  { key: 'pts_goal_diff', label: 'Goal diff' },
  { key: 'pts_total_goals', label: 'Total goals' },
  { key: 'pts_btts', label: 'Both scored' },
  { key: 'pts_first_team', label: 'First goal' },
  { key: 'pts_first_scorer', label: 'First scorer' },
  { key: 'pts_knockout', label: 'Knockout' },
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
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('id, username, avatar_url, is_admin').eq('id', user.id).single()
      if (data) { const p = data as Profile; setProfile(p); setUsername(p.username ?? ''); setAvatarUrl(p.avatar_url ?? null) }

      const { data: mine } = await supabase
        .from('predictions')
        .select('points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_btts, pts_first_team, pts_first_scorer, pts_knockout')
        .eq('user_id', user.id).not('points_awarded', 'is', null)
      setPreds((mine ?? []) as unknown as ScoredPred[])

      const { data: all } = await supabase.from('predictions').select('user_id, points_awarded').not('points_awarded', 'is', null)
      const agg = new Map<string, number>()
      for (const r of (all ?? []) as { user_id: string; points_awarded: number }[]) agg.set(r.user_id, (agg.get(r.user_id) ?? 0) + r.points_awarded)
      const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1])
      setTotalPlayers(sorted.length)
      const idx = sorted.findIndex(([uid]) => uid === user.id)
      setRank(idx >= 0 ? idx + 1 : null)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    const scored = preds.length
    const totalPts = preds.reduce((s, p) => s + p.points_awarded, 0)
    const exact = preds.filter((p) => (p.pts_exact ?? 0) > 0).length
    const correctOutcome = preds.filter((p) => (p.pts_outcome ?? (p.points_awarded >= 3 ? 1 : 0)) > 0 || p.points_awarded >= 3).length
    const acc = scored ? Math.round((correctOutcome / scored) * 100) : 0
    const cats = CATEGORIES.map((c) => {
      const earned = preds.filter((p) => (p[c.key] ?? 0) > 0).length
      return { ...c, pct: scored ? Math.round((earned / scored) * 100) : 0, earned }
    })
    const ranked = [...cats].filter((c) => c.key !== 'pts_knockout').sort((a, b) => b.pct - a.pct)
    return { scored, totalPts, exact, acc, cats, best: ranked[0], worst: ranked[ranked.length - 1] }
  }, [preds])

  const badges = useMemo(() => {
    const c = (key: typeof CATEGORIES[number]['key']) => preds.filter((p) => (p[key] ?? 0) > 0).length
    return [
      { id: 'sniper', name: 'Scoreline Sniper', icon: '🎯', earned: stats.exact >= 5, hint: '5 exact scores' },
      { id: 'boot', name: 'Golden Boot Guru', icon: '⚽', earned: c('pts_first_scorer') >= 3, hint: '3 first scorers' },
      { id: 'brain', name: 'Bracket Brain', icon: '🧠', earned: c('pts_knockout') >= 4, hint: '4 knockout calls' },
      { id: 'genius', name: 'Group Stage Genius', icon: '📊', earned: stats.totalPts >= 100, hint: '100 points' },
      { id: 'merchant', name: 'Upset Merchant', icon: '💣', earned: stats.scored >= 20 && stats.acc >= 60, hint: '60% over 20 picks' },
      { id: 'fraud', name: 'Fraud Watch', icon: '🤡', earned: stats.scored >= 10 && stats.acc < 30, hint: 'Sub-30% accuracy' },
    ]
  }, [preds, stats])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !profile) return
    setUploading(true); setMsg(null)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { setMsg({ type: 'err', text: upErr.message }); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const busted = `${publicUrl}?t=${Date.now()}`
    const { error } = await supabase.from('profiles').update({ avatar_url: busted }).eq('id', profile.id)
    if (error) setMsg({ type: 'err', text: error.message })
    else { setAvatarUrl(busted); setMsg({ type: 'ok', text: 'Avatar updated!' }) }
    setUploading(false)
  }

  async function saveUsername() {
    if (!profile) return
    const t = username.trim(); if (!t) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('profiles').update({ username: t }).eq('id', profile.id)
    setSaving(false)
    setMsg(error ? { type: 'err', text: error.message } : { type: 'ok', text: 'Username saved!' })
  }

  async function logout() { await supabase.auth.signOut(); router.push('/login') }

  if (loading || !profile) return <div className="space-y-5"><Skeleton className="h-9 w-40" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-72 rounded-xl" /></div>

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
          {badges.map((b) => (
            <div key={b.id} className={`flex flex-col items-center text-center gap-2 p-4 rounded-xl border ${b.earned ? 'border-gold/30 bg-gold/[0.06]' : 'border-border bg-surface opacity-60'}`}>
              <div className={`text-2xl grid place-items-center w-11 h-11 rounded-lg ${b.earned ? 'bg-gold/10' : 'bg-card'}`}>{b.earned ? b.icon : '🔒'}</div>
              <span className="text-[11px] font-bold text-textp leading-tight">{b.name}</span>
              <span className="text-[10px] text-texts">{b.hint}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* settings */}
      <Card className="p-5">
        <SectionHeader title="Display name" />
        <div className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="Username"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary" />
          <Button onClick={saveUsername} disabled={saving || !username.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
        {msg && <p className={`mt-3 text-sm rounded-lg px-3 py-2 ${msg.type === 'ok' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>{msg.text}</p>}
      </Card>

      <Button variant="danger" className="w-full" onClick={logout}>Log out</Button>
    </div>
  )
}
