'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Keeps UI filters shareable without a full navigation or scroll reset. */
export function useUrlState() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  function replaceUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === '') params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return { searchParams, replaceUrl }
}
