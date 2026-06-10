-- Lineups table: confirmed starting XI (and subs) per match per team
create table if not exists lineups (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  team_code    text not null,           -- e.g. 'BRA', 'GER'
  player_id    integer not null references players(id) on delete cascade,
  is_starting  boolean not null default true,
  shirt_number integer,
  position_label text,                  -- e.g. 'GK', 'CB', 'CAM', 'ST'
  sort_order   integer default 0,
  unique (match_id, player_id)
);

alter table lineups enable row level security;

-- Anyone authenticated can read lineups
create policy "lineups: authenticated read"
  on lineups for select
  to authenticated
  using (true);

-- Only admins can insert / update / delete
create policy "lineups: admin insert"
  on lineups for insert
  to authenticated
  with check (is_admin());

create policy "lineups: admin update"
  on lineups for update
  to authenticated
  using (is_admin());

create policy "lineups: admin delete"
  on lineups for delete
  to authenticated
  using (is_admin());
