'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-[60vh] grid place-items-center text-center px-4">
      <div className="max-w-sm space-y-4">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-black text-textp">Something went wrong</h1>
        <p className="text-sm text-texts font-medium">An unexpected error occurred. Try again, or head back to your dashboard.</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button onClick={reset}>Try again</Button>
          <a href="/dashboard"><Button variant="outline">Dashboard</Button></a>
        </div>
      </div>
    </div>
  )
}
