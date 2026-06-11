'use client'

/* ============================================================
   MatchDay — MatchCard + LeaderboardTable (shared)
   ============================================================ */

import { motion, AnimatePresence } from 'framer-motion'
import { getTeam } from '@/lib/teams'
import {
  Card, Pill, StatusBadge, Avatar, Countdown, LockIcon, ScoreStepper,
  type PredStatus,
} from '@/components/ui'

export interface UIMatch {
  id: string
  home: string
  away: string
  kickoff: string            // ISO
  stage: string              // 'Group' or a round name
  group?: string | null
  knockout?: boolean
  status: PredStatus
  result?: { h: number; a: number } | null
  pred?: { h: number; a: number } | null
  pts?: number | null
  venue?: string | null
}

export function ScoreDisplay({ a, b, color = 'rgb(var(--textp))', size = 'text-2xl' }: { a: number | null; b: number | null; color?: string; size?: string }) {
  return (
    <div className={`flex items-center gap-1.5 font-extrabold tabular-nums ${size}`} style={{ color }}>
      <span>{a ?? '–'}</span><span className="opacity-40">:</span><span>{b ?? '–'}</span>
    </div>
  )
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-SG', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false }).format(new Date(iso))
}

export function MatchCard({ m, onClick, compact = false }: { m: UIMatch; onClick?: () => void; compact?: boolean }) {
  const home = getTeam(m.home), away = getTeam(m.away)
  const isScored = m.status === 'scored'
  const stageLabel = m.stage === 'Group' ? `Group ${m.group ?? ''}`.trim() : m.stage
  const predColor = isScored ? ((m.pts ?? 0) >= 8 ? 'rgb(var(--primary))' : (m.pts ?? 0) > 0 ? 'rgb(var(--gold))' : 'rgb(var(--error))') : 'rgb(var(--texts))'
  const kickedOff = new Date(m.kickoff) <= new Date()

  return (
    <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.12 }}>
    <Card hover onClick={onClick} className="p-4 cursor-pointer group">
      <div className="flex items-center justify-between mb-3">
        <Pill tone={m.knockout ? 'gold' : 'default'}>{stageLabel}</Pill>
        <StatusBadge status={m.status} pts={m.pts} />
      </div>

      <div className="flex items-center">
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <span className="text-[26px] leading-none shrink-0">{home.flag}</span>
          <span className="font-bold text-textp truncate">{home.name}</span>
        </div>

        <div className="px-3 text-center shrink-0">
          {isScored ? (
            <>
              <ScoreDisplay a={m.result?.h ?? null} b={m.result?.a ?? null} />
              {m.pred && (
                <div className="text-[10px] text-texts mt-0.5 font-semibold">
                  you: <span style={{ color: predColor }} className="tabular-nums">{m.pred.h}-{m.pred.a}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <div className="text-[13px] font-extrabold text-textp tabular-nums">{fmtTime(m.kickoff)}</div>
              {m.pred ? (
                <div className="text-[10px] text-blue mt-0.5 font-bold tabular-nums">picked {m.pred.h}-{m.pred.a}</div>
              ) : (
                <div className="text-[10px] text-error mt-0.5 font-bold">no pick</div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center gap-2.5 justify-end min-w-0">
          <span className="font-bold text-textp truncate text-right">{away.name}</span>
          <span className="text-[26px] leading-none shrink-0">{away.flag}</span>
        </div>
      </div>

      {!compact && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
          <span className="text-[11px] text-texts truncate font-medium">{m.venue ?? stageLabel}</span>
          {isScored ? (
            <span className="text-[11px] text-texts font-medium">{home.code} {m.result?.h}-{m.result?.a} {away.code}</span>
          ) : !kickedOff ? (
            <span className="text-[11px] flex items-center gap-1 font-semibold">
              <LockIcon size={11} className="text-texts" />
              <span className="text-texts">locks in</span> <Countdown kickoff={m.kickoff} className="text-[11px]" />
            </span>
          ) : (
            <span className="text-[11px] text-error font-bold flex items-center gap-1"><LockIcon size={11} /> Locked</span>
          )}
        </div>
      )}
    </Card>
    </motion.div>
  )
}

/* compact "next to predict" card with inline steppers */
export function NextPredictCard({
  m, pred, onChange, onOpen,
}: { m: UIMatch; pred: { h: number | null; a: number | null }; onChange: (side: 'h' | 'a', v: number) => void; onOpen: () => void }) {
  const home = getTeam(m.home), away = getTeam(m.away)
  const missing = pred.h == null || pred.a == null
  return (
    <Card hover onClick={onOpen} className={`p-4 cursor-pointer group/card ${missing ? 'border-l-2 border-l-error' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <Pill tone={m.knockout ? 'gold' : 'default'}>{m.stage === 'Group' ? `Group ${m.group ?? ''}`.trim() : m.stage}</Pill>
        {missing ? <Pill tone="red">● Missing</Pill> : <Pill tone="blue">✓ Submitted</Pill>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <span className="text-[34px] leading-none">{home.flag}</span>
          <span className="text-xs font-bold text-textp group-hover/card:text-primary transition-colors">{home.code}</span>
        </div>
        {/* Steppers must not trigger card navigation */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <ScoreStepper value={pred.h} onChange={(v) => onChange('h', v)} compact />
          <span className="text-texts font-bold px-0.5">:</span>
          <ScoreStepper value={pred.a} onChange={(v) => onChange('a', v)} compact />
        </div>
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <span className="text-[34px] leading-none">{away.flag}</span>
          <span className="text-xs font-bold text-textp group-hover/card:text-primary transition-colors">{away.code}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-border/60">
        <span className="text-[11px] text-texts font-medium">{fmtTime(m.kickoff)}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] flex items-center gap-1 font-semibold">
            <LockIcon size={11} className="text-gold" />
            <Countdown kickoff={m.kickoff} className="text-[11px]" />
          </span>
          <span className="text-[11px] font-bold text-primary group-hover/card:underline">View →</span>
        </div>
      </div>
    </Card>
  )
}

/* ---------- LeaderboardTable ---------- */
export interface LBRow {
  id: string
  name: string
  avatar?: string | null
  pts: number
  acc?: number
  exact?: number
  move?: number
  prize?: number
  you?: boolean
}

function MoveArrow({ move }: { move?: number }) {
  if (move == null || move === 0) return <span className="text-texts/50 text-xs">–</span>
  const up = move > 0
  return <span className={`text-xs font-bold tabular-nums ${up ? 'text-success' : 'text-error'}`}>{up ? '▲' : '▼'}{Math.abs(move)}</span>
}

function PrizeTag({ amount }: { amount: number }) {
  const label = amount > 0 ? `+$${amount}` : amount < 0 ? `-$${Math.abs(amount)}` : '$0'
  const cls = amount > 0 ? 'text-success' : amount < 0 ? 'text-error' : 'text-texts'
  return <span className={`text-[11px] font-extrabold tabular-nums ${cls}`}>{label}</span>
}

export function LeaderboardTable({
  players, metricLabel = 'PTS', onRow, dense = false, showMove = true, showMeta = true, showPrize = false,
}: { players: LBRow[]; metricLabel?: string; onRow?: (p: LBRow) => void; dense?: boolean; showMove?: boolean; showMeta?: boolean; showPrize?: boolean }) {
  return (
    <div className="divide-y divide-border/50">
      <AnimatePresence initial={false}>
        {players.map((p, i) => {
          const isFirst = i === 0
          const rankColor = i === 0 ? 'rgb(var(--gold))' : i === 1 ? '#94A3B8' : i === 2 ? '#D9A066' : 'rgb(var(--texts))'
          // Flash green if moved up, red if moved down
          const flashBg = p.move && p.move > 0 ? 'rgba(34,197,94,0.08)' : p.move && p.move < 0 ? 'rgba(239,68,68,0.07)' : undefined
          return (
            <motion.div
              key={p.id}
              layout
              layoutId={p.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0, backgroundColor: flashBg ?? 'transparent' }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 }, x: { duration: 0.2 } }}
              onClick={onRow ? () => onRow(p) : undefined}
              className={`flex items-center gap-3 ${dense ? 'py-2.5' : 'py-3'} px-3 ${onRow ? 'cursor-pointer hover:bg-surface/60' : ''} ${p.you ? 'bg-blue/[0.07]' : ''}`}
            >
              <div className="w-7 text-center shrink-0">
                <span className="text-sm font-extrabold tabular-nums" style={{ color: rankColor }}>{i + 1}</span>
              </div>
              <Avatar name={p.name} src={p.avatar} size={dense ? 30 : 36} ring={isFirst} you={p.you} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold truncate ${isFirst ? 'text-gold' : 'text-textp'}`}>{p.name}</span>
                  {p.you && <Pill tone="blue" className="!px-1.5 !py-0.5 !text-[9px]">YOU</Pill>}
                </div>
                {!dense && showMeta && (
                  <div className="text-[11px] text-texts font-medium tabular-nums">{p.acc ?? 0}% acc · {p.exact ?? 0} exact</div>
                )}
              </div>
              {showMove && <div className="w-8 text-center shrink-0"><MoveArrow move={p.move} /></div>}
              {showPrize && p.prize != null && (
                <div className="text-right shrink-0 w-12">
                  <PrizeTag amount={p.prize} />
                  <div className="text-[9px] text-texts font-bold tracking-wider">PRIZE</div>
                </div>
              )}
              <div className="text-right shrink-0 w-14">
                <div className={`font-extrabold tabular-nums ${isFirst ? 'text-gold' : 'text-textp'}`}>{p.pts}</div>
                <div className="text-[9px] text-texts font-bold tracking-wider">{metricLabel}</div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
