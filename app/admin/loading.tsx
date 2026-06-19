import { Skeleton } from '@/components/ui'

export default function AdminLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-44 rounded-xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    </div>
  )
}
