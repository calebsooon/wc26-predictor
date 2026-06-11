import { Skeleton } from '@/components/ui'

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}
