'use client'

/* ============================================================
   BRACKET XI — UI primitives (Dark Stadium Analytics)
   Ported from the Claude Design bundle to typed React/Tailwind.
   All colours are token-driven so they flip light/dark automatically.
   ============================================================ */

import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { getTeam } from '@/lib/teams'

/* ---------- Flag + Team name ---------- */
export function Flag({ code, size = 26 }: { code: string; size?: number }) {
  const t = getTeam(code)
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} className="select-none" aria-label={t.name}>
      {t.flag}
    </span>
  )
}

/* ---------- Avatar (initials or photo) ---------- */
export function Avatar({
  name, src, size = 36, ring = false, you = false,
}: { name: string; src?: string | null; size?: number; ring?: boolean; you?: boolean }) {
  const color = you ? 'rgb(var(--blue))' : 'rgb(var(--primary))'
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: ring ? `2px solid ${color}` : undefined }}
      />
    )
  }
  return (
    <div
      className="grid place-items-center rounded-full font-bold shrink-0 uppercase"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: 'rgb(var(--surface))', color,
        border: ring ? `2px solid ${color}` : `1px solid rgb(var(--border))`,
      }}
    >
      {(name?.[0] ?? '?')}
    </div>
  )
}

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'gold' | 'outline' | 'ghost' | 'surface' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}
export function Button({ children, variant = 'primary', size = 'md', className = '', icon, ...rest }: ButtonProps) {
  const sizes = {
    sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-md',
    md: 'h-10 px-4 text-sm gap-2 rounded-md',
    lg: 'h-12 px-6 text-[15px] gap-2 rounded-md',
  }
  const variants = {
    primary: 'bg-primary text-[#04210F] font-bold hover:opacity-90',
    gold: 'bg-gold text-[#231a00] font-bold hover:opacity-90',
    outline: 'border border-border bg-transparent text-textp font-semibold hover:bg-card',
    ghost: 'text-texts hover:text-textp hover:bg-surface font-semibold',
    surface: 'bg-surface text-textp font-semibold border border-border hover:bg-card',
    danger: 'bg-error/15 text-error border border-error/30 font-semibold hover:bg-error/25',
  }
  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap transition-all duration-100 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({
  children, className = '', hover = false, glow = false, ...rest
}: { children: ReactNode; className?: string; hover?: boolean; glow?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-card border rounded-xl ${hover ? 'transition-colors duration-150 hover:border-texts/40 cursor-pointer' : ''} ${glow ? 'border-primary/30' : 'border-border'} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ---------- StatCard ---------- */
export function StatCard({
  label, value, sub, accent = 'default', icon,
}: { label: string; value: ReactNode; sub?: ReactNode; accent?: 'gold' | 'green' | 'blue' | 'default'; icon?: ReactNode }) {
  const accents = {
    gold: 'rgb(var(--gold))',
    green: 'rgb(var(--primary))',
    blue: 'rgb(var(--blue))',
    default: 'rgb(var(--textp))',
  }
  const c = accents[accent]
  return (
    <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
      {accent !== 'default' && <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c }} />}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-texts">{label}</span>
        {icon && <span className="text-texts/70">{icon}</span>}
      </div>
      <div className="mt-2.5 text-[30px] font-extrabold tabular-nums leading-none" style={{ color: c }}>{value}</div>
      {sub && <div className="mt-2 text-xs text-texts font-medium">{sub}</div>}
    </div>
  )
}

/* ---------- Pill ---------- */
export function Pill({
  children, tone = 'default', className = '', icon,
}: { children: ReactNode; tone?: 'default' | 'green' | 'gold' | 'red' | 'blue' | 'live'; className?: string; icon?: ReactNode }) {
  const tones = {
    default: 'bg-surface text-texts border-border',
    green: 'bg-primary/12 text-primary border-primary/25',
    gold: 'bg-gold/12 text-gold border-gold/25',
    red: 'bg-error/12 text-error border-error/30',
    blue: 'bg-blue/12 text-blue border-blue/25',
    live: 'bg-error/15 text-error border-error/30',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${tones[tone]} ${className}`}>
      {tone === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />}
      {icon}
      {children}
    </span>
  )
}

export type PredStatus = 'missing' | 'submitted' | 'locked' | 'scored'
export function StatusBadge({ status, pts }: { status: PredStatus; pts?: number | null }) {
  if (status === 'missing') return <Pill tone="red" icon={<span>●</span>}>Missing</Pill>
  if (status === 'submitted') return <Pill tone="blue">✓ Submitted</Pill>
  if (status === 'locked') return <Pill tone="default" icon={<LockIcon size={11} />}>Locked</Pill>
  if (status === 'scored') return <Pill tone="green">+{pts ?? 0} pts</Pill>
  return null
}

/* ---------- Tabs (underline) ---------- */
type Tab = string | { key: string; label: string }
export function Tabs({ tabs, value, onChange, className = '' }: { tabs: Tab[]; value: string; onChange: (k: string) => void; className?: string }) {
  return (
    <div className={`flex gap-1 border-b border-border overflow-x-auto no-scrollbar ${className}`}>
      {tabs.map((t) => {
        const key = typeof t === 'string' ? t : t.key
        const label = typeof t === 'string' ? t : t.label
        const active = key === value
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative px-4 h-10 text-[13px] font-bold whitespace-nowrap transition-colors ${active ? 'text-textp' : 'text-texts hover:text-textp'}`}
          >
            {label}
            {active && <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary" />}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Chip filter row ---------- */
type Chip = string | { key: string; label: string; count?: number | null }
export function ChipRow({ chips, value, onChange }: { chips: Chip[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
      {chips.map((c) => {
        const key = typeof c === 'string' ? c : c.key
        const label = typeof c === 'string' ? c : c.label
        const count = typeof c === 'object' ? c.count : null
        const active = key === value
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-bold border transition-all ${active ? 'bg-textp text-bg border-textp' : 'bg-card text-texts border-border hover:text-textp'}`}
          >
            {label}
            {count != null && <span className={`text-[11px] tabular-nums ${active ? 'text-bg/60' : 'text-texts/70'}`}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- ScoreStepper ---------- */
export function ScoreStepper({
  value, onChange, disabled = false, color = 'rgb(var(--primary))', compact = false,
}: { value: number | null | undefined; onChange: (v: number) => void; disabled?: boolean; color?: string; compact?: boolean }) {
  const set = (v: number) => !disabled && onChange(Math.max(0, Math.min(20, v)))
  const btn = compact ? 'w-7 h-7 text-base rounded-md' : 'w-9 h-9 text-xl rounded-lg'
  const disp = compact ? 'w-9 h-9 text-lg rounded-lg border' : 'w-12 h-12 text-2xl rounded-xl border-2'
  const gap = compact ? 'gap-1' : 'gap-2'
  return (
    <div className={`flex items-center ${gap}`}>
      <button
        onClick={() => set((value ?? 0) - 1)}
        disabled={disabled || (value ?? 0) <= 0}
        className={`${btn} grid place-items-center border border-border bg-surface text-texts font-bold hover:border-primary/50 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors`}
      >
        −
      </button>
      <div
        className={`${disp} grid place-items-center font-extrabold tabular-nums`}
        style={{
          color: value == null ? 'rgb(var(--texts))' : color,
          borderColor: value == null ? 'rgb(var(--border))' : color,
          background: value == null ? 'transparent' : 'rgb(var(--surface))',
        }}
      >
        {value == null ? '–' : value}
      </div>
      <button
        onClick={() => set((value ?? 0) + 1)}
        disabled={disabled}
        className={`${btn} grid place-items-center border border-border bg-surface text-texts font-bold hover:border-primary/50 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors`}
      >
        +
      </button>
    </div>
  )
}

/* ---------- Countdown (ISO kickoff) ---------- */
export function Countdown({ kickoff, className = '' }: { kickoff: string; className?: string }) {
  const [secs, setSecs] = useState(() => Math.floor((new Date(kickoff).getTime() - Date.now()) / 1000))
  useEffect(() => {
    const id = setInterval(() => setSecs(Math.floor((new Date(kickoff).getTime() - Date.now()) / 1000)), 1000)
    return () => clearInterval(id)
  }, [kickoff])

  if (secs <= 0) return <span className={`text-error font-bold ${className}`}>Kicked off</span>
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  let txt: string
  if (d > 0) txt = `${d}d ${h}h ${m}m`
  else if (h > 0) txt = `${h}h ${m}m ${String(s).padStart(2, '0')}s`
  else txt = `${m}:${String(s).padStart(2, '0')}`
  const urgent = secs < 3600
  return <span className={`tabular-nums font-bold ${urgent ? 'text-gold' : 'text-texts'} ${className}`}>{txt}</span>
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-shimmer ${className}`}
      style={{ background: 'linear-gradient(90deg, rgb(var(--surface)), rgb(var(--card)), rgb(var(--surface)))', backgroundSize: '200% 100%' }}
    />
  )
}

/* ---------- Progress bar ---------- */
export function ProgressBar({ pct, color = 'rgb(var(--primary))', height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <div className="w-full rounded-full overflow-hidden bg-surface" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

/* ---------- Section + Page headers ---------- */
export function SectionHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3 gap-3">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-textp">{title}</h2>
        {sub && <p className="text-xs text-texts mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3 pb-4 border-b border-border">
      <div>
        {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary mb-1.5">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-[28px] font-black tracking-tight leading-none">{title}</h1>
        {sub && <div className="text-texts font-medium mt-2 text-sm">{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <Card className="p-10 text-center">
      {icon && <div className="w-12 h-12 mx-auto mb-4 grid place-items-center rounded-md border border-border bg-surface text-texts">{icon}</div>}
      <h3 className="text-lg font-extrabold text-textp">{title}</h3>
      {desc && <p className="text-sm text-texts font-medium mt-1 max-w-sm mx-auto">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  )
}

/* ---------- Logo ---------- */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="grid place-items-center rounded-md shrink-0 bg-primary" style={{ width: size, height: size }}>
      <span style={{ fontSize: size * 0.5 }} className="font-black text-[#04210F] tracking-tight">XI</span>
    </div>
  )
}

/* ---------- Icons (minimal line set) ---------- */
function Icon({ d, size = 20, className = '', fill = 'none' }: { d: ReactNode; size?: number; className?: string; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {d}
    </svg>
  )
}
type IcoProps = { size?: number; className?: string }
export const LockIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>} />
)
export const HomeIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>} />
)
export const CalIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>} />
)
export const TrophyIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 18h6M10 18v-3M14 18v-3M8 21h8" /></>} />
)
export const ChartIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>} />
)
export const TreeIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><path d="M4 6h6M4 18h6M10 6v12M10 12h5M15 12h5" /></>} />
)
export const UserIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />
)
export const GridIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>} />
)
export const ShieldIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />} />
)
export const UsersIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 6M17.5 20a5.5 5.5 0 0 0-3-4.9" /></>} />
)
export const ChevDown = ({ size = 16, className }: IcoProps) => (
  <Icon size={size} className={className} d={<path d="m6 9 6 6 6-6" />} />
)
export const SearchIcon = ({ size = 18, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></>} />
)
export const BoltIcon = ({ size = 16, className }: IcoProps) => (
  <Icon size={size} className={className} fill="currentColor" d={<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="none" />} />
)
export const SunIcon = ({ size = 18, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>} />
)
export const MoonIcon = ({ size = 18, className }: IcoProps) => (
  <Icon size={size} className={className} d={<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />} />
)
