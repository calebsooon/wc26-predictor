'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getTeam } from '@/lib/teams'
import MatchModal, { type ModalMatch } from '@/components/MatchModal'
import { PageHeader, Card, Skeleton, EmptyState, TreeIcon } from '@/components/ui'

interface Match {
  id: string
  match_date: string
  home_team: string
  away_team: string
  real_home_score: number | null
  real_away_score: number | null
  is_locked: boolean
  group_name: string | null
  round_id?: string
  rounds: { name: string; order: number }
}

const ROUND_IDS = {
  R32: '00000000-0000-0000-0000-000000000002',
  R16: '00000000-0000-0000-0000-000000000003',
  QF: '00000000-0000-0000-0000-000000000004',
  SF: '00000000-0000-0000-0000-000000000005',
  BF: '00000000-0000-0000-0000-000000000006',
  FIN: '00000000-0000-0000-0000-000000000007',
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore', hour12: false }).format(new Date(iso))
}

function winner(m: Match): string | null {
  if (m.real_home_score === null || m.real_away_score === null) return null
  if (m.real_home_score > m.real_away_score) return m.home_team
  if (m.real_away_score > m.real_home_score) return m.away_team
  return null
}

function BracketCard({ match, onClick }: { match: Match | undefined; onClick?: (m: Match) => void }) {
  if (!match) {
    return <div className="w-44 rounded-xl border-2 border-dashed border-border py-3 px-3 text-center"><p className="text-xs text-texts">TBD</p></div>
  }
  const isTBC = match.home_team === 'TBC'
  const w = winner(match)
  const hasScore = match.real_home_score !== null

  const Row = ({ code, score, win }: { code: string; score: number | null; win: boolean }) => {
    const t = getTeam(code)
    return (
      <div className={`flex items-center gap-2 px-2.5 py-2 ${win ? 'bg-primary/15' : ''}`}>
        <span className="text-base leading-none shrink-0">{isTBC ? '🏳️' : t.flag}</span>
        <span className={`text-xs font-bold flex-1 truncate ${win ? 'text-primary' : 'text-textp'}`}>{isTBC ? 'TBD' : t.name}</span>
        {hasScore && <span className={`text-xs font-extrabold tabular-nums ${win ? 'text-primary' : 'text-texts'}`}>{score}</span>}
      </div>
    )
  }

  return (
    <button onClick={() => onClick?.(match)} className="w-44 rounded-xl border border-border bg-card hover:border-texts/40 transition-all text-left overflow-hidden">
      <div className="bg-surface border-b border-border px-2.5 py-1"><p className="text-[10px] text-texts font-bold">{fmtDate(match.match_date)}</p></div>
      <Row code={match.home_team} score={match.real_home_score} win={w === match.home_team} />
      <div className="h-px bg-border/60" />
      <Row code={match.away_team} score={match.real_away_score} win={w === match.away_team} />
    </button>
  )
}

function RoundColumn({ label, matches, onSelect, highlight }: { label: string; matches: (Match | undefined)[]; onSelect: (m: Match) => void; highlight?: boolean }) {
  return (
    <div className="flex flex-col shrink-0">
      <div className={`text-center mb-3 px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-widest ${highlight ? 'bg-primary/15 text-primary' : 'bg-surface text-texts'}`}>{label}</div>
      <div className="flex flex-col gap-3 justify-around flex-1">
        {matches.map((m, i) => <BracketCard key={m?.id ?? i} match={m} onClick={onSelect} />)}
      </div>
    </div>
  )
}

export default function BracketPage() {
  const supabase = createClient()
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ModalMatch | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('matches').select('*, rounds(name, order)').in('round_id', Object.values(ROUND_IDS)).order('match_date', { ascending: true })
      setMatches((data ?? []) as unknown as Match[])
      setLoading(false)
    }
    load()
  }, [])

  const byId: Record<string, Match[]> = {}
  for (const m of matches) {
    const rid = (m as unknown as Record<string, string>).round_id
    ;(byId[rid] ||= []).push(m)
  }
  const r32 = byId[ROUND_IDS.R32] ?? [], r16 = byId[ROUND_IDS.R16] ?? [], qf = byId[ROUND_IDS.QF] ?? []
  const sf = byId[ROUND_IDS.SF] ?? [], bf = byId[ROUND_IDS.BF] ?? [], fin = byId[ROUND_IDS.FIN] ?? []
  const groupStageOver = r32.some((m) => m.home_team !== 'TBC')
  const r32Over = r16.some((m) => m.home_team !== 'TBC')
  const r16Over = qf.some((m) => m.home_team !== 'TBC')
  const qfOver = sf.some((m) => m.home_team !== 'TBC')
  const sfOver = fin.some((m) => m.home_team !== 'TBC')

  const openModal = (m: Match) => setSelected({ ...m, round_name: (m.rounds as { name: string })?.name ?? '' })

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-44" /><Skeleton className="h-96 rounded-xl" /></div>

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Knockout" title="Bracket" sub="Round of 32 onward · tap any match for details." />
      {!groupStageOver ? (
        <EmptyState icon={<TreeIcon size={22} />} title="Group stage still underway" desc="The bracket unlocks once the Round of 32 teams are confirmed." />
      ) : (
        <Card className="overflow-x-auto p-4">
          <div className="flex gap-6 min-w-max items-stretch">
            <RoundColumn label="Round of 32" matches={r32} onSelect={openModal} highlight={!r32Over} />
            <RoundColumn label="Round of 16" matches={r16} onSelect={openModal} highlight={r32Over && !r16Over} />
            <RoundColumn label="Quarter-Finals" matches={qf} onSelect={openModal} highlight={r16Over && !qfOver} />
            <RoundColumn label="Semi-Finals" matches={sf} onSelect={openModal} highlight={qfOver && !sfOver} />
            <div className="flex flex-col gap-6 shrink-0">
              <RoundColumn label="Final" matches={fin} onSelect={openModal} highlight={sfOver} />
              <RoundColumn label="3rd Place" matches={bf} onSelect={openModal} highlight={sfOver} />
            </div>
          </div>
        </Card>
      )}
      {selected && <MatchModal match={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
