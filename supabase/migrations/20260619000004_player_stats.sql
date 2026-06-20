-- ============================================================
-- 20260619000004_player_stats.sql
--   Richer player stats for the Squads page, back-filled from API-FOOTBALL
--   (api-sports.io) via scripts/fetch-player-stats.ts. club / dob / photo_url
--   already exist; this adds goal involvement.
-- ============================================================

alter table players add column if not exists goals   integer;
alter table players add column if not exists assists integer;
