'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import { Skeleton } from '@/components/ui'
import ThemeToggle from '@/components/ThemeToggle'
import FlagChip from '@/components/FlagChip'
import { getActiveLeague } from '@/lib/league'
import { DEFAULT_WEIGHTS, weightedGroupPoints, type ScoringWeights } from '@/lib/scoring'

interface Match {
  id: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  group_name: string
  gameweek: number
  match_date: string
}

interface GroupPredRow { group_name: string; ranked_codes: string[]; points_awarded: number | null }

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

function getTeamsInGroup(matches: Match[], group: string): string[] {
  const set = new Set<string>()
  for (const m of matches) {
    if (m.group_name === group) { set.add(m.home_team); set.add(m.away_team) }
  }
  return Array.from(set)
}

function buildRanking(matches: Match[], group: string): string[] {
  const map = new Map<string, { team: string; pts: number; gd: number; gf: number }>()
  const ensure = (t: string) => {
    if (!map.has(t)) map.set(t, { team: t, pts: 0, gd: 0, gf: 0 })
    return map.get(t)!
  }
  for (const m of matches) {
    if (m.group_name !== group) continue
    ensure(m.home_team); ensure(m.away_team)
    if (m.real_home_score === null || m.real_away_score === null) continue
    const home = ensure(m.home_team), away = ensure(m.away_team)
    const rh = m.real_home_score, ra = m.real_away_score
    home.gf += rh; home.gd += rh - ra
    away.gf += ra; away.gd += ra - rh
    if (rh > ra) { home.pts += 3 }
    else if (rh < ra) { away.pts += 3 }
    else { home.pts++; away.pts++ }
  }
  return Array.from(map.values())
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
    .map((r) => r.team)
}

function isGroupComplete(matches: Match[], group: string): boolean {
  const gMatches = matches.filter((m) => m.group_name === group)
  return gMatches.length > 0 && gMatches.every((m) => m.real_home_score !== null)
}

// Sort/reorder icon
function SortIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6L8 18M8 6L5 9M8 6L11 9" />
      <path d="M16 18L16 6M16 18L13 15M16 18L19 15" />
    </svg>
  )
}

// Up/down chevron buttons
function ArrowBtn({ onClick, disabled, dir }: { onClick: () => void; disabled: boolean; dir: 'up' | 'down' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid place-items-center p-0 border-0 bg-transparent rounded-[5px] transition-colors hover:bg-surface3 hover:text-primary disabled:hover:bg-transparent"
      style={{
        width: 22,
        height: 16,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'rgba(var(--faint),0.35)' : 'rgb(var(--faint))',
      }}
      aria-label={dir === 'up' ? 'Move up' : 'Move down'}
    >
      {dir === 'up' ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 15L12 9L6 15" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9L12 15L18 9" />
        </svg>
      )}
    </button>
  )
}

interface StandingRow { code: string; pts: number; gd: number; gf: number }

function computeStandings(matches: Match[], group: string): StandingRow[] {
  const map = new Map<string, StandingRow>()
  const ensure = (t: string) => {
    if (!map.has(t)) map.set(t, { code: t, pts: 0, gd: 0, gf: 0 })
    return map.get(t)!
  }
  for (const m of matches) {
    if (m.group_name !== group || m.real_home_score == null || m.real_away_score == null) continue
    const home = ensure(m.home_team), away = ensure(m.away_team)
    const hs = m.real_home_score, as_ = m.real_away_score
    home.gf += hs; home.gd += hs - as_
    away.gf += as_; away.gd += as_ - hs
    if (hs > as_) { home.pts += 3 }
    else if (hs === as_) { home.pts++; away.pts++ }
    else { away.pts += 3 }
  }
  return Array.from(map.values()).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
}

interface GroupCardProps {
  groupName: string
  matches: Match[]
  pred: GroupPredRow | undefined
  userId: string | null
  weights: ScoringWeights
  activeTab: 'pred' | 'stand'
  onSave: (group: string, order: string[]) => Promise<void>
}

