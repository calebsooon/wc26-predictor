import { PageHeader } from '@/components/ui'
import RulesContent from '@/components/RulesContent'

export const metadata = {
  title: 'Rules & scoring — MatchDay',
  description: 'How points, tiebreakers and the prize pool work in MatchDay.',
}

export default function RulesPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        eyebrow="How it works"
        title="Rules & scoring"
        sub="Everything you need to know about points, tiebreakers and the prize pool."
      />
      <RulesContent />
    </div>
  )
}
