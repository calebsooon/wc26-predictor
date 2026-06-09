-- ============================================================
-- Rounds
-- ============================================================
create table rounds (
  id    uuid primary key default gen_random_uuid(),
  name  text    not null,
  "order" integer not null
);

-- ============================================================
-- Matches
-- ============================================================
create table matches (
  id               uuid        primary key default gen_random_uuid(),
  round_id         uuid        not null references rounds (id) on delete cascade,
  match_date       timestamptz not null,
  home_team        text        not null,
  away_team        text        not null,
  real_home_score  integer,
  real_away_score  integer,
  is_locked        boolean     not null default false
);

-- ============================================================
-- Profiles (mirrors auth.users 1-to-1)
-- ============================================================
create table profiles (
  id       uuid    primary key references auth.users (id) on delete cascade,
  username text    not null unique,
  is_admin boolean not null default false
);

-- ============================================================
-- Predictions
-- ============================================================
create table predictions (
  id             uuid    primary key default gen_random_uuid(),
  user_id        uuid    not null references auth.users (id) on delete cascade,
  match_id       uuid    not null references matches (id) on delete cascade,
  pred_home      integer not null,
  pred_away      integer not null,
  points_awarded integer,
  unique (user_id, match_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table rounds      enable row level security;
alter table matches     enable row level security;
alter table profiles    enable row level security;
alter table predictions enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select is_admin from profiles where id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------
-- rounds: authenticated users can read
-- ------------------------------------------------------------
create policy "rounds: authenticated read"
  on rounds for select
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- matches: authenticated users can read; admins can write
-- ------------------------------------------------------------
create policy "matches: authenticated read"
  on matches for select
  to authenticated
  using (true);

create policy "matches: admin insert"
  on matches for insert
  to authenticated
  with check (is_admin());

create policy "matches: admin update"
  on matches for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "matches: admin delete"
  on matches for delete
  to authenticated
  using (is_admin());

-- ------------------------------------------------------------
-- profiles: all authenticated users can read; users write own row
-- ------------------------------------------------------------
create policy "profiles: authenticated read"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles: own insert"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles: own update"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------
-- predictions: authenticated users can read all;
--              users can only insert/update their own rows
-- ------------------------------------------------------------
create policy "predictions: authenticated read"
  on predictions for select
  to authenticated
  using (true);

create policy "predictions: own insert"
  on predictions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "predictions: own update"
  on predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Prevent deletes on predictions (scores are permanent)
-- No delete policy → delete is denied by default under RLS.
