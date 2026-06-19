-- Performance indexes for frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_group_predictions_user_id ON group_predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_user_id ON rank_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_rank_snapshots_league_user ON rank_snapshots (league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions (match_id);
