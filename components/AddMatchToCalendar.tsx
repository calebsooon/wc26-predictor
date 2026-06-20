'use client'

import { useState } from 'react'
import { Modal, Button, Select, CalIcon } from '@/components/ui'
import { buildCalendar, icsFilename, type IcsMatch } from '@/lib/ics'

const REMINDERS: { value: string; label: string }[] = [
  { value: '0', label: 'No reminder' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '180', label: '3 hours before' },
  { value: '1440', label: '1 day before' },
]

// One-off "add this game" — a single match is download-only (subscribing to one
// fixture is pointless; the auto-updating feed lives in the full export modal).
export function AddMatchToCalendar({ match, title }: { match: IcsMatch; title: string }) {
  const [open, setOpen] = useState(false)
  const [reminder, setReminder] = useState('60')

  function download() {
    const ics = buildCalendar([match], { name: title, reminderMinutes: Number(reminder) })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = icsFilename(title)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <>
      <Button variant="outline" size="sm" icon={<CalIcon size={15} />} onClick={() => setOpen(true)}>
        Add to calendar
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add to calendar" maxWidth="max-w-sm">
        <div className="p-5 flex flex-col gap-4">
          <p className="text-[13px] text-texts leading-relaxed">
            Downloads <span className="text-textp font-semibold">{title}</span> as a calendar file. Opens in Google,
            Apple, Outlook or Notion Calendar — in your own time zone.
          </p>
          <Select label="Reminder" value={reminder} onChange={setReminder}>
            {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
          <Button variant="gold" size="lg" className="w-full" icon={<CalIcon size={16} />} onClick={download}>
            Download .ics
          </Button>
        </div>
      </Modal>
    </>
  )
}
