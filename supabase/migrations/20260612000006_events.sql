-- scoring_events: audit log of every admin scoring action
create table if not exists scoring_events (
  id            uuid primary key default gen_random_uuid(),
  triggered_by  uuid not null references auth.users(id),
  event_type    text not null,  -- 'match' | 'groups' | 'tournament' | 'rescore_all'
  subject_id    text,           -- match_id or null for bulk ops
  league_id     uuid references leagues(id),
  pts_distributed integer,      -- total points awarded in this action
  scored_count  integer,        -- number of predictions updated
  created_at    timestamptz not null default now()
);

alter table scoring_events enable row level security;

create policy "scoring_events: admin read"
  on scoring_events for select to authenticated
  using (is_admin());

create policy "scoring_events: admin insert"
  on scoring_events for insert to authenticated
  with check (is_admin());

-- league_events: activity feed (one row per notable event per league)
create table if not exists league_events (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references leagues(id) on delete cascade,
  event_type  text not null,   -- 'match_scored' | 'rank_change' | 'exact_score'
  user_id     uuid references auth.users(id),
  match_id    uuid references matches(id),
  payload     jsonb,           -- flexible event data
  created_at  timestamptz not null default now()
);

create index if not exists league_events_league_time_idx
  on league_events (league_id, created_at desc);

alter table league_events enable row level security;

create policy "league_events: member read"
  on league_events for select to authenticated
  using (
    exists (
      select 1 from league_members lm
      where lm.league_id = league_events.league_id
        and lm.user_id = auth.uid()
    )
  );

create policy "league_events: admin insert"
  on league_events for insert to authenticated
  with check (is_admin());
