'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui'

export type Command = { id: string; label: string; hint?: string; run: () => void }

export default function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    function openFromShell() { setOpen(true) }
    window.addEventListener('matchday:open-command-palette', openFromShell)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('matchday:open-command-palette', openFromShell)
    }
  }, [])

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim()
    if (!s) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(s) || c.hint?.toLowerCase().includes(s))
  }, [q, commands])

  function pick(c: Command) { c.run(); setOpen(false); setQ('') }

  return (
    <Modal open={open} onClose={() => { setOpen(false); setQ('') }} title="Jump to…" maxWidth="max-w-lg">
      <div className="p-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) pick(filtered[0]) }}
          placeholder="Search pages and leagues…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-textp placeholder:text-texts focus:outline-none focus:border-primary mb-2"
        />
        <div className="max-h-80 overflow-y-auto space-y-0.5">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => pick(c)} className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left hover:bg-surface transition-colors">
              <span className="text-sm font-semibold text-textp truncate">{c.label}</span>
              {c.hint && <span className="text-[11px] text-texts shrink-0">{c.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-texts text-center py-6">No matches.</p>}
        </div>
      </div>
    </Modal>
  )
}
