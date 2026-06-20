import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.SUPABASE_RLS_TEST === '1'
const describeRls = enabled ? describe : describe.skip
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const runId = `rls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describeRls('Supabase RLS launch boundaries', () => {
  let service: SupabaseClient
  let member: SupabaseClient
  let memberId = ''
  let outsiderId = ''
  let leagueId = ''
  let otherLeagueId = ''
  let roundId = ''
  let matchId = ''

  beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) throw new Error('Set Supabase credentials before enabling SUPABASE_RLS_TEST')
    service = createClient(url, serviceKey, { auth: { persistSession: false } })
    const email = `${runId}@example.test`
    const password = `Safe-${runId}-password`
    const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true })
    if (createError || !created.user) throw createError ?? new Error('Unable to create RLS test user')
    memberId = created.user.id
    const { data: outsider, error: outsiderError } = await service.auth.admin.createUser({
      email: `${runId}-outsider@example.test`, password, email_confirm: true,
    })
    if (outsiderError || !outsider.user) throw outsiderError ?? new Error('Unable to create RLS test outsider')
    outsiderId = outsider.user.id

    const { data: firstLeague, error: firstLeagueError } = await service
      .from('leagues')
      .insert({ name: `${runId} member`, join_code: `${runId}A`, type: 'points' })
      .select('id')
      .single()
    if (firstLeagueError || !firstLeague) throw firstLeagueError ?? new Error('Unable to create test league')
    leagueId = firstLeague.id

    const { data: secondLeague, error: secondLeagueError } = await service
      .from('leagues')
      .insert({ name: `${runId} private`, join_code: `${runId}B`, type: 'points' })
      .select('id')
      .single()
    if (secondLeagueError || !secondLeague) throw secondLeagueError ?? new Error('Unable to create second test league')
    otherLeagueId = secondLeague.id

    const { error: membershipError } = await service.from('league_members').insert({ league_id: leagueId, user_id: memberId })
    if (membershipError) throw membershipError
    const { data: round, error: roundError } = await service.from('rounds').insert({ name: runId, order: 9999 }).select('id').single()
    if (roundError || !round) throw roundError ?? new Error('Unable to create test round')
    roundId = round.id
    const { data: match, error: matchError } = await service.from('matches')
      .insert({ round_id: roundId, match_date: '2026-06-11T18:00:00.000Z', home_team: 'USA', away_team: 'MEX' })
      .select('id')
      .single()
    if (matchError || !match) throw matchError ?? new Error('Unable to create test match')
    matchId = match.id
    const { error: predictionError } = await service.from('predictions').insert({
      user_id: outsiderId, match_id: matchId, pred_home: 1, pred_away: 0,
    })
    if (predictionError) throw predictionError

    member = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await member.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
  })

  afterAll(async () => {
    if (!service) return
    if (roundId) await service.from('rounds').delete().eq('id', roundId)
    if (leagueId || otherLeagueId) await service.from('leagues').delete().in('id', [leagueId, otherLeagueId].filter(Boolean))
    if (memberId) await service.auth.admin.deleteUser(memberId)
    if (outsiderId) await service.auth.admin.deleteUser(outsiderId)
  })

  it('cannot elevate its profile role', async () => {
    const { error } = await member.from('profiles').update({ is_admin: true }).eq('id', memberId)
    expect(error).not.toBeNull()
  })

  it('cannot read an invite code through a normal table read', async () => {
    const { data, error } = await member.from('leagues').select('join_code').eq('id', leagueId)
    expect(error || !data?.[0]?.join_code).toBeTruthy()
  })

  it('cannot bypass join_league with a direct membership insert', async () => {
    const { error } = await member.from('league_members').insert({ league_id: otherLeagueId, user_id: memberId })
    expect(error).not.toBeNull()
  })

  it('cannot alter a live match', async () => {
    const { error } = await member.from('matches').update({ is_locked: true }).eq('id', matchId)
    expect(error).not.toBeNull()
  })

  it('cannot read a closed-match prediction from a user outside its leagues', async () => {
    const { data, error } = await member
      .from('predictions')
      .select('user_id, match_id, pred_home, pred_away')
      .eq('user_id', outsiderId)
      .eq('match_id', matchId)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})
