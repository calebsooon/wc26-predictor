'use client'

import { Modal } from '@/components/ui'
import RulesContent from '@/components/RulesContent'
import { DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'

export default function RulesModal({
  open, onClose, weights = DEFAULT_WEIGHTS, showPrizePool = true,
}: { open: boolean; onClose: () => void; weights?: ScoringWeights; showPrizePool?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title="How it works — rules & scoring" maxWidth="max-w-xl">
      <div className="p-5">
        <RulesContent weights={weights} showPrizePool={showPrizePool} />
      </div>
    </Modal>
  )
}
