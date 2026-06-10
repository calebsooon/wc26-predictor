-- Players table (seeded from football-data.org or static fallback)
create table if not exists players (
  id             integer      primary key,   -- football-data.org player ID
  name           text         not null,
  position       text,                       -- Goalkeeper / Defender / Midfielder / Forward
  nationality    text,
  team_id        integer,
  team_name      text,
  jersey_number  integer,
  last_updated   timestamptz
);

-- Allow authenticated users to read; only service role can write (seeded externally)
alter table players enable row level security;

create policy "players: authenticated read"
  on players for select
  to authenticated
  using (true);
