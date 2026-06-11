-- ============================================================
-- 20260612000001_reveal_predictions.sql
--   leagues.reveal_predictions — when true, members can see each other's
--   predictions before kickoff. Default false (hidden until kickoff).
-- ============================================================

alter table leagues
  add column if not exists reveal_predictions boolean not null default false;
