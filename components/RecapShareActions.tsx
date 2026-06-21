'use client'

import { useState } from 'react'

export function RecapShareActions({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }
  const card = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200; canvas.height = 630
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const gradient = ctx.createLinearGradient(0, 0, 1200, 630)
    gradient.addColorStop(0, '#062d1a'); gradient.addColorStop(1, '#0d6c3d')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(1060, 90, 270, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#8dffb3'; ctx.font = '700 28px system-ui'; ctx.fillText('MATCHDAY · PRIVATE LEAGUE', 72, 92)
    ctx.fillStyle = '#fff'; ctx.font = '800 68px system-ui'; wrap(ctx, title, 72, 205, 1050, 78)
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '500 32px system-ui'; wrap(ctx, subtitle, 72, 420, 1000, 44)
    ctx.fillStyle = 'rgba(255,255,255,.58)'; ctx.font = '600 24px system-ui'; ctx.fillText('Made for your league · not a public result card', 72, 565)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const file = new File([blob], 'matchday-recap.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title, text, files: [file] }); return }
    const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = 'matchday-recap.png'; link.click(); URL.revokeObjectURL(href)
  }
  return <div className="flex flex-wrap gap-2"><button onClick={copy} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-bold text-texts hover:text-textp">{copied ? 'Copied!' : 'Copy recap'}</button><button onClick={card} className="rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/15">Share card</button></div>
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number) {
  const words = text.split(' '); let line = ''; let row = y
  for (const word of words) { const candidate = `${line}${line ? ' ' : ''}${word}`; if (ctx.measureText(candidate).width > width && line) { ctx.fillText(line, x, row); line = word; row += lineHeight } else line = candidate }
  if (line) ctx.fillText(line, x, row)
}
