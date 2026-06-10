-- Stores the actual match winner for knockout matches that go to extra time/penalties.
-- The real_home_score/real_away_score columns only store 90-min (or ET) scores,
-- which may be a draw. Admin sets match_winner explicitly for penalty shootouts.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_winner text;
