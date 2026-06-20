-- ============================================================
-- 20260619000003_colorblind_scope.sql
--   Scope for colour-blind mode (accessibility). Pairs with profiles.colorblind:
--     'graph' — recolour only the leaderboard race chart
--     'all'   — also remap app-wide semantic colours (success/amber/coral)
--   Source of truth across devices; localStorage is a fast cache.
-- ============================================================

alter table profiles
  add column if not exists colorblind_scope text not null default 'all'
  check (colorblind_scope in ('graph', 'all'));
