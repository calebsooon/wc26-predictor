'use client'

import { PageHeader } from '@/components/ui'
import RulesContent from '@/components/RulesContent'
import { useActiveLeagueContext } from '@/lib/active-league'
import { isMoneyLeague } from '@/lib/league'
import { resolveWeights } from '@/lib/scoring'

export default function RulesPage() {
  const { league } = useActiveLeagueContext()
  const weights = resolveWeights(league?.scoring)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        eyebrow="How it works"
        title="Rules & scoring"
        sub={league ? `Showing the active scoring setup for ${league.name}.` : 'Everything you need to know about points, tiebreakers and the prize pool.'}
      />
      <RulesContent weights={weights} showPrizePool={isMoneyLeague(league)} />
    </div>
  )
}
