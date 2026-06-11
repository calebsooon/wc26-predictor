'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Logo, Button } from '@/components/ui'
import RulesButton from '@/components/RulesButton'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [mode, setMode]         = useState<Mode>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        const username = email.split('@')[0]
        await supabase
          .from('profiles')
          .upsert({ id: data.user.id, username }, { onConflict: 'id', ignoreDuplicates: true })
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2.5 justify-center mb-8">
          <Logo />
          <span className="font-extrabold tracking-tight text-lg">MATCHDAY</span>
        </Link>

        <div className="bg-card rounded-2xl border border-border p-7">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-surface border border-border p-1 mb-6">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null) }}
                className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${mode === m ? 'bg-primary text-[#04210F]' : 'text-texts hover:text-textp'}`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-texts mb-1.5">Email</label>
              <input
                id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-texts mb-1.5">Password</label>
              <input
                id="password" type="password" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary"
              />
            </div>

            {error && <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode === 'signin' ? 'Sign in' : 'Create account')}
            </Button>
          </form>
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          <RulesButton label="How scoring works" variant="ghost" size="sm" />
          <p className="text-center text-xs text-texts">Your road to glory starts here.</p>
        </div>
      </div>
    </main>
  )
}
