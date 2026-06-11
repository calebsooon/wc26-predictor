'use client'

/* ============================================================
   MatchDay — UI primitives (Dark Stadium Analytics)
   Ported from the Claude Design bundle to typed React/Tailwind.
   All colours are token-driven so they flip light/dark automatically.
   ============================================================ */

import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [imgError, setImgError] = useState(false)
  const color = you ? 'rgb(var(--blue))' : 'rgb(var(--primary))'
  if (src && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: ring ? `2px solid ${color}` : undefined }}
        onError={() => setImgError(true)}
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

/* ---------- Modal (generic overlay) ---------- */
export function Modal({
  open, onClose, title, children, maxWidth = 'max-w-lg',
}: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; maxWidth?: string }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full ${maxWidth} bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between gap-3 px-5 h-14 shrink-0 border-b border-border bg-surface">
          <h2 className="font-extrabold text-textp text-[15px] truncate">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-texts hover:text-textp p-1 -mr-1 shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
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
      {accent !== 'default' && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c }} />
          <div className="absolute -right-8 -top-10 w-28 h-28 rounded-full blur-2xl opacity-[0.10] pointer-events-none" style={{ background: c }} />
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-texts">{label}</span>
        {icon && <span className="text-texts/70">{icon}</span>}
      </div>
      <div className="mt-2.5 text-[30px] font-extrabold tabular-nums leading-none" style={{ color: c }}>{value}</div>
      {sub && <div className="mt-2 text-xs text-texts font-medium">{sub}</div>}
    </div>
  )
}

/* ---------- LeagueBadge (custom label + colour chip) ---------- */
function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
}
export function LeagueBadge({
  name, color, money = false, className = '',
}: { name?: string | null; color?: string | null; money?: boolean; className?: string }) {
  const label = name ?? (money ? 'Money' : 'League')
  const c = color ?? (money ? '#EAB308' : '#22C55E')
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold border whitespace-nowrap ${className}`}
      style={{ color: c, borderColor: hexAlpha(c, 0.4), background: hexAlpha(c, 0.12) }}
    >
      {label}{money && ' 💰'}
    </span>
  )
}

/* ---------- CountUp (animated number, respects reduced motion) ---------- */
export function CountUp({ value, duration = 700, prefix = '', className = '' }: { value: number; duration?: number; prefix?: string; className?: string }) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || duration <= 0) { setDisplay(value); fromRef.current = value; return }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className={className}>{prefix}{display}</span>
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
  const pill =
    status === 'missing'   ? <Pill tone="red" icon={<span>●</span>}>Missing</Pill> :
    status === 'submitted' ? <Pill tone="blue">✓ Submitted</Pill> :
    status === 'locked'    ? <Pill tone="default" icon={<LockIcon size={11} />}>Locked</Pill> :
    status === 'scored'    ? <Pill tone="green">+{pts ?? 0} pts</Pill> : null

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={status + (pts ?? '')}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={
          status === 'scored'
            ? { type: 'spring', stiffness: 500, damping: 18 }
            : { duration: 0.15 }
        }
        className="inline-flex"
      >
        {pill}
      </motion.div>
    </AnimatePresence>
  )
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
  min = 0, max = 20,
}: {
  value: number | null | undefined; onChange: (v: number) => void
  disabled?: boolean; color?: string; compact?: boolean; min?: number; max?: number
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const skipSync = useRef(false)
  const allowNeg = min < 0

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return }
    setDraft(value == null ? '' : String(value))
  }, [value])

  const set = (v: number) => {
    if (disabled) return
    const clamped = Math.max(min, Math.min(max, v))
    skipSync.current = true
    setDraft(String(clamped))
    onChange(clamped)
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value
    if (allowNeg) {
      raw = raw.replace(/[^0-9-]/g, '')
      // keep at most one leading minus
      const neg = raw.startsWith('-')
      raw = (neg ? '-' : '') + raw.replace(/-/g, '')
      raw = raw.slice(0, 4) // "-20" = 3 chars max
    } else {
      raw = raw.replace(/[^0-9]/g, '').slice(0, 2)
    }
    setDraft(raw)
    if (raw === '' || raw === '-') return
    const n = parseInt(raw, 10)
    if (!isNaN(n)) { skipSync.current = true; onChange(Math.max(min, Math.min(max, n))) }
  }

  function handleBlur() {
    if (draft === '' || draft === '-') setDraft(value == null ? '' : String(value))
  }

  const btn = compact ? 'w-7 h-7 text-base rounded-md' : 'w-9 h-9 text-xl rounded-lg'
  const disp = compact ? 'w-10 h-8 text-base rounded-lg' : 'w-12 h-12 text-2xl rounded-xl'
  const border = compact ? 'border' : 'border-2'
  const gap = compact ? 'gap-1' : 'gap-2'
  return (
    <div className={`flex items-center ${gap}`}>
      <motion.button
        whileTap={{ scale: 0.82 }}
        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        onClick={() => set((value ?? 0) - 1)}
        disabled={disabled || (value ?? 0) <= min}
        className={`${btn} grid place-items-center border border-border bg-surface text-texts font-bold hover:border-primary/50 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors`}
      >
        −
      </motion.button>
      <motion.div
        key={value ?? 'null'}
        initial={{ scale: 0.65, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={`${disp} ${border} grid place-items-center`}
        style={{
          borderColor: value == null ? 'rgb(var(--border))' : color,
          background: value == null ? 'transparent' : 'rgb(var(--surface))',
        }}
      >
        <input
          type="text"
          inputMode={allowNeg ? 'text' : 'numeric'}
          pattern={allowNeg ? '[\\-0-9]*' : '[0-9]*'}
          maxLength={allowNeg ? 4 : 2}
          value={draft}
          onChange={handleInput}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder="–"
          className="w-full h-full text-center font-extrabold tabular-nums bg-transparent focus:outline-none disabled:pointer-events-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          style={{ color: value == null ? 'rgb(var(--texts))' : color }}
        />
      </motion.div>
      <motion.button
        whileTap={{ scale: 0.82 }}
        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        onClick={() => set((value ?? 0) + 1)}
        disabled={disabled || (value ?? 0) >= max}
        className={`${btn} grid place-items-center border border-border bg-surface text-texts font-bold hover:border-primary/50 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors`}
      >
        +
      </motion.button>
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
/* ---------- StaggerList — animates children in with a cascade ---------- */
const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
const staggerItem: import('framer-motion').Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0, 0, 1] } },
}
export function StaggerList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  )
}
export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  )
}

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
      <span style={{ fontSize: size * 0.5 }} className="font-black text-[#04210F] tracking-tight">MD</span>
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
export const HelpIcon = ({ size = 20, className }: IcoProps) => (
  <Icon size={size} className={className} d={<><circle cx="12" cy="12" r="9" /><path d="M9.2 9.3a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 2.3-2.6 4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" /></>} />
)
