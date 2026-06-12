-- Cleanup/performance pass for active-league scoring surfaces.

-- Predictions hot paths: user fixture editing, match reveal, and scored leaderboard reads.
create index if not exists predictions_user_match_idx
  on predictions (user_id, match_id);

create index if not exists predictions_match_user_idx
  on predictions (match_id, user_id);

create index if not exists predictions_scored_user_idx
  on predictions (user_id)
  where points_awarded is not null;

-- Rank snapshots are read by active league, user, and newest timestamp.
create index if not exists rank_snapshots_league_user_time_idx
  on rank_snapshots (league_id, user_id, snapshot_at desc);

-- Match browsing/grouping paths.
create index if not exists matches_date_idx
  on matches (match_date);

create index if not exists matches_gw_number_idx
  on matches (gw_number);

create index if not exists matches_group_name_idx
  on matches (group_name)
  where group_name is not null;

-- Rank snapshots should be written by server/admin flows only.
drop policy if exists "rank_snapshots: authenticated insert" on rank_snapshots;
drop policy if exists "rank_snapshots: admin insert" on rank_snapshots;

create policy "rank_snapshots: admin insert"
  on rank_snapshots for insert to authenticated
  with check (is_admin());
