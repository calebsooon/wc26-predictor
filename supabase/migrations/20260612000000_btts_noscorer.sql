-- ============================================================
-- 20260612000000_btts_noscorer.sql
--   • predictions.pred_btts       — hedge: override both-teams-to-score
--                                   independently of the scoreline (null = derive)
--   • predictions.pred_no_scorer  — let users predict "no first scorer"
--                                   (pairs with a 'No goal' first-goal-team call)
--   • predictions.pts_team_goals  — new category: flat award if either team's
--                                   exact goal count is correct (per-league weight)
-- ============================================================

alter table predictions
  add column if not exists pred_btts boolean;

alter table predictions
  add column if not exists pred_no_scorer boolean;

alter table predictions
  add column if not exists pts_team_goals integer;
