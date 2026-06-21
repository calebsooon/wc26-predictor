-- Verified in-match substitutions. The announced lineup remains in `lineups`;
-- this table records the changes that produce the live XI.
create table if not exists public.lineup_substitutions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_code text not null,
  player_out_id integer not null references public.players(id) on delete cascade,
  player_in_id integer not null references public.players(id) on delete cascade,
  minute smallint not null check (minute between 1 and 130),
  source text not null default 'manual' check (source in ('kickoff', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_out_id <> player_in_id),
  unique (match_id, player_out_id, player_in_id, minute)
);

create index if not exists lineup_substitutions_match_team_minute_idx
  on public.lineup_substitutions (match_id, team_code, minute, created_at);

alter table public.lineup_substitutions enable row level security;

alter table public.sync_runs drop constraint if exists sync_runs_kind_check;
alter table public.sync_runs add constraint sync_runs_kind_check
  check (kind in ('lineups', 'results', 'injuries', 'events'));

create policy "lineup_substitutions: authenticated read"
  on public.lineup_substitutions for select to authenticated using (true);

create policy "lineup_substitutions: admin insert"
  on public.lineup_substitutions for insert to authenticated with check (public.is_admin());

create policy "lineup_substitutions: admin update"
  on public.lineup_substitutions for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "lineup_substitutions: admin delete"
  on public.lineup_substitutions for delete to authenticated using (public.is_admin());
