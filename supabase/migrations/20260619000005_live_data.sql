-- ============================================================
-- 20260619000005_live_data.sql
--   Columns for live data pulled from Kickoffapi (lineups/formations,
--   injuries). Player match data is matched into existing tables by name.
-- ============================================================

-- Lineups: pitch grid coords ("row:col") + which source filled the row.
alter table lineups add column if not exists grid   text;
alter table lineups add column if not exists source text;

-- Per-team formation for a match (e.g. '4-2-3-1').
alter table matches add column if not exists home_formation text;
alter table matches add column if not exists away_formation text;

-- Current injury / suspension flag, refreshed from the injuries feed.
alter table players add column if not exists injured     boolean not null default false;
alter table players add column if not exists injury_type text;
