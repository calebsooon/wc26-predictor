-- ============================================================
-- 20260620000004_hide_join_code.sql
--   Fix: invite codes were still readable. A column-level `revoke select
--   (join_code)` is IGNORED by Postgres while a table-level SELECT grant
--   exists — so members could read leagues.join_code directly. Revoke the
--   table grant and re-grant SELECT on every column EXCEPT join_code.
--   Members receive their own code only via get_my_leagues()/get_admin_leagues()
--   (SECURITY DEFINER, which bypass column privileges). RLS still gates rows.
-- ============================================================

revoke select on public.leagues from authenticated;

grant select (
  id, name, type, scoring, created_by, created_at,
  bracket_enabled, reveal_predictions, label_id, prize_pool, banners_enabled
) on public.leagues to authenticated;
