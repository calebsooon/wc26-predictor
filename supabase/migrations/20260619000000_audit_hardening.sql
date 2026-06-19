-- ============================================================
-- 20260619000000_audit_hardening.sql
--   Security hardening from the full-app audit:
--   1. predictions — stop exposing every user's picks to all members.
--      A user may read: their own picks; anyone's picks for a match that
--      has kicked off (locked) or been scored; and, pre-kickoff, a league
--      mate's picks only when a shared league has reveal_predictions on.
--      (Scored/locked reads keep the leaderboard, H2H, and dashboard working
--      since those only ever read completed-match predictions.)
--   2. rank_snapshots — remove the open authenticated INSERT. Snapshots are
--      only ever written by admin API routes via the service role (which
--      bypasses RLS), so no authenticated-insert policy is needed.
-- ============================================================

-- ── 1. Predictions read policy ─────────────────────────────────
drop policy if exists "predictions: authenticated read" on predictions;

create policy "predictions: read own or revealed"
  on predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and (m.is_locked = true or m.real_home_score is not null)
    )
    or exists (
      select 1
      from league_members me
      join league_members them on them.league_id = me.league_id
      join leagues l on l.id = me.league_id
      where me.user_id = auth.uid()
        and them.user_id = predictions.user_id
        and l.reveal_predictions = true
    )
  );

-- ── 2. Lock down rank_snapshots inserts ────────────────────────
drop policy if exists "rank_snapshots: authenticated insert" on rank_snapshots;
