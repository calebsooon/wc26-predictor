'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Skeleton } from '@/components/ui'
import FlagChip from '@/components/FlagChip'
import { getTeam } from '@/lib/teams'
import { TOURNAMENT_POINTS } from '@/lib/scoring'
import ThemeToggle from '@/components/ThemeToggle'

const EB: React.CSSProperties = {
  fontSize: '10.5px',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  fontWeight: 600,
}

interface BracketRow {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  champion: string | null
  runner_up: string | null
  semi: string[]
  quarter: string[]
  r32: string[]
  pts_r32: number | null
  pts_quarter: number | null
  pts_semi: number | null
  pts_runner_up: number | null
  pts_champion: number | null
}

interface RealResults {
  r32: string[]      // 16 teams that advanced from R32
  quarter: string[]  // 8 QF teams
  semi: string[]     // 4 SF teams
  runner_up: string | null
  champion: string | null
}

function total(r: BracketRow) {
  return (r.pts_r32 ?? 0) + (r.pts_quarter ?? 0) + (r.pts_semi ?? 0) +
    (r.pts_runner_up ?? 0) + (r.pts_champion ?? 0)
}

const MAX_PTS =
  TOURNAMENT_POINTS.r32 * 16 +
  TOURNAMENT_POINTS.quarter * 8 +
  TOURNAMENT_POINTS.semi * 4 +
  TOURNAMENT_POINTS.runner_up +
  TOURNAMENT_POINTS.champion

function Badge({ pts, max, label }: { pts: number | null; max: number; label: string }) {
  const scored = pts != null
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 13,
        fontWeight: 800,
        color: scored ? (pts! > 0 ? 'rgb(var(--primary))' : 'rgb(var(--coral))') : 'rgb(var(--faint))',
      }}>
        {scored ? pts : '—'}
      </div>
      <div style={{ fontSize: 9.5, color: 'rgb(var(--texts))', fontWeight: 600, marginTop: 1 }}>{label}/{max}</div>
    </div>
  )
}

