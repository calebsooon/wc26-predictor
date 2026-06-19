'use client'

import { useId } from 'react'

// ─── BarChart ────────────────────────────────────────────────────────────────
interface BarChartProps {
  series: number[]
  labels?: (string | number)[]
  accent?: string
  highlight?: number | null
  showVals?: boolean
  height?: number
}

function topRound(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h))
  return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`
}

export function BarChart({
  series, labels, accent = 'rgb(var(--primary))', highlight, showVals = true,
}: BarChartProps) {
  const data = series
  const lbls = labels ?? data.map((_, i) => i + 1)
  const n = data.length
  const max = Math.max(...data, 1)
  const niceMax = Math.max(10, Math.ceil(max / 10) * 10)
  const W = 600, H = 200, padT = 12, padB = 2, pxH = 160
  const gap = (600 / n) * 0.4
  const bw = 600 / n - gap
  const lastIdx = highlight != null ? highlight : n - 1

  const yCoord = (v: number) => padT + (H - padT - padB) * (1 - v / (niceMax * 1.04))

  const bars = data.map((v, i) => {
    const x = (600 / n) * i + gap / 2
    const yy = yCoord(v)
    const bh = (H - padB) - yy
    const hot = i === lastIdx
    const centerPct = ((x + bw / 2) / 600) * 100
    return {
      path: topRound(+x.toFixed(1), +yy.toFixed(1), +bw.toFixed(1), +bh.toFixed(1), 5),
      fill: hot ? accent : 'rgb(var(--surface3))',
      label: lbls[i],
      labelColor: hot ? 'rgb(var(--textp))' : 'rgb(var(--faint))',
      val: showVals ? (v > 0 ? v : '') : '',
      valColor: hot ? accent : 'rgb(var(--texts))',
      labelTop: +((yy / H) * pxH - 15).toFixed(1),
      labelLeft: +centerPct.toFixed(2),
    }
  })
  const grid = [0, 0.33, 0.66, 1].map((t) => ({ y: +(padT + (H - padT - padB) * t).toFixed(1) }))
  const yticks = [niceMax, Math.round(niceMax * 0.66), Math.round(niceMax * 0.33), 0]

  return (
    <div className="w-full flex gap-[11px] font-display">
      <div className="flex flex-col justify-between py-[11px] pb-6 shrink-0 w-[18px]">
        {yticks.map((t, i) => (
          <span key={i} className="text-[9.5px] font-semibold text-right leading-none tabular-nums" style={{ color: 'rgb(var(--faint))' }}>{t}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: pxH, display: 'block' }}>
            {grid.map((g, i) => (
              <line key={i} x1={0} x2={W} y1={g.y} y2={g.y} stroke="rgb(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {bars.map((b, i) => (
              <path key={i} d={b.path} fill={b.fill} />
            ))}
          </svg>
          {bars.map((b, i) => b.val ? (
            <span
              key={i}
              className="absolute tabular-nums text-[10px] font-bold pointer-events-none"
              style={{
                top: b.labelTop,
                left: `${b.labelLeft}%`,
                transform: 'translateX(-50%)',
                color: b.valColor,
              }}
            >
              {b.val}
            </span>
          ) : null)}
        </div>
        <div className="flex justify-between mt-2 overflow-hidden">
          {bars.map((b, i) => (
            <span key={i} className="flex-1 text-center text-[10px] font-semibold tabular-nums min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: b.labelColor }}>{b.label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AreaChart ───────────────────────────────────────────────────────────────
interface AreaChartProps {
  series: number[]
  labels?: string[]
  accent?: string
}

function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1]
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

export function AreaChart({ series, labels, accent = 'rgb(var(--primary))' }: AreaChartProps) {
  const uid = useId().replace(/:/g, '')
  const data = series
  const lbls = labels ?? data.map((_, i) => `GW${i + 1}`)
  const W = 600, H = 210, padL = 4, padR = 4, padT = 16, padB = 10
  const maxV = Math.max(...data, 1) * 1.18
  const n = data.length
  const xCoord = (i: number) => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1))
  const yCoord = (v: number) => padT + (H - padT - padB) * (1 - v / maxV)
  const pts = data.map((v, i) => ({ x: +xCoord(i).toFixed(1), y: +yCoord(v).toFixed(1) }))
  const line = smooth(pts)
  const area = line + ` L ${xCoord(n - 1).toFixed(1)} ${H - padB} L ${xCoord(0).toFixed(1)} ${H - padB} Z`
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: +(padT + (H - padT - padB) * t).toFixed(1) }))
  const last = pts[n - 1]

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity={0.32} />
            <stop offset="0.55" stopColor={accent} stopOpacity={0.08} />
            <stop offset="1" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <line key={i} x1={0} x2={W} y1={g.y} y2={g.y} stroke="rgb(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${uid})`} />
        <path d={line} fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={last.x} cy={last.y} r={12} fill={accent} opacity={0.16} />
        <circle cx={last.x} cy={last.y} r={4.5} fill={accent} stroke="rgb(var(--card))" strokeWidth={2.5} />
      </svg>
      <div className="flex justify-between mt-1.5 px-0.5">
        {lbls.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[10px] font-semibold tabular-nums" style={{ color: 'rgb(var(--faint))' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── DonutChart ──────────────────────────────────────────────────────────────
interface DonutSegment { value: number; color: string }
interface DonutChartProps {
  segments?: DonutSegment[]
  total?: number
  centerValue?: string | number
  centerLabel?: string
  size?: number
  thickness?: number
  valColor?: string
  valSize?: number
}

export function DonutChart({
  segments,
  total,
  centerValue,
  centerLabel = 'accuracy',
  size = 168,
  thickness = 18,
  valColor = 'rgb(var(--textp))',
  valSize,
}: DonutChartProps) {
  const segsIn = segments ?? [{ value: 61, color: 'rgb(var(--primary))' }]
  const tot = total != null ? total : segsIn.reduce((s, x) => s + x.value, 0)
  const r = 100 - thickness / 2 - 4
  const C = 2 * Math.PI * r
  const gapDeg = segsIn.length > 1 ? 0.012 : 0
  let acc = 0
  const segs = segsIn.map((s) => {
    const frac = tot > 0 ? Math.max(0, s.value / tot) : 0
    const len = Math.max(0, (frac - gapDeg) * C)
    const offset = -acc * C
    acc += frac
    return { color: s.color, dash: `${len.toFixed(1)} ${(C - len).toFixed(1)}`, offset: offset.toFixed(1) }
  })
  const cv = centerValue != null ? centerValue : (segsIn.length === 1 ? `${segsIn[0].value}%` : '')
  const vSize = valSize ?? Math.round(size * 0.21)
  const lSize = Math.max(9, Math.round(size * 0.062))

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={100} cy={100} r={r} fill="none" stroke="rgb(var(--surface3))" strokeWidth={thickness} />
        {segs.map((s, i) => (
          <circle
            key={i}
            cx={100} cy={100} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <span
          className="tabular-nums font-extrabold leading-none font-display"
          style={{ fontSize: vSize, color: valColor, letterSpacing: '-0.02em' }}
        >
          {cv}
        </span>
        <span
          className="font-semibold uppercase"
          style={{ fontSize: lSize, letterSpacing: '0.1em', color: 'rgb(var(--faint))' }}
        >
          {centerLabel}
        </span>
      </div>
    </div>
  )
}

// ─── RankLine ────────────────────────────────────────────────────────────────
interface RankLineProps {
  ranks: number[]
  total?: number
  labels?: string[]
  accent?: string
}

function dotPath(cx: number, cy: number, r: number): string {
  return `M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} a ${r} ${r} 0 1 0 ${(2 * r).toFixed(1)} 0 a ${r} ${r} 0 1 0 ${(-2 * r).toFixed(1)} 0 Z`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function RankLine({ ranks, total, labels, accent = 'rgb(var(--primary))' }: RankLineProps) {
  const uid = useId().replace(/:/g, '')
  const tot = total ?? Math.max(...ranks, 7)
  const lbls = labels ?? ranks.map((_, i) => `GW${i + 1}`)
  const padL = 34, padR = 8, padT = 12, padB = 10, W = 600, H = 152
  const n = ranks.length
  const xCoord = (i: number) => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1))
  const yCoord = (rank: number) => padT + (H - padT - padB) * ((rank - 1) / Math.max(1, tot - 1))
  const pts = ranks.map((rank, i) => ({ x: +xCoord(i).toFixed(1), y: +yCoord(rank).toFixed(1) }))
  const line = smooth(pts)
  const baseY = (H - padB).toFixed(1)
  const area = line + ` L ${xCoord(n - 1).toFixed(1)} ${baseY} L ${xCoord(0).toFixed(1)} ${baseY} Z`
  const grayDots = pts.slice(0, -1).map((p) => dotPath(p.x, p.y, 3.2)).join(' ')
  const lastDot = dotPath(pts[n - 1].x, pts[n - 1].y, 5)
  const gridRanks = [1, Math.round((tot + 1) / 2), tot]
  const grid = gridRanks.map((rank) => ({ y: +yCoord(rank).toFixed(1) }))
  const ylabels = gridRanks.map((rank) => ({ top: +(yCoord(rank) / H * 100).toFixed(1), label: ordinal(rank) }))
  const maxXLabels = 6
  const xLabelStep = Math.max(1, Math.ceil(lbls.length / maxXLabels))
  const xlabels = lbls
    .map((label, i) => ({ left: +(xCoord(i) / W * 100).toFixed(1), label, i }))
    .filter(({ i }) => i === 0 || i === lbls.length - 1 || i % xLabelStep === 0)

  return (
    <div className="w-full relative" style={{ paddingBottom: 22 }}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={accent} stopOpacity={0.22} />
              <stop offset="1" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid.map((g, i) => (
            <line key={i} x1={34} x2={592} y1={g.y} y2={g.y} stroke="rgb(var(--border))" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill={`url(#${uid})`} />
          <path d={line} fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={grayDots} fill="rgb(var(--texts))" stroke="rgb(var(--card))" strokeWidth={2} />
          <path d={lastDot} fill={accent} stroke="rgb(var(--card))" strokeWidth={2.5} />
        </svg>
        <div className="absolute inset-0 pointer-events-none">
          {ylabels.map((y, i) => (
            <span
              key={i}
              className="absolute left-0 text-[10.5px] font-bold tabular-nums"
              style={{ top: `${y.top}%`, transform: 'translateY(-50%)', color: 'rgb(var(--faint))' }}
            >
              {y.label}
            </span>
          ))}
        </div>
      </div>
      {xlabels.map((l, i) => (
        <span
          key={i}
          className="absolute bottom-0 text-[10px] font-semibold tabular-nums"
          style={{ left: `${l.left}%`, transform: 'translateX(-50%)', color: 'rgb(var(--faint))' }}
        >
          {l.label}
        </span>
      ))}
    </div>
  )
}

// ─── PointsRaceChart ─────────────────────────────────────────────────────────
export const PLAYER_PALETTE = [
  '#6366f1', '#f97316', '#10b981', '#f43f5e',
  '#3b82f6', '#eab308', '#a855f7', '#14b8a6',
]

// Dash patterns cycling across players so overlapping lines stay distinguishable
const DASH_PATTERNS = ['none', '8,4', '3,4', '10,3,2,3', '5,3', '12,4', '2,3', 'none']

export interface RaceSeries {
  id: string
  name: string
  color: string
  data: number[]
}

export function PointsRaceChart({
  series,
  labels,
  youId,
  mode = 'line',
}: {
  series: RaceSeries[]
  labels: string[]
  youId?: string | null
  mode?: 'line' | 'bar'
}) {
  const W = 600, H = 200
  const padL = 30, padR = 8, padT = 12, padB = 28

  if (series.length === 0) return null

  if (mode === 'bar') {
    const n = series.length
    const maxVal = Math.max(...series.map((s) => s.data[0] ?? 0), 1)
    const niceMax = Math.max(10, Math.ceil(maxVal / 5) * 5)
    const gap = (W / n) * 0.35
    const bw = W / n - gap
    const yT = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax)
    const gridVals = [0, Math.round(niceMax * 0.5), niceMax]
    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160, display: 'block' }}>
          {gridVals.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={yT(v)} y2={yT(v)} stroke="rgb(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={padL - 4} y={yT(v) + 3.5} textAnchor="end" fontSize={9} fill="rgb(var(--faint))" fontFamily="system-ui,sans-serif">{v}</text>
            </g>
          ))}
          {series.map((s, i) => {
            const v = s.data[0] ?? 0
            const x = (W / n) * i + gap / 2
            const y = yT(v)
            const bh = Math.max(H - padB - y, 2)
            return (
              <path key={s.id} d={topRound(+x.toFixed(1), +y.toFixed(1), +bw.toFixed(1), +bh.toFixed(1), 5)} fill={s.color} opacity={s.id === youId ? 1 : 0.75} />
            )
          })}
        </svg>
        <div style={{ display: 'flex', paddingLeft: padL }}>
          {series.map((s) => (
            <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.data[0] ?? 0}</span>
              <span style={{ fontSize: 10, fontWeight: s.id === youId ? 700 : 500, color: s.id === youId ? 'rgb(var(--textp))' : 'rgb(var(--texts))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 2px' }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Line mode — multi-series cumulative chart
  const LH = 240  // taller canvas for more vertical spread
  const padR2 = 70 // extra right padding for end-of-line labels
  const n = labels.length
  if (n === 0) return null
  const allVals = series.flatMap((s) => s.data.slice(0, n))
  const rawMax = Math.max(...allVals, 1)
  const positives = allVals.filter((v) => v > 0)
  const rawMin = positives.length ? Math.min(...positives) : 0
  // Zoom the Y-axis tightly around the data band so closely-packed lines
  // spread across the full canvas instead of bunching together.
  const span = Math.max(rawMax - rawMin, 1)
  const padV = span * 0.12
  const paddedSpan = span * 1.24
  // Pick a "nice" round step targeting ~6 gridlines for the visible band.
  const step = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100].find((s) => paddedSpan / s <= 6) ?? 100
  const yFloor = Math.max(0, Math.floor((rawMin - padV) / step) * step)
  const niceMax = Math.max(yFloor + step, Math.ceil((rawMax + padV) / step) * step)
  const yRange = niceMax - yFloor
  const xPos = (i: number) => padL + (n === 1 ? (W - padL - padR2) / 2 : (i / (n - 1)) * (W - padL - padR2))
  const yPos = (v: number) => padT + (LH - padT - padB) * (1 - (v - yFloor) / yRange)
  const gridVals: number[] = []
  for (let v = yFloor; v <= niceMax + 0.5; v += step) gridVals.push(v)

  // Sort series by final value descending for right-edge label placement
  const sorted = [...series].sort((a, b) => (b.data[n - 1] ?? 0) - (a.data[n - 1] ?? 0))

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${LH}`} style={{ width: '100%', height: 240, display: 'block' }}>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR2} y1={yPos(v)} y2={yPos(v)} stroke="rgb(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 4} y={yPos(v) + 3.5} textAnchor="end" fontSize={9} fill="rgb(var(--faint))" fontFamily="system-ui,sans-serif">{v}</text>
          </g>
        ))}
        {labels.map((lbl, i) => (
          <text key={i} x={xPos(i)} y={LH - 4} textAnchor="middle" fontSize={9} fill="rgb(var(--faint))" fontFamily="system-ui,sans-serif">{lbl}</text>
        ))}
        {series.map((s, si) => {
          const isYou = s.id === youId
          const dash = isYou ? 'none' : (DASH_PATTERNS[si % DASH_PATTERNS.length] ?? 'none')
          const pts = s.data.slice(0, n).map((v, i) => ({ x: xPos(i), y: yPos(v) }))
          const path = smooth(pts)
          return (
            <g key={s.id}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={isYou ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} vectorEffect="non-scaling-stroke" opacity={isYou ? 1 : 0.85} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={isYou ? 3.5 : 2.5} fill={s.color} stroke={isYou ? 'rgb(var(--card))' : 'none'} strokeWidth={isYou ? 1.5 : 0} opacity={isYou ? 1 : 0.85} />
              ))}
            </g>
          )
        })}
        {/* Right-edge labels: sorted by final value, nudge y so they don't overlap */}
        {(() => {
          const minGap = 13
          const placed: { y: number; s: RaceSeries }[] = []
          for (const s of sorted) {
            const rawY = yPos(s.data[Math.min(n - 1, s.data.length - 1)] ?? 0)
            let y = rawY
            for (const p of placed) {
              if (Math.abs(p.y - y) < minGap) y = p.y + minGap
            }
            placed.push({ y, s })
          }
          return placed.map(({ y, s }) => (
            <text key={s.id} x={W - padR2 + 6} y={y + 3.5} fontSize={9} fontWeight={s.id === youId ? 700 : 500} fill={s.color} fontFamily="system-ui,sans-serif">
              {s.name.length > 8 ? s.name.slice(0, 8) : s.name}
            </text>
          ))
        })()}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8, paddingLeft: padL }}>
        {series.map((s, si) => {
          const isYou = s.id === youId
          const dash = isYou ? 'none' : (DASH_PATTERNS[si % DASH_PATTERNS.length] ?? 'none')
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={18} height={10} style={{ flexShrink: 0 }}>
                <line x1={0} y1={5} x2={18} y2={5} stroke={s.color} strokeWidth={isYou ? 2.5 : 2} strokeDasharray={dash} strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: isYou ? 700 : 500, color: isYou ? 'rgb(var(--textp))' : 'rgb(var(--texts))' }}>{s.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── RaceCompareChart ────────────────────────────────────────────────────────
// Renders the same series under one of four Y-axis treatments (user-selectable
// via the leaderboard race toggle): absolute points, gap to leader, gap to the
// field average, or finishing-position (rank) race. Handles negative ranges and
// the inverted rank axis, which the base PointsRaceChart does not.
export type RaceVariant = 'absolute' | 'gapLeader' | 'gapAvg' | 'rank'

export function RaceCompareChart({
  series,
  labels,
  youId,
  variant,
}: {
  series: RaceSeries[]
  labels: string[]
  youId?: string | null
  variant: RaceVariant
}) {
  const n = labels.length
  if (series.length === 0 || n === 0) return null

  const W = 600, LH = 240
  const padL = 30, padT = 12, padB = 28
  const padR2 = 70

  const N = series.length
  const dayVals = (i: number) => series.map((s) => s.data[i] ?? 0)

  // Transform each series' data per the chosen variant
  const trans: RaceSeries[] = series.map((s) => {
    const data = Array.from({ length: n }, (_, i) => {
      const v = s.data[i] ?? 0
      if (variant === 'absolute') return v
      if (variant === 'gapLeader') return v - Math.max(...dayVals(i))
      if (variant === 'gapAvg') {
        const d = dayVals(i)
        return v - d.reduce((a, b) => a + b, 0) / d.length
      }
      // rank: 1 = best (most points) that day
      const sorted = [...dayVals(i)].sort((a, b) => b - a)
      return sorted.indexOf(v) + 1
    })
    return { ...s, data }
  })

  const allV = trans.flatMap((s) => s.data)
  const invert = variant === 'rank'
  let lo: number, hi: number
  if (variant === 'rank') {
    lo = 1; hi = Math.max(N, 2)
  } else {
    lo = Math.min(...allV); hi = Math.max(...allV)
    const span = Math.max(hi - lo, 1)
    const pad = span * 0.12
    lo = lo - pad
    hi = hi + pad
    // Absolute points can't go negative — clamp the floor so the band stays honest.
    if (variant === 'absolute') lo = Math.max(0, lo)
  }
  const range = (hi - lo) || 1

  const xPos = (i: number) => padL + (n === 1 ? (W - padL - padR2) / 2 : (i / (n - 1)) * (W - padL - padR2))
  const yPos = (v: number) =>
    invert
      ? padT + (LH - padT - padB) * ((v - lo) / range)
      : padT + (LH - padT - padB) * (1 - (v - lo) / range)

  // Gridlines
  let gridVals: number[]
  if (variant === 'rank') {
    gridVals = Array.from({ length: N }, (_, i) => i + 1)
  } else {
    const step = [1, 2, 5, 10, 15, 20, 25, 50, 100].find((s) => range / s <= 6) ?? 100
    gridVals = []
    for (let v = Math.ceil(lo / step) * step; v <= hi + 0.001; v += step) gridVals.push(v)
  }

  const fmt = (v: number) =>
    variant === 'rank' ? ordinal(v)
      : variant === 'gapLeader' || variant === 'gapAvg' ? (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)
        : `${Math.round(v)}`

  const showZero = variant === 'gapLeader' || variant === 'gapAvg'

  // Right-edge labels, nudged so they don't overlap
  const sorted = [...trans].sort((a, b) => yPos(a.data[n - 1] ?? 0) - yPos(b.data[n - 1] ?? 0))
  const minGap = 13
  const placed: { y: number; s: RaceSeries }[] = []
  for (const s of sorted) {
    let y = yPos(s.data[n - 1] ?? 0)
    for (const p of placed) if (Math.abs(p.y - y) < minGap) y = p.y + minGap
    placed.push({ y, s })
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${LH}`} style={{ width: '100%', height: 240, display: 'block' }}>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR2} y1={yPos(v)} y2={yPos(v)} stroke="rgb(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 4} y={yPos(v) + 3.5} textAnchor="end" fontSize={9} fill="rgb(var(--faint))" fontFamily="system-ui,sans-serif">{fmt(v)}</text>
          </g>
        ))}
        {showZero && (
          <line x1={padL} x2={W - padR2} y1={yPos(0)} y2={yPos(0)} stroke="rgb(var(--texts))" strokeWidth={1.4} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity={0.7} />
        )}
        {labels.map((lbl, i) => (
          <text key={i} x={xPos(i)} y={LH - 4} textAnchor="middle" fontSize={9} fill="rgb(var(--faint))" fontFamily="system-ui,sans-serif">{lbl}</text>
        ))}
        {trans.map((s, si) => {
          const isYou = s.id === youId
          const dash = isYou ? 'none' : (DASH_PATTERNS[si % DASH_PATTERNS.length] ?? 'none')
          const pts = s.data.map((v, i) => ({ x: xPos(i), y: yPos(v) }))
          return (
            <g key={s.id}>
              <path d={smooth(pts)} fill="none" stroke={s.color} strokeWidth={isYou ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} vectorEffect="non-scaling-stroke" opacity={isYou ? 1 : 0.85} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={isYou ? 3.5 : 2.5} fill={s.color} stroke={isYou ? 'rgb(var(--card))' : 'none'} strokeWidth={isYou ? 1.5 : 0} opacity={isYou ? 1 : 0.85} />
              ))}
            </g>
          )
        })}
        {placed.map(({ y, s }) => (
          <text key={s.id} x={W - padR2 + 6} y={y + 3.5} fontSize={9} fontWeight={s.id === youId ? 700 : 500} fill={s.color} fontFamily="system-ui,sans-serif">
            {s.name.length > 8 ? s.name.slice(0, 8) : s.name}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8, paddingLeft: padL }}>
        {series.map((s, si) => {
          const isYou = s.id === youId
          const dash = isYou ? 'none' : (DASH_PATTERNS[si % DASH_PATTERNS.length] ?? 'none')
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={18} height={10} style={{ flexShrink: 0 }}>
                <line x1={0} y1={5} x2={18} y2={5} stroke={s.color} strokeWidth={isYou ? 2.5 : 2} strokeDasharray={dash} strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: isYou ? 700 : 500, color: isYou ? 'rgb(var(--textp))' : 'rgb(var(--texts))' }}>{s.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
