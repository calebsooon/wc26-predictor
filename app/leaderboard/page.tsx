'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader, Tabs, Card, Skeleton, EmptyState, TrophyIcon, Avatar, LeagueBadge, Pill, ChipRow } from '@/components/ui'
import { LeaderboardTable, type LBRow } from '@/components/football'
import { aggregateLeaderboard, type ProfileLite } from '@/lib/leaderboard'
import { getActiveLeague, getMyLeagues, setActiveLeague, isMoneyLeague, type League, type LeagueLabel } from '@/lib/league'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { GW_NAMES, GW_SHORT, GW_PRIZES, OVERALL_PRIZES, formatPrize, prizeTone } from '@/lib/prizes'
import { getTeam } from '@/lib/teams'

const PRED_COLS = 'user_id, points_awarded, pts_outcome, pts_exact, pts_goal_diff, pts_total_goals, pts_team_goals, pts_btts, pts_first_team, pts_first_scorer, matches(gw_number)'

interface PredRow {
  user_id: string
  points_awarded: number
  pts_outcome: number | null
  pts_exact: number | null
  pts_goal_diff: number | null
  pts_total_goals: number | null
  pts_btts: number | null
  pts_first_team: number | null
  pts_first_scorer: number | null
  profiles?: { username: string; avatar_url: string | null } | null
  matches: { gw_number: number | null } | null
}
interface SnapRow { user_id: string; rank: number; snapshot_at: string }

interface PickMatch {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
}

interface PickPred {
  match_id: string
  user_id: string
  pred_home: number | null
  pred_away: number | null
  points_awarded: number | null
}

const GW_TABS = [
  { key: 'all', label: 'Overall' },
  ...Array.from({ length: 8 }, (_, i) => ({ key: String(i + 1), label: GW_SHORT[i + 1] })),
]

const VIEW_TABS = [
  { key: 'standings', label: 'Standings' },
  { key: 'picks', label: 'Picks' },
]

