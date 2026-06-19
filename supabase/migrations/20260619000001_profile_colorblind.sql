-- ============================================================
-- 20260619000001_profile_colorblind.sql
--   Per-user colour-blind mode preference (accessibility). Follows the
--   user across devices, like profiles.theme. localStorage is a fast cache;
--   this column is the source of truth, hydrated on load by AppShell.
-- ============================================================

alter table profiles
  add column if not exists colorblind boolean not null default false;
