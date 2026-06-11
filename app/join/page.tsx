'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { getMyLeagues, setActiveLeague, isMoneyLeague, type League } from '@/lib/league'
import { Card, Button, PageHeader, Skeleton, TrophyIcon, LeagueBadge } from '@/components/ui'

export default function JoinPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<League[]>([])
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function refresh(uid: string) {
    setLeagues(await getMyLeagues(supabase, uid))
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      await refresh(user.id)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      router.refresh()
    }
  }

  async function makeActive(id: string) {
    if (!userId) return
    await setActiveLeague(supabase, userId, id)
    router.replace('/dashboard')
    router.refresh()
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
              <Button variant="surface" size="sm" onClick={() => makeActive(l.id)}>Open</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
