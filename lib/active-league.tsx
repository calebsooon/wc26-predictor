'use client'

import { createContext, useContext } from 'react'
import type { League } from '@/lib/league'

export interface ActiveLeagueProfile {
  username: string
  avatar_url: string | null
  is_admin: boolean
  active_league_id: string | null
}

export interface ActiveLeagueContextValue {
  league: League | null
  leagues: League[]
  profile: ActiveLeagueProfile | null
  leaguesReady: boolean
  switchLeague: (id: string) => Promise<void>
}

const ActiveLeagueContext = createContext<ActiveLeagueContextValue | null>(null)

export function ActiveLeagueProvider({
  value,
  children,
}: {
  value: ActiveLeagueContextValue
  children: React.ReactNode
}) {
  return <ActiveLeagueContext.Provider value={value}>{children}</ActiveLeagueContext.Provider>
}

export function useActiveLeagueContext() {
  const ctx = useContext(ActiveLeagueContext)
  if (!ctx) {
    return {
      league: null,
      leagues: [],
      profile: null,
      leaguesReady: false,
      switchLeague: async () => {},
    } satisfies ActiveLeagueContextValue
  }
  return ctx
}
