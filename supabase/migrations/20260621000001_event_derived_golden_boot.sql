-- MatchDay owns the Golden Boot standings. Provider aggregate endpoints can be
-- stale, so the residential sync derives these rows from completed fixture events.
create table if not exists public.golden_boot_stats (
  provider_player_id bigint primary key,
  player_id integer references public.players(id) on delete set null,
  team_code text not null,
  player_name text not null,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  photo_url text,
  updated_at timestamptz not null default now()
);

create index if not exists golden_boot_stats_goals_idx
  on public.golden_boot_stats (goals desc, assists desc, player_name);

create index if not exists golden_boot_stats_assists_idx
  on public.golden_boot_stats (assists desc, goals desc, player_name);

alter table public.golden_boot_stats enable row level security;

create policy "golden_boot_stats: authenticated read"
  on public.golden_boot_stats for select to authenticated using (true);

create or replace function public.replace_golden_boot_stats(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.golden_boot_stats where provider_player_id is not null;

  insert into public.golden_boot_stats (
    provider_player_id, player_id, team_code, player_name, goals, assists, photo_url, updated_at
  )
  select
    row.provider_player_id, row.player_id, row.team_code, row.player_name,
    row.goals, row.assists, row.photo_url, now()
  from jsonb_to_recordset(p_rows) as row(
    provider_player_id bigint,
    player_id integer,
    team_code text,
    player_name text,
    goals integer,
    assists integer,
    photo_url text
  );
end;
$$;

revoke all on function public.replace_golden_boot_stats(jsonb) from public, anon, authenticated;
grant execute on function public.replace_golden_boot_stats(jsonb) to service_role;