export default function LeaderboardPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<PredRow[]>([])
  const [members, setMembers] = useState<ProfileLite[]>([])
  const memberIdsRef = useRef<string[]>([])
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [leagueName, setLeagueName] = useState<string>('')
  const [leagueLabel, setLeagueLabel] = useState<LeagueLabel | null>(null)
  const [isMoney, setIsMoney] = useState(false)
  const [revealPicks, setRevealPicks] = useState(false)
  const [myLeagues, setMyLeagues] = useState<League[]>([])
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null)
  const [prevRanks, setPrevRanks] = useState<Map<string, number>>(new Map())
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState('all')        // GW tab
  const [view, setView] = useState('standings') // standings | picks
  const [loading, setLoading] = useState(true)

  // Picks tab state
  const [pickMatches, setPickMatches] = useState<PickMatch[]>([])
  const [pickPreds, setPickPreds] = useState<PickPred[]>([])
  const [picksLoading, setPicksLoading] = useState(false)

  async function applyLeague(uid: string) {
    const { league, weights: w, memberIds: ids, memberProfiles } = await getActiveLeague(supabase, uid)
    setWeights(w)
    setMembers(memberProfiles)
    memberIdsRef.current = ids
    setLeagueName(league?.name ?? '')
    setLeagueLabel(league?.league_labels ?? null)
    setIsMoney(isMoneyLeague(league))
    setRevealPicks(league?.reveal_predictions === true)
    setActiveLeagueId(league?.id ?? null)
    // Reset to standings if reveal is off
    if (!league?.reveal_predictions) setView('standings')
    await Promise.all([fetchRows(ids), fetchSnaps(league?.id ?? null)])
  }

  async function switchLeague(id: string) {
    if (!userId || id === activeLeagueId) return
    await setActiveLeague(supabase, userId, id)
    setLoading(true)
    await applyLeague(userId)
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        setUserId(user.id)
        setMyLeagues(await getMyLeagues(supabase, user.id))
        await applyLeague(user.id)
      } catch {
        // non-fatal — empty state will show
      } finally {
        setLoading(false)
      }
    }
    load()
    const channel = supabase.channel('lb').on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => { if (memberIdsRef.current.length) fetchRows(memberIdsRef.current) }).subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load picks data when picks tab is activated
  useEffect(() => {
    if (view !== 'picks' || !revealPicks || members.length === 0) return
    loadPicks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, revealPicks, members])

  async function loadPicks() {
    setPicksLoading(true)
    try {
      const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('id, match_date, home_team, away_team, real_home_score, real_away_score, is_locked, group_name')
        .order('match_date', { ascending: true })
        .limit(30)
      if (mErr) throw mErr
      setPickMatches((matches ?? []) as PickMatch[])

      if (matches && matches.length > 0) {
        const matchIds = (matches as PickMatch[]).map((m) => m.id)
        const { data: preds, error: pErr } = await supabase
          .from('predictions')
          .select('match_id, user_id, pred_home, pred_away, points_awarded')
          .in('match_id', matchIds)
          .in('user_id', memberIdsRef.current)
        if (pErr) throw pErr
        setPickPreds((preds ?? []) as PickPred[])
      }
    } catch {
      // picks are non-critical — silently degrade, skeleton clears
    } finally {
      setPicksLoading(false)
    }
  }

  async function fetchRows(ids: string[]) {
    if (ids.length === 0) { setRows([]); return }
    const { data, error } = await supabase
      .from('predictions')
      .select(PRED_COLS)
      .not('points_awarded', 'is', null)
      .in('user_id', ids)
    if (!error) setRows((data ?? []) as unknown as PredRow[])
  }

  async function fetchSnaps(leagueId: string | null) {
    if (!leagueId) { setPrevRanks(new Map()); return }
    const { data: snaps, error } = await supabase
      .from('rank_snapshots')
      .select('user_id, rank, snapshot_at')
      .eq('league_id', leagueId)
      .order('snapshot_at', { ascending: false })
      .limit(200)
    if (error) return
    if (snaps && snaps.length > 0) {
      const latest = (snaps[0] as SnapRow).snapshot_at
      const map = new Map<string, number>()
      for (const s of snaps as SnapRow[]) if (s.snapshot_at === latest) map.set(s.user_id, s.rank)
      setPrevRanks(map)
    } else {
      setPrevRanks(new Map())
    }
  }

  const board = useMemo<LBRow[]>(() => {
    const gwNum = tab === 'all' ? null : parseInt(tab)
    const prizes = tab === 'all' ? OVERALL_PRIZES : GW_PRIZES
    const sorted = aggregateLeaderboard({ scoredPreds: rows, profiles: members, userId, gwNumber: gwNum, weights })
    return sorted.map((r, currentIdx) => {
      const prevRank = prevRanks.get(r.id)
      const move = prevRank != null ? prevRank - (currentIdx + 1) : undefined
      const prize = isMoney ? prizes[Math.min(currentIdx, 6)] : undefined
      return { ...r, move, prize }
    })
  }, [rows, tab, userId, prevRanks, members, weights, isMoney])

  const podium = board.slice(0, 3)
  const hasSnapshots = prevRanks.size > 0
  const gwLabel = tab === 'all' ? 'Overall' : (GW_NAMES[parseInt(tab)] ?? tab)
  const myIdx = board.findIndex((r) => r.you)
  const srStatus = myIdx >= 0 ? `You are ranked ${myIdx + 1} of ${board.length}${leagueName ? ` in ${leagueName}` : ''} with ${board[myIdx].pts} points.` : ''

  if (loading) {
    return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Standings"
        title="Leaderboard"
        sub={view === 'picks' ? 'Everyone\'s pregame picks for upcoming matches' : tab === 'all' ? (isMoney ? 'Overall season standings + prize pool' : 'Overall season standings') : gwLabel}
        action={leagueName ? <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-textp">{leagueName}<LeagueBadge name={leagueLabel?.name} color={leagueLabel?.color} money={isMoney} /></span> : undefined}
      />

      <p className="sr-only" role="status" aria-live="polite">{srStatus}</p>

      {myLeagues.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 no-scrollbar pb-0.5">
          {myLeagues.map((l) => {
            const active = l.id === activeLeagueId
            return (
              <button
                key={l.id}
                onClick={() => switchLeague(l.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-full border text-[13px] font-bold transition-colors ${active ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-surface text-texts hover:text-textp'}`}
              >
                {l.name}
                <LeagueBadge name={l.league_labels?.name} color={l.league_labels?.color} money={isMoneyLeague(l)} />
              </button>
            )
          })}
        </div>
      )}

      {/* Top-level view switcher — only show Picks tab if league has reveal on */}
      {revealPicks && (
        <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border w-fit">
          {VIEW_TABS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-4 h-8 rounded-lg text-sm font-bold transition-all ${view === v.key ? 'bg-card text-textp shadow-sm' : 'text-texts hover:text-textp'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {view === 'picks' ? (
        <PicksView
          matches={pickMatches}
          preds={pickPreds}
          members={members}
          userId={userId}
          loading={picksLoading}
        />
      ) : (
        <>
          <div className="overflow-x-auto -mx-4 px-4">
            <Tabs tabs={GW_TABS} value={tab} onChange={setTab} />
          </div>

          {board.length === 0 ? (
            <EmptyState icon={<TrophyIcon size={22} />} title="No players yet" desc="Players will appear here once they sign up." />
          ) : (
            <>
              {podium.length >= 3 && (
                <div className="grid grid-cols-3 gap-3">
                  {[podium[1], podium[0], podium[2]].map((p, idx) => {
                    const place = idx === 1 ? 1 : idx === 0 ? 2 : 3
                    const color = place === 1 ? 'rgb(var(--gold))' : place === 2 ? '#94A3B8' : '#D9A066'
                    const prizeAmt = (tab === 'all' ? OVERALL_PRIZES : GW_PRIZES)[Math.min(place - 1, 6)]
                    const prizeLabel = formatPrize(prizeAmt)
                    const tone = prizeTone(prizeAmt)
                    const prizeColor = tone === 'green' ? 'rgb(var(--success))' : tone === 'red' ? 'rgb(var(--error))' : 'rgb(var(--texts))'
                    return (
                      <Card key={p.id} className={`p-4 text-center ${place === 1 ? 'sm:-mt-3' : ''} ${p.you ? 'border-blue/40' : ''}`}>
                        <div className="text-xs font-black mb-2" style={{ color }}>{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
                        <div className="flex justify-center mb-2"><Avatar name={p.name} src={p.avatar} size={44} ring={place === 1} you={p.you} /></div>
                        <div className="font-bold text-sm truncate" style={place === 1 ? { color } : undefined}>{p.name}</div>
                        <div className="text-2xl font-extrabold tabular-nums mt-1" style={{ color }}>{p.pts}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-texts mb-1">points</div>
                        {isMoney && <>
                          <div className="text-sm font-extrabold tabular-nums" style={{ color: prizeColor }}>{prizeLabel}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-texts">prize</div>
                        </>}
                      </Card>
                    )
                  })}
                </div>
              )}

              <Card className="overflow-hidden">
                <div className="px-1 py-1">
                  <LeaderboardTable players={board} metricLabel="PTS" showMove={hasSnapshots} showPrize={isMoney} />
                </div>
              </Card>

              <div className="px-1">
                <p className="text-[11px] text-texts font-medium">
                  Tiebreaker: most correct outcomes, then alphabetical.{isMoney ? ' Prize pool per GW: 1st +$15 · 2nd +$10 · 3rd +$5 · 4th $0 · 5th -$5 · 6th -$10 · 7th -$15. Overall: 1st +$40 · 7th -$40.' : ' This is a points-only league — no prize pool.'}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   Picks view — one card per match, one row per member
   ────────────────────────────────────────────── */
function PicksView({
  matches, preds, members, userId, loading,
}: {
  matches: PickMatch[]
  preds: PickPred[]
  members: ProfileLite[]
  userId: string | null
  loading: boolean
}) {
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')

  const predMap = useMemo(() => {
    const m = new Map<string, PickPred>() // key: `matchId|userId`
    for (const p of preds) m.set(`${p.match_id}|${p.user_id}`, p)
    return m
  }, [preds])

  const displayed = useMemo(() => {
    if (filter === 'upcoming') return matches.filter((m) => !m.real_home_score && !m.real_away_score && !m.is_locked)
    return matches
  }, [matches, filter])

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
  }

  if (displayed.length === 0) {
    return <EmptyState icon={<TrophyIcon size={22} />} title="No upcoming matches" desc="Picks will appear here for matches not yet kicked off." />
  }

  return (
    <div className="space-y-3">
      <ChipRow
        chips={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'all', label: 'All' }]}
        value={filter}
        onChange={(v) => setFilter(v as 'upcoming' | 'all')}
      />

      {displayed.map((m) => {
        const home = getTeam(m.home_team)
        const away = getTeam(m.away_team)
        const kickoff = new Date(m.match_date)
        const isScored = m.real_home_score !== null && m.real_away_score !== null
        const stageLabel = m.group_name ? `Group ${m.group_name}` : 'Knockout'

        return (
          <Card key={m.id} className="p-4">
            {/* Match header */}
            <div className="flex items-center gap-3 mb-3">
              <Pill tone={m.group_name ? 'default' : 'gold'}>{stageLabel}</Pill>
              <span className="text-[11px] text-texts font-medium">
                {kickoff.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}
                {' · '}
                {kickoff.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false })}
              </span>
              {isScored ? (
                <Pill tone="green" className="ml-auto">{m.real_home_score}–{m.real_away_score} FT</Pill>
              ) : m.is_locked ? (
                <Pill tone="default" className="ml-auto">Locked</Pill>
              ) : null}
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">{home.flag}</span>
                <span className="font-bold text-textp">{home.name}</span>
              </div>
              <span className="text-texts font-bold text-sm px-2">vs</span>
              <div className="flex items-center gap-2 flex-row-reverse">
                <span className="text-2xl leading-none">{away.flag}</span>
                <span className="font-bold text-textp text-right">{away.name}</span>
              </div>
            </div>

            {/* Member picks — always visible when reveal_predictions is on */}
            <div className="divide-y divide-border/40">
              {members.map((member) => {
                const pick = predMap.get(`${m.id}|${member.id}`)
                const isMe = member.id === userId
                const scored = pick?.points_awarded != null
                return (
                  <div key={member.id} className={`flex items-center gap-3 py-2 ${isMe ? 'bg-blue/[0.04] -mx-4 px-4' : ''}`}>
                    <Avatar name={member.username ?? '?'} src={member.avatar_url} size={26} you={isMe} />
                    <span className={`flex-1 text-[13px] font-semibold truncate ${isMe ? 'text-primary' : 'text-textp'}`}>
                      {member.username ?? '?'}{isMe ? ' (you)' : ''}
                    </span>
                    {pick?.pred_home != null && pick?.pred_away != null ? (
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold tabular-nums text-sm text-textp">
                          {pick.pred_home}–{pick.pred_away}
                        </span>
                        {scored && (
                          <span className={`text-[11px] font-bold tabular-nums ${(pick.points_awarded ?? 0) >= 8 ? 'text-primary' : (pick.points_awarded ?? 0) > 0 ? 'text-gold' : 'text-error'}`}>
                            +{pick.points_awarded}pts
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-texts font-medium italic">no pick</span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
