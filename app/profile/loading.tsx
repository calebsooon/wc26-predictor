import { Skeleton } from '@/components/ui'

export default function ProfileLoading() {
  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <Skeleton className="h-9 w-36 rounded-xl" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-4 w-28 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  )
}
