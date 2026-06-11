'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'
import RulesModal from '@/components/RulesModal'

/**
 * Self-contained "read the rules" trigger + modal. Safe to drop into server
 * components (landing, login) since it manages its own client state — and works
 * for logged-out visitors who can't navigate to the gated /rules page.
 */
export default function RulesButton({
  label = 'How scoring works',
  variant = 'outline',
  size = 'md',
  className = '',
}: {
  label?: string
  variant?: 'primary' | 'gold' | 'outline' | 'ghost' | 'surface' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <RulesModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
