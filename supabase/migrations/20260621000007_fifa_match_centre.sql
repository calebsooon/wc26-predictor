-- FIFA GameDay match-centre cache. FIFA is contacted only by the manual sync
-- commands; the product reads these small, indexed Supabase records.

alter table public.matches
  add column if not exists fifa_event_id bigint unique,
  add column if not exists fifa_match_id bigint,
  add column if not exists fifa_status text,
  add column if not exists fifa_metadata jsonb not null default '{}'::jsonb,
  add column if not exists fifa_updated_at timestamptz;

create index if not exists matches_fifa_event_id_idx
  on public.matches (fifa_event_id)
  where fifa_event_id is not null;

create table if not exists public.match_team_stats (
  match_id uuid not null references public.matches(id) on delete cascade,
  team_code text not null,
  stats jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (match_id, team_code)
);

create index if not exists match_team_stats_match_idx
  on public.match_team_stats (match_id);

create table if not exists public.match_player_stats (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id integer not null references public.players(id) on delete cascade,
  team_code text not null,
  stats jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index if not exists match_player_stats_match_team_idx
  on public.match_player_stats (match_id, team_code);

alter table public.match_team_stats enable row level security;
alter table public.match_player_stats enable row level security;

create policy "match_team_stats: authenticated read"
  on public.match_team_stats for select to authenticated using (true);

create policy "match_player_stats: authenticated read"
  on public.match_player_stats for select to authenticated using (true);

alter table public.lineup_substitutions
  drop constraint if exists lineup_substitutions_source_check;
alter table public.lineup_substitutions
  add constraint lineup_substitutions_source_check
  check (source in ('kickoff', 'fifa', 'manual'));

-- Keep provider writes atomic, without touching an admin-maintained lineup.
create or replace function public.replace_fifa_match_lineup(
  p_match_id uuid,
  p_rows jsonb,
  p_home_formation text,
  p_away_formation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.lineups where match_id = p_match_id;

  insert into public.lineups (
    match_id, team_code, player_id, is_starting, shirt_number,
    position_label, grid, sort_order, source
  )
  select
    p_match_id, row.team_code, row.player_id, row.is_starting, row.shirt_number,
    row.position_label, row.grid, row.sort_order, 'fifa'
  from jsonb_to_recordset(p_rows) as row(
    team_code text,
    player_id integer,
    is_starting boolean,
    shirt_number integer,
    position_label text,
    grid text,
    sort_order integer
  );

  update public.matches
  set home_formation = p_home_formation,
      away_formation = p_away_formation
  where id = p_match_id;
end;
$$;

revoke all on function public.replace_fifa_match_lineup(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.replace_fifa_match_lineup(uuid, jsonb, text, text) to service_role;
