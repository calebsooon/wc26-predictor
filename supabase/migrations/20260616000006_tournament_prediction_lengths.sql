-- ============================================================
-- 20260616000006_tournament_prediction_lengths.sql
--   Enforce the intended bracket model:
--   • quarter = 8 quarter-finalists
--   • semi    = 4 semi-finalists
-- ============================================================

alter table tournament_predictions
  drop constraint if exists tournament_predictions_quarter_len_chk;

alter table tournament_predictions
  drop constraint if exists tournament_predictions_semi_len_chk;

alter table tournament_predictions
  add constraint tournament_predictions_quarter_len_chk
  check (quarter is null or cardinality(quarter) <= 8);

alter table tournament_predictions
  add constraint tournament_predictions_semi_len_chk
  check (semi is null or cardinality(semi) <= 4);
