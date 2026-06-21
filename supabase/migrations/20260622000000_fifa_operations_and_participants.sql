-- FIFA operations hardening
--
-- MatchDay reads only Supabase during normal product use. These tables keep a
-- small, inspectable record of each manual/CLI FIFA import and preserve the
-- exact event participant identity separately from the canonical squad table.

alter table public.sync_runs
  drop constraint if exists sync_runs_kind_check;
alter table public.sync_runs
  add constraint sync_runs_kind_check
  check (kind in ('lineups', 'results', 'injuries', 'events', 'fifa_matches', 'fifa_teams', 'golden_boot'));

alter table public.sync_runs
  drop constraint if exists sync_runs_trigger_source_check;
alter table public.sync_runs
  add constraint sync_runs_trigger_source_check
  check (trigger_source in ('admin', 'cron', 'cli'));

alter table public.sync_runs
  add column if not exists provider text,
  add column if not exists scope text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists records_read integer not null default 0,
  add column if not exists records_written integer not null default 0,
  add column if not exists error_summary text;

create table if not exists public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  fifa_player_id bigint not null,
  player_id integer references public.players(id) on delete set null,
  team_code text not null,
  player_name text not null,
  shirt_number integer,
  position_label text,
  is_starting boolean,
  source text not null default 'fifa' check (source in ('fifa', 'manual')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, fifa_player_id)
);

create index if not exists match_participants_match_team_idx
  on public.match_participants (match_id, team_code);
create index if not exists match_participants_player_match_idx
  on public.match_participants (player_id, match_id desc)
  where player_id is not null;

alter table public.match_participants enable row level security;
create policy "match_participants: authenticated read"
  on public.match_participants for select to authenticated using (true);
create policy "match_participants: admin write"
  on public.match_participants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.fifa_raw_snapshots (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  match_id uuid references public.matches(id) on delete cascade,
  resource text not null,
  payload jsonb not null,
  payload_hash text not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, resource, payload_hash)
);

create index if not exists fifa_raw_snapshots_match_created_idx
  on public.fifa_raw_snapshots (match_id, created_at desc);
create index if not exists fifa_raw_snapshots_run_idx
  on public.fifa_raw_snapshots (sync_run_id);
create unique index if not exists fifa_raw_snapshots_global_resource_hash_idx
  on public.fifa_raw_snapshots (resource, payload_hash)
  where match_id is null;

alter table public.fifa_raw_snapshots enable row level security;
create policy "fifa_raw_snapshots: admin read"
  on public.fifa_raw_snapshots for select to authenticated using (public.is_admin());

-- These mirror actual product read paths. They are intentionally narrow and
-- should be revisited with EXPLAIN ANALYZE as league size grows.
create index if not exists lineups_match_team_source_idx
  on public.lineups (match_id, team_code, source);
create index if not exists match_player_stats_player_match_idx
  on public.match_player_stats (player_id, match_id desc);
create index if not exists matches_fifa_updated_idx
  on public.matches (fifa_updated_at desc)
  where fifa_updated_at is not null;

alter table public.match_events
  drop constraint if exists match_events_source_check;
alter table public.match_events
  add constraint match_events_source_check
  check (source in ('kickoff', 'fifa', 'manual'));
