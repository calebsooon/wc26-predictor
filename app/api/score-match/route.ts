import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ─── Scoring ─────────────────────────────────────────────────────────────────
//
// Strict hierarchy — each tier is checked only if the tier above didn't match:
//   3 pts  exact scoreline
//   2 pts  goal difference matches (e.g. 2-0 vs 3-1 → both +2)
//   1 pt   correct outcome (W/D/L) but wrong difference
//   0 pts  everything else
//
// Correctly handles 0-0 vs 1-1: both have goal diff = 0, so that's 2 pts.

function score(ph: number, pa: number, rh: number, ra: number): number {
  if (ph === rh && pa === ra) return 3
  if (ph - pa === rh - ra) return 2
  if (Math.sign(ph - pa) === Math.sign(rh - ra)) return 1
  return 0
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()

  // Auth check
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin check
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse body
  let match_id: string | undefined
  try {
    const body = await request.json()
    match_id = body.match_id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!match_id || typeof match_id !== 'string') {
    return NextResponse.json({ error: 'match_id is required' }, { status: 400 })
  }

  // Fetch the match
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, real_home_score, real_away_score')
    .eq('id', match_id)
    .single()

  if (matchErr || !match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  if (match.real_home_score === null || match.real_away_score === null) {
    return NextResponse.json(
      { error: 'Match has no real scores yet' },
      { status: 422 }
    )
  }

  const rh = match.real_home_score
  const ra = match.real_away_score

  // Fetch all predictions for this match
  const { data: predictions, error: predsErr } = await supabase
    .from('predictions')
    .select('id, pred_home, pred_away')
    .eq('match_id', match_id)

  if (predsErr) {
    return NextResponse.json({ error: predsErr.message }, { status: 500 })
  }

  if (!predictions || predictions.length === 0) {
    return NextResponse.json({ match_id, scored: 0 })
  }

  // Calculate and upsert points for each prediction
  const updates = predictions.map((p) => ({
    id: p.id,
    match_id,
    pred_home: p.pred_home,
    pred_away: p.pred_away,
    points_awarded: score(p.pred_home, p.pred_away, rh, ra),
  }))

  const { error: upsertErr } = await supabase
    .from('predictions')
    .upsert(updates, { onConflict: 'id' })

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  const summary = updates.reduce<Record<number, number>>(
    (acc, u) => ({ ...acc, [u.points_awarded]: (acc[u.points_awarded] ?? 0) + 1 }),
    {}
  )

  return NextResponse.json({ match_id, scored: updates.length, breakdown: summary })
}