function GroupCard({ groupName, matches, pred, userId, weights, activeTab, onSave }: GroupCardProps) {
  const settled = isGroupComplete(matches, groupName)
  const resultRanking = useMemo(() => buildRanking(matches, groupName), [matches, groupName])
  const defaultOrder = useMemo(() => {
    if (pred?.ranked_codes?.length) return pred.ranked_codes
    const teams = getTeamsInGroup(matches, groupName)
    return teams
  }, [pred, matches, groupName])

  const [order, setOrder] = useState<string[]>(defaultOrder)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const standingsRows = useMemo(() => computeStandings(matches, groupName), [matches, groupName])
  const hasStandings = standingsRows.length > 0
  const displayStandingsRows = useMemo(() => {
    if (hasStandings) return standingsRows
    return defaultOrder.map((code) => ({ code, pts: 0, gd: 0, gf: 0 }))
  }, [defaultOrder, hasStandings, standingsRows])

  useEffect(() => {
    setOrder(defaultOrder)
  }, [defaultOrder])

  function move(i: number, dir: -1 | 1) {
    setOrder((o) => {
      const n = [...o]; const j = i + dir
      if (j < 0 || j >= n.length) return o
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  }

  async function handleSave() {
    if (!userId || order.length === 0) return
    setSaving(true)
    try {
      await onSave(groupName, order)
      setSavedMsg('Saved')
    } catch {
      setSavedMsg('Error')
    } finally {
      setSaving(false)
      setTimeout(() => setSavedMsg(null), 2000)
    }
  }

  const ptsAwarded = pred?.points_awarded ?? null
  const displayPts = ptsAwarded !== null ? weightedGroupPoints(ptsAwarded, weights) : null

  // Badge
  const badge = settled && displayPts !== null ? (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      padding: '3px 9px',
      borderRadius: 20,
      background: 'rgba(var(--primary),0.14)',
      color: 'rgb(var(--primary))',
      border: '1px solid rgba(var(--primary),0.25)',
      fontFamily: 'var(--font-display, inherit)',
    }}>
      ✓ +{displayPts} pts
    </span>
  ) : activeTab === 'pred' ? (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '3px 9px',
      borderRadius: 20,
      background: 'rgb(var(--surface2))',
      color: 'rgb(var(--texts))',
      border: '1px solid rgb(var(--border))',
      fontFamily: 'var(--font-display, inherit)',
    }}>
      Editable
    </span>
  ) : null

  const displayTeams = settled ? resultRanking : order

  return (
    <div style={{
      background: 'rgb(var(--card))',
      border: '1px solid rgb(var(--border))',
      boxShadow: 'var(--card-shadow)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgb(var(--border))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'var(--font-display, inherit)',
          color: 'rgb(var(--textp))',
        }}>
          Group {groupName}
        </span>
        {badge}
      </div>

      {/* Card body */}
      <div style={{ padding: 8 }}>
        {activeTab === 'stand' ? (
          /* ── Standings tab ── */
          <>
            {!hasStandings && (
              <div style={{
                padding: '6px 10px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgb(var(--texts))',
              }}>
                No results yet
              </div>
            )}
            {displayStandingsRows.map((row, i) => {
              const t = getTeam(row.code)
              const qualifying = i < 2
              return (
                <div
                  key={row.code}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '9px 10px',
                    borderRadius: 11,
                    background: qualifying ? 'rgba(var(--primary),0.05)' : 'transparent',
                  }}
                >
                  {qualifying && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 6,
                      bottom: 6,
                      width: 3,
                      borderRadius: '0 999px 999px 0',
                      background: 'rgb(var(--primary))',
                    }} />
                  )}
                  {/* Position */}
                  <span style={{
                    width: 18,
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                    fontFamily: 'var(--font-display, inherit)',
                    color: qualifying ? 'rgb(var(--primary))' : 'rgb(var(--texts))',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>

                  <FlagChip code={t.code} w={30} h={20} r={5} />

                  <span style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: 'var(--font-display, inherit)',
                    color: 'rgb(var(--textp))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>

                  {/* Goal diff */}
                  <span style={{
                    fontSize: 11,
                    color: 'rgb(var(--texts))',
                    minWidth: 28,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {row.gd > 0 ? '+' : ''}{row.gd}
                  </span>

                  {/* Points badge */}
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    minWidth: 24,
                    textAlign: 'right',
                    flexShrink: 0,
                    fontFamily: 'var(--font-display, inherit)',
                    color: 'rgb(var(--textp))',
                  }}>
                    {row.pts}
                  </span>
                </div>
              )
            })}
          </>
        ) : (
          /* ── Prediction tab ── */
          <>
            {displayTeams.map((code, i) => {
              const t = getTeam(code)
              const isCorrect = settled && resultRanking[i] === code

              let resultLabel: React.ReactNode = null
              if (settled) {
                const suffix = ['1st', '2nd', '3rd', '4th'][i] ?? `${i + 1}th`
                const myPredPos = pred?.ranked_codes?.indexOf(code) ?? -1
                const predCorrect = myPredPos === i
                resultLabel = (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: predCorrect ? 'rgb(var(--primary))' : 'rgb(var(--coral))',
                    whiteSpace: 'nowrap',
                  }}>
                    {predCorrect ? '✓' : '✕'} {suffix}
                  </span>
                )
              }

              void isCorrect

              return (
                <div
                  key={code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '9px 10px',
                    borderRadius: 11,
                    background: (settled && pred?.ranked_codes?.[i] === code)
                      ? 'rgba(var(--primary),0.06)'
                      : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Position number */}
                  <span style={{
                    width: 18,
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                    fontFamily: 'var(--font-display, inherit)',
                    color: i === 0 ? 'rgb(var(--gold))' : 'rgb(var(--texts))',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>

                  <FlagChip code={t.code} w={30} h={20} r={5} />

                  <span style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: 'var(--font-display, inherit)',
                    color: 'rgb(var(--textp))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>

                  {settled ? resultLabel : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <ArrowBtn dir="up" disabled={i === 0} onClick={() => move(i, -1)} />
                      <ArrowBtn dir="down" disabled={i === displayTeams.length - 1} onClick={() => move(i, 1)} />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Save button row for editable groups */}
            {!settled && userId && (
              <div style={{ padding: '6px 10px 2px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                {savedMsg && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: savedMsg === 'Saved' ? 'rgb(var(--primary))' : 'rgb(var(--coral))' }}>
                    {savedMsg === 'Saved' ? '✓ Saved' : 'Error'}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || order.length === 0}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '5px 14px',
                    borderRadius: 8,
                    background: 'rgb(var(--primary))',
                    color: '#fff',
                    border: 'none',
                    cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                    fontFamily: 'var(--font-display, inherit)',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function GroupsPage() {
  const supabase = createClient()
  const [matches, setMatches] = useState<Match[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [savedPreds, setSavedPreds] = useState<Record<string, GroupPredRow>>({})
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [activeTab, setActiveTab] = useState<'pred' | 'stand'>('stand')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUserId(user?.id ?? null)
        const { data, error: matchErr } = await supabase
          .from('matches')
          .select('id, home_team, away_team, real_home_score, real_away_score, group_name, gameweek, match_date')
          .not('group_name', 'is', null)
          .order('match_date')
        if (matchErr) throw matchErr
        if (data) setMatches(data as Match[])
        if (user) {
          const [{ data: gp, error: gpErr }, active] = await Promise.all([
            supabase
              .from('group_predictions')
              .select('group_name, ranked_codes, points_awarded')
              .eq('user_id', user.id),
            getActiveLeague(supabase, user.id),
          ])
          if (gpErr) throw gpErr
          setWeights(active.weights)
          const map: Record<string, GroupPredRow> = {}
          for (const r of (gp ?? []) as GroupPredRow[]) map[r.group_name] = r
          setSavedPreds(map)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load groups')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveGroup(group: string, order: string[]) {
    if (!userId || order.length === 0) return
    const { error } = await supabase.from('group_predictions').upsert(
      { user_id: userId, group_name: group, ranked_codes: order, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,group_name' },
    )
    if (error) throw new Error(error.message)
    setSavedPreds((s) => ({
      ...s,
      [group]: { group_name: group, ranked_codes: order, points_awarded: s[group]?.points_awarded ?? null },
    }))
  }

  const totalProjectedPts = useMemo(() => {
    let total = 0
    for (const g of GROUPS) {
      const pred = savedPreds[g]
      if (pred?.points_awarded != null) {
        total += weightedGroupPoints(pred.points_awarded, weights)
      }
    }
    return total
  }, [savedPreds, weights])

  const hasSomePts = useMemo(() =>
    GROUPS.some((g) => savedPreds[g]?.points_awarded != null),
    [savedPreds],
  )

  if (loading) {
    return (
      <div style={{ padding: '24px 30px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1000, margin: '0 auto' }}>
          {GROUPS.map((g) => <Skeleton key={g} className="h-56 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px 30px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'rgb(var(--texts))' }}>{error}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div style={{
        padding: '20px 30px 0',
        maxWidth: 1000,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <p style={{
            fontSize: '10.5px',
            textTransform: 'uppercase',
            letterSpacing: '0.13em',
            fontWeight: 600,
            color: 'rgb(var(--primary))',
            marginBottom: 4,
          }}>
            +2 per correct position · up to 8 / group
          </p>
          <h1 style={{
            fontSize: 21,
            fontWeight: 700,
            fontFamily: 'var(--font-display, inherit)',
            color: 'rgb(var(--textp))',
            margin: 0,
          }}>
            Group predictor
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['pred', 'stand'] as const).map((tab) => {
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: isActive
                      ? '1px solid rgb(var(--textp))'
                      : '1px solid rgb(var(--border))',
                    background: isActive
                      ? 'rgb(var(--textp))'
                      : 'rgb(var(--surface2))',
                    color: isActive
                      ? 'rgb(var(--bg))'
                      : 'rgb(var(--texts))',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    fontFamily: 'var(--font-display, inherit)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab === 'pred' ? 'Prediction' : 'Standings'}
                </button>
              )
            })}
          </div>
          {hasSomePts && (
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '5px 12px',
              borderRadius: 20,
              background: 'rgba(var(--gold),0.13)',
              color: 'rgb(var(--gold))',
              border: '1px solid rgba(var(--gold),0.3)',
              whiteSpace: 'nowrap',
            }}>
              {totalProjectedPts} pts projected
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Info banner */}
      {activeTab === 'pred' && (
        <div style={{
          maxWidth: 1000,
          margin: '16px auto 0',
          padding: '0 30px',
        }}>
          <div style={{
            borderRadius: 14,
            padding: '13px 18px',
            background: 'rgba(var(--blue),0.07)',
            border: '1px solid rgba(var(--blue),0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ color: 'rgb(var(--blue))', flexShrink: 0 }}>
              <SortIcon />
            </span>
            <p style={{ fontSize: 13, color: 'rgb(var(--textp))', margin: 0, lineHeight: 1.5 }}>
              Drag with the arrows to rank each group 1st → 4th.{' '}
              <strong style={{ fontWeight: 700 }}>+2 points</strong> for every team you place in its exact finishing position.
            </p>
          </div>
        </div>
      )}

      {/* Groups grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        maxWidth: 1000,
        margin: '0 auto',
        padding: '24px 30px 60px',
      }}>
        {GROUPS.map((g) => (
          <GroupCard
            key={g}
            groupName={g}
            matches={matches}
            pred={savedPreds[g]}
            userId={userId}
            weights={weights}
            activeTab={activeTab}
            onSave={handleSaveGroup}
          />
        ))}
      </div>
    </div>
  )
}