export default function BracketLeaderboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<BracketRow[]>([])
  const [results, setResults] = useState<RealResults>({ r32: [], quarter: [], semi: [], runner_up: null, champion: null })
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user?.id ?? null)

      const [{ data: preds }, { data: brData }] = await Promise.all([
        supabase
          .from('tournament_predictions')
          .select('user_id, champion, runner_up, semi, quarter, r32, pts_r32, pts_quarter, pts_semi, pts_runner_up, pts_champion, profiles(display_name, avatar_url)')
          .eq('phase', 'r32'),
        supabase
          .from('bracket_results')
          .select('champion, runner_up, semi, quarter, top16')
          .eq('id', 'wc2026')
          .maybeSingle(),
      ])

      if (brData) {
        const d = brData as Record<string, unknown>
        setResults({
          r32: (d.top16 as string[]) ?? [],
          quarter: (d.quarter as string[]) ?? [],
          semi: (d.semi as string[]) ?? [],
          runner_up: (d.runner_up as string) ?? null,
          champion: (d.champion as string) ?? null,
        })
      }

      if (preds) {
        const mapped = (preds as Record<string, unknown>[]).map((p) => {
          const profile = p.profiles as Record<string, unknown> | null
          return {
            user_id: p.user_id as string,
            display_name: (profile?.display_name as string) ?? null,
            avatar_url: (profile?.avatar_url as string) ?? null,
            champion: (p.champion as string) ?? null,
            runner_up: (p.runner_up as string) ?? null,
            semi: (p.semi as string[]) ?? [],
            quarter: (p.quarter as string[]) ?? [],
            r32: (p.r32 as string[]) ?? [],
            pts_r32: p.pts_r32 as number | null,
            pts_quarter: p.pts_quarter as number | null,
            pts_semi: p.pts_semi as number | null,
            pts_runner_up: p.pts_runner_up as number | null,
            pts_champion: p.pts_champion as number | null,
          }
        })
        mapped.sort((a, b) => total(b) - total(a))
        setRows(mapped)
      }

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const settled = results.r32.length > 0 || results.quarter.length > 0 || !!results.champion

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottom: '1px solid rgb(var(--border))' }}>
        <div>
          <div style={{ ...EB, color: 'rgb(var(--primary))', marginBottom: 8 }}>Bracket game</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, fontFamily: 'Schibsted Grotesk, sans-serif', lineHeight: 1, margin: 0 }}>Bracket standings</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: '11px',
            fontWeight: 700,
            color: 'rgb(var(--gold))',
            background: 'rgba(var(--gold),0.12)',
            border: '1px solid rgba(var(--gold),0.25)',
            whiteSpace: 'nowrap',
          }}>
            Max {MAX_PTS} pts
          </span>
          <ThemeToggle />
        </div>
      </div>

      {/* Point key */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        background: 'rgb(var(--surface2))',
        border: '1px solid rgb(var(--border))',
        borderRadius: 14,
        padding: '12px 16px',
      }}>
        {([
          { label: 'R32 advance', pts: TOURNAMENT_POINTS.r32, picks: 16 },
          { label: 'QF (R16 advance)', pts: TOURNAMENT_POINTS.quarter, picks: 8 },
          { label: 'SF (QF advance)', pts: TOURNAMENT_POINTS.semi, picks: 4 },
          { label: 'Finalist', pts: TOURNAMENT_POINTS.runner_up, picks: 1 },
          { label: 'Champion', pts: TOURNAMENT_POINTS.champion, picks: 1 },
        ]).map(({ label, pts, picks }) => (
          <span key={label} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid rgb(var(--border))',
            fontSize: 11,
            fontWeight: 700,
            color: 'rgb(var(--textp))',
            background: 'rgb(var(--card))',
          }}>
            <span style={{ color: 'rgb(var(--primary))' }}>+{pts}</span>
            {label}
            <span style={{ color: 'rgb(var(--faint))' }}>×{picks}</span>
          </span>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-[14px]" />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{
          background: 'rgb(var(--card))',
          border: '1px solid rgb(var(--border))',
          borderRadius: 16,
          padding: '32px 20px',
          textAlign: 'center',
          color: 'rgb(var(--texts))',
          fontSize: 13,
        }}>
          No bracket picks submitted yet for the R32 phase.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, idx) => {
            const pts = total(row)
            const isMe = row.user_id === myId
            const champTeam = row.champion ? getTeam(row.champion) : null

            return (
              <div key={row.user_id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: isMe ? 'rgba(var(--primary),0.06)' : 'rgb(var(--card))',
                border: isMe ? '1px solid rgba(var(--primary),0.3)' : '1px solid rgb(var(--border))',
                borderRadius: 14,
                padding: '14px 16px',
              }}>
                {/* Rank */}
                <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: idx === 0 ? 'rgb(var(--gold))' : 'rgb(var(--faint))' }}>
                    {idx + 1}
                  </span>
                </div>

                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgb(var(--surface3))',
                  overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {row.avatar_url
                    ? <img src={row.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--texts))' }}>
                        {(row.display_name ?? '?')[0].toUpperCase()}
                      </span>
                  }
                </div>

                {/* Name + champion pick */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.display_name ?? 'Unknown'}
                    {isMe && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'rgb(var(--primary))' }}>YOU</span>}
                  </div>
                  {row.champion && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <FlagChip code={row.champion} w={16} h={11} r={2} />
                      <span style={{
                        fontSize: 11,
                        color: settled && results.champion === row.champion ? 'rgb(var(--primary))' : 'rgb(var(--texts))',
                        fontWeight: 600,
                      }}>
                        {champTeam?.name ?? row.champion}
                        {settled && results.champion === row.champion && ' ✓'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Breakdown */}
                {settled && (
                  <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                    <Badge pts={row.pts_r32} max={TOURNAMENT_POINTS.r32 * 16} label="R32" />
                    <Badge pts={row.pts_quarter} max={TOURNAMENT_POINTS.quarter * 8} label="R16" />
                    <Badge pts={row.pts_semi} max={TOURNAMENT_POINTS.semi * 4} label="QF" />
                    <Badge pts={row.pts_runner_up} max={TOURNAMENT_POINTS.runner_up} label="SF" />
                    <Badge pts={row.pts_champion} max={TOURNAMENT_POINTS.champion} label="Champ" />
                  </div>
                )}

                {/* Total */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: settled ? 'rgb(var(--textp))' : 'rgb(var(--faint))' }}>
                    {settled ? pts : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgb(var(--texts))', fontWeight: 600 }}>pts</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
