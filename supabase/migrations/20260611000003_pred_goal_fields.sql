-- Allow users to independently predict total goals and goal difference
-- These override the values derived from pred_home + pred_away in the scoring engine
-- Null means "derive from score" (backward compatible)
alter table predictions
  add column if not exists pred_total_goals integer,
  add column if not exists pred_goal_diff   integer;
