'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'
import { Modal, Button, Select, CalIcon } from '@/components/ui'
import { GW_NAMES, GW_SHORT } from '@/lib/prizes'

const REMINDERS: { value: string; label: string }[] = [
  { value: '0', label: 'No reminder' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '180', label: '3 hours before' },
  { value: '1440', label: '1 day before' },
]

const APP_HELP: { key: string; label: string; steps: string }[] = [
  { key: 'google', label: 'Google', steps: 'Google Calendar (desktop) → "Other calendars" → + → "From URL" → paste the link. Updates auto-sync (Google may take a few hours).' },
  { key: 'apple', label: 'Apple', steps: 'iPhone: tap Subscribe and it opens Calendar. Mac: Calendar → File → New Calendar Subscription → paste the link.' },
  { key: 'outlook', label: 'Outlook', steps: 'Outlook.com → Calendar → Add calendar → "Subscribe from web" → paste the link.' },
  { key: 'notion', label: 'Notion', steps: 'Notion Calendar has no “add by URL” — subscribe the link in Google Calendar first (see the Google tab), then connect that Google account to Notion Calendar and it’ll appear there.' },
]

export function CalendarExportButton({
  variant = 'outline',
  size = 'md',
  label = 'Add to calendar',
  className = '',
}: {
  variant?: 'primary' | 'gold' | 'outline' | 'ghost' | 'surface'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} className={className} icon={<CalIcon size={16} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <CalendarExportModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function CalendarExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [token, setToken] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [scope, setScope] = useState('all')        // 'all' | '1'..'8'
  const [reminder, setReminder] = useState('60')
  const [help, setHelp] = useState('google')
  const [rotating, setRotating] = useState(false)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    if (!open || token) return
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('calendar_token').eq('id', user.id).single()
      if (!cancelled) setToken((data as { calendar_token?: string } | null)?.calendar_token ?? null)
    })()
    return () => { cancelled = true }
  }, [open, token, supabase])

  const gw = scope === 'all' ? null : Number(scope)
  const qs = `reminder=${reminder}${gw ? `&gw=${gw}` : ''}`
  const httpUrl = token ? `${origin}/api/calendar/${token}.ics?${qs}` : ''
  const webcalUrl = httpUrl.replace(/^https?:/, 'webcal:')
  const downloadUrl = token ? `${origin}/api/calendar/${token}.ics?${qs}&download=1` : ''

  function copy() {
    navigator.clipboard.writeText(httpUrl).then(
      () => toast.success('Subscription link copied'),
      () => toast.error('Could not copy link'),
    )
  }

  async function rotateToken() {
    if (!token || !window.confirm('Rotate your calendar link? Existing subscriptions will stop updating.')) return
    setRotating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in again to rotate this link')
      const nextToken = crypto.randomUUID()
      const { error } = await supabase.from('profiles').update({ calendar_token: nextToken }).eq('id', user.id)
      if (error) throw error
      setToken(nextToken)
      toast.success('Calendar link rotated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rotate link')
    } finally {
      setRotating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add matches to your calendar">
      <div className="p-5 flex flex-col gap-5">
        <p className="text-[13px] text-texts leading-relaxed">
          Kickoffs show in <span className="text-textp font-semibold">your own time zone</span> automatically.
          Subscribing keeps the schedule live — knockout teams fill in on their own, no duplicates.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Which matches" value={scope} onChange={setScope}>
            <option value="all">All matches</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={String(n)}>{GW_SHORT[n]} — {GW_NAMES[n]}</option>
            ))}
          </Select>
          <Select label="Reminder" value={reminder} onChange={setReminder}>
            {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </div>

        {!token ? (
          <div className="text-[13px] text-texts">Preparing your personal link…</div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <a href={webcalUrl}>
                <Button variant="gold" size="lg" className="w-full" icon={<CalIcon size={16} />}>Subscribe (auto-updating)</Button>
              </a>
              <div className="flex gap-2">
                <Button variant="surface" size="md" className="flex-1" onClick={copy}>Copy link</Button>
                <a href={downloadUrl} className="flex-1">
                  <Button variant="outline" size="md" className="w-full">Download .ics</Button>
                </a>
              </div>
              <button onClick={() => void rotateToken()} disabled={rotating} className="self-start text-[11px] font-bold text-texts hover:text-error disabled:opacity-50">
                {rotating ? 'Rotating link...' : 'Rotate calendar link'}
              </button>
              <p className="text-[11px] text-faint leading-relaxed">
                <span className="font-semibold text-texts">Subscribe</span> = stays in sync forever.
                {' '}<span className="font-semibold text-texts">Download</span> = one-time snapshot (won’t auto-update).
                Reminders work everywhere on downloads; on subscriptions, Apple honours them but Google often ignores feed reminders.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex gap-2 mb-2 flex-wrap">
                {APP_HELP.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setHelp(a.key)}
                    className={`px-3 h-8 rounded-full text-[12px] font-semibold border transition-all ${help === a.key ? 'bg-textp text-bg border-textp' : 'bg-surface2 text-texts border-border hover:text-textp'}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] text-texts leading-relaxed">{APP_HELP.find((a) => a.key === help)?.steps}</p>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
