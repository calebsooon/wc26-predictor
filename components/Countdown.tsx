'use client'

import { useEffect, useState } from 'react'

function getTimeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1_000),
  }
}

export function Countdown({ matchDate }: { matchDate: string }) {
  const [t, setT] = useState(() => getTimeLeft(matchDate))

  useEffect(() => {
    const id = setInterval(() => setT(getTimeLeft(matchDate)), 1_000)
    return () => clearInterval(id)
  }, [matchDate])

  if (!t) return <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">Kicked off</span>

  if (t.d > 0) {
    return (
      <span className="text-[10px] text-gray-400 font-medium tabular-nums">
        {t.d}d {String(t.h).padStart(2,'0')}h
      </span>
    )
  }
  if (t.h > 0) {
    return (
      <span className="text-[10px] font-semibold text-orange-500 tabular-nums">
        {t.h}h {String(t.m).padStart(2,'0')}m
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold text-fifa-red animate-pulse tabular-nums">
      {String(t.m).padStart(2,'0')}m {String(t.s).padStart(2,'0')}s
    </span>
  )
}
