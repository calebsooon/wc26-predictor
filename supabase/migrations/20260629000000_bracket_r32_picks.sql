-- ============================================================
-- 20260629000000_bracket_r32_picks.sql
--   Adds R32 picks + pts to tournament_predictions for WC 2026
--   bracket game (48 teams, extra R32 and R16 rounds).
-- ============================================================

alter table tournament_predictions
  add column if not exists r32 text[] not null default '{}',
  add column if not exists pts_r32 integer;

alter table tournament_predictions
  drop constraint if exists tournament_predictions_r32_len_chk;

alter table tournament_predictions
  add constraint tournament_predictions_r32_len_chk
  check (r32 is null or cardinality(r32) <= 16);
