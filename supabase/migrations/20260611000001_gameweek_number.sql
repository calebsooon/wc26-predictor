-- Add gw_number (1–8) to matches for prize-pool GW grouping
ALTER TABLE matches ADD COLUMN IF NOT EXISTS gw_number integer;

-- Group stage GWs come from the existing gameweek column
UPDATE matches SET gw_number = gameweek WHERE group_name IS NOT NULL AND gameweek IS NOT NULL;

-- Knockout rounds
UPDATE matches m SET gw_number = 4 FROM rounds r WHERE m.round_id = r.id AND r.name = 'Round of 32';
UPDATE matches m SET gw_number = 5 FROM rounds r WHERE m.round_id = r.id AND r.name = 'Round of 16';
UPDATE matches m SET gw_number = 6 FROM rounds r WHERE m.round_id = r.id AND r.name = 'Quarter-Finals';
UPDATE matches m SET gw_number = 7 FROM rounds r WHERE m.round_id = r.id AND r.name = 'Semi-Finals';
UPDATE matches m SET gw_number = 8 FROM rounds r WHERE m.round_id = r.id AND r.name IN ('Final', 'Bronze Final', '3rd Place Play-Off');

-- Add jersey_number and photo_url to players for card picker UI
ALTER TABLE players ADD COLUMN IF NOT EXISTS jersey_number integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS photo_url text;
