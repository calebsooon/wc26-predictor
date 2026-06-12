'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMyLeagues, getActiveLeague, type League, type ActiveLeague } from '@/lib/league'

// Module-level promise cache so concurrent mounts share one in-flight fetch
const cache = new Map<string, { promise: Promise<unknown>; ts: number; data: unknown }>()
const TTL = 30_000 // 30 seconds

async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL && hit.data !== undefined) return hit.data as T
  if (hit && hit.promise) return hit.promise as Promise<T>
  const promise = fn().then((data) => { cache.set(key, { promise: promise as Promise<unknown>, ts: Date.now(), data }); return data })
  cache.set(key, { promise: promise as Promise<unknown>, ts: 0, data: undefined })
  return promise
}

export function invalidate(prefix: string) {
  Array.from(cache.keys()).forEach((k) => { if (k.startsWith(prefix)) cache.delete(k) })
}

export function useMyLeagues(supabase: SupabaseClient, userId: string | null) {
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    try {
      const data = await dedupe(`leagues:${userId}`, () => getMyLeagues(supabase, userId))
      if (mounted.current) setLeagues(data)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => { load() }, [load])
  return { leagues, loading, refresh: () => { invalidate(`leagues:${userId}`); load() } }
}

export function useActiveLeague(supabase: SupabaseClient, userId: string | null) {
  const [activeLeague, setActiveLeague] = useState<ActiveLeague | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    try {
      const data = await dedupe(`active-league:${userId}`, () => getActiveLeague(supabase, userId))
      if (mounted.current) setActiveLeague(data)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => { load() }, [load])
  return { activeLeague, loading, refresh: () => { invalidate(`active-league:${userId}`); load() } }
}
