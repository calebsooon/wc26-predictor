import Link from 'next/link'
import { Button } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center text-center px-4">
      <div className="max-w-sm space-y-4">
        <div className="text-6xl font-black text-primary tabular-nums">404</div>
        <h1 className="text-xl font-black text-textp">Page not found</h1>
        <p className="text-sm text-texts font-medium">That page doesn&apos;t exist or has moved.</p>
        <Link href="/dashboard" className="inline-block pt-1"><Button>Back to dashboard</Button></Link>
      </div>
    </div>
  )
}
