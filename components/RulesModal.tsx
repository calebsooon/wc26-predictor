'use client'

import { Modal } from '@/components/ui'
import RulesContent from '@/components/RulesContent'

export default function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How it works — rules & scoring" maxWidth="max-w-xl">
      <div className="p-5">
        <RulesContent />
      </div>
    </Modal>
  )
}
