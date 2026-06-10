-- ============================================================
-- 20260611000000_bracket_and_rank.sql
--   • tournament_predictions — pre-knockout champion / finalist picks
--   • group_predictions.points_awarded — scoring column
--   • rank_snapshots — leaderboard history for rank-movement arrows
-- ============================================================

-- ── Group prediction scoring ──────────────────────────────────
alter table group_predictions add column if not exists points_awarded integer;

-- ── Tournament picks (one row per user) ──────────────────────
create table if not exists tournament_predictions (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  champion      text,                         -- 3-letter team code
  runner_up     text,
  semi          text[] default '{}',          -- 2 team codes
  quarter       text[] default '{}',          -- 4 team codes
  pts_champion  integer,                      -- null until scored
  pts_runner_up integer,
  pts_semi      integer,
  pts_quarter   integer,
  updated_at    timestamptz default now()
);

alter table tournament_predictions enable row level security;

create policy "tournament_predictions: authenticated read"
  on tournament_predictions for select to authenticated using (true);

create policy "tournament_predictions: own insert"
  on tournament_predictions for insert to authenticated
  with check (user_id = auth.uid());

create policy "tournament_predictions: own update"
  on tournament_predictions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Rank snapshots ─────────────────────────────────────────────
create table if not exists rank_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  rank        integer not null,
  points      integer not null,
  snapshot_at timestamptz default now()
);

create index if not exists rank_snapshots_time_user
  on rank_snapshots (snapshot_at desc, user_id);

alter table rank_snapshots enable row level security;

create policy "rank_snapshots: authenticated read"
  on rank_snapshots for select to authenticated using (true);

create policy "rank_snapshots: authenticated insert"
  on rank_snapshots for insert to authenticated with check (true);
