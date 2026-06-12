/* ============================================================
   MatchDay — league helpers
   Predictions are shared globally; a league is a member grouping
   that produces its own leaderboard. Only 'money' leagues show the
   prize pool. These helpers resolve the active league + its members
   so pages can scope standings via aggregateLeaderboard().
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProfileLite } from '@/lib/leaderboard'
import { resolveWeights, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'

export type LeagueType = 'money' | 'points'

export interface LeagueLabel { name: string; color: string }

export interface League {
  id: string
  name: string
  type: LeagueType
  join_code?: string | null
  scoring?: unknown
  bracket_enabled?: boolean
  reveal_predictions?: boolean
  prize_pool?: boolean
  banners_enabled?: boolean
  label_id?: string | null
  league_labels?: LeagueLabel | null   // embedded label (name + colour)
}

/** Does this league run the prize pool? (prize_pool flag, falling back to legacy type). */
export function isMoneyLeague(l: Pick<League, 'prize_pool' | 'type'> | null | undefined): boolean {
  if (!l) return false
  return l.prize_pool ?? (l.type === 'money')
}

export interface ActiveLeague {
  league: League | null
  weights: ScoringWeights
  memberIds: string[]
  memberProfiles: ProfileLite[]
}

/** Leagues the user belongs to (with join codes — only meaningful to admins). */
export async function getMyLeagues(supabase: SupabaseClient, userId: string): Promise<League[]> {
  const { data } = await supabase
    .from('league_members')
    .select('leagues(id, name, type, join_code, scoring, bracket_enabled, reveal_predictions, prize_pool, banners_enabled, label_id, league_labels(name, color))')
    .eq('user_id', userId)
  const rows = (data ?? []) as unknown as { leagues: League | null }[]
  return rows.map((r) => r.leagues).filter((l): l is League => !!l)
}

/**
 * Resolve the league the user is currently viewing plus its member set.
 * Falls back to the user's first membership when no active league is set.
 */
export async function getActiveLeague(supabase: SupabaseClient, userId: string): Promise<ActiveLeague> {
  const { data: prof } = await supabase
    .from('profiles')
    .select('active_league_id')
    .eq('id', userId)
    .maybeSingle()

  let activeId = (prof as { active_league_id: string | null } | null)?.active_league_id ?? null

  if (!activeId) {
    const mine = await getMyLeagues(supabase, userId)
    activeId = mine[0]?.id ?? null
  }
  if (!activeId) return { league: null, weights: DEFAULT_WEIGHTS, memberIds: [], memberProfiles: [] }

  // NB: league_members.user_id FKs to auth.users, not profiles — so we can't embed
  // profiles via PostgREST. Fetch member ids first, then their profiles by id.
  const [{ data: leagueRow }, { data: members }] = await Promise.all([
    supabase.from('leagues').select('id, name, type, join_code, scoring, bracket_enabled, reveal_predictions, prize_pool, banners_enabled, label_id, league_labels(name, color)').eq('id', activeId).maybeSingle(),
    supabase.from('league_members').select('user_id').eq('league_id', activeId),
  ])

  const memberIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id)
  let memberProfiles: ProfileLite[] = []
  if (memberIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', memberIds)
    memberProfiles = (profs ?? []) as ProfileLite[]
  }
  const league = (leagueRow as League | null) ?? null

  return {
    league,
    weights: resolveWeights(league?.scoring),
    memberIds,
    memberProfiles,
  }
}

/** Set the user's active (currently-viewed) league. */
export async function setActiveLeague(supabase: SupabaseClient, userId: string, leagueId: string) {
  return supabase.from('profiles').update({ active_league_id: leagueId }).eq('id', userId)
}
