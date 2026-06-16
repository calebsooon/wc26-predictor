'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getMyLeagues, setActiveLeague, isMoneyLeague, type League } from '@/lib/league'
import { Card, Button, PageHeader, Skeleton, TrophyIcon, LeagueBadge } from '@/components/ui'

export default function JoinPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<League[]>([])
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function refresh(uid: string) {
    try {
      setLeagues(await getMyLeagues(supabase, uid))
    } catch {
      // non-fatal — show whatever we already have
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        setUserId(user.id)
        await refresh(user.id)
      } catch {
        // auth failure — middleware will redirect, nothing to show here
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const c = searchParams.get('code')
    if (c) setCode(c.toUpperCase())
  }, [searchParams])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !code.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('join_league', { p_code: code.trim() })
    setBusy(false)
    if (error) { toast.error(error.message.replace('Invalid league code', 'That code didn\'t match any league.')); return }
    toast.success('Joined! Taking you in…')
    await refresh(userId)
    setCode('')
    if (data) {
      await setActiveLeague(supabase, userId, data as string)
      router.replace('/dashboard')
    }
  }

  async function makeActive(id: string) {
    if (!userId || busy) return
    setBusy(true)
    await setActiveLeague(supabase, userId, id)
    router.replace('/dashboard')
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <PageHeader eyebrow="Leagues" title="Join a league" sub="Enter the code your league admin shared with you." />

      <Card className="p-5">
        <form onSubmit={join} className="space-y-3">
          <label htmlFor="code" className="block text-xs font-bold uppercase tracking-wider text-texts">League code</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. MAIN26"
            autoCapitalize="characters"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-bold tracking-widest text-textp placeholder:text-texts placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-primary uppercase"
          />
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !code.trim()}>
            {busy ? 'Joining…' : 'Join league'}
          </Button>
        </form>
      </Card>

      {loading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : leagues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-texts px-1">Your leagues</p>
          {leagues.map((l) => (
            <Card key={l.id} className="p-3 flex items-center gap-3">
              <TrophyIcon size={18} className={isMoneyLeague(l) ? 'text-gold' : 'text-primary'} />
              <span className="flex-1 font-bold text-sm truncate">{l.name}</span>
              <LeagueBadge name={l.league_labels?.name} color={l.league_labels?.color} money={isMoneyLeague(l)} />
              {l.join_code && (
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/join?code=${l.join_code}`
                    navigator.clipboard.writeText(url).then(() => toast.success('Invite link copied!')).catch(() => toast.error('Copy failed'))
                  }}
                  className="flex items-center gap-1 text-[12px] font-bold text-texts hover:text-primary border border-border rounded-lg px-2 py-1 hover:border-primary/40 transition-colors"
                  title="Copy invite link"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Share
                </button>
              )}
              <Button variant="surface" size="sm" onClick={() => makeActive(l.id)}>Open</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
