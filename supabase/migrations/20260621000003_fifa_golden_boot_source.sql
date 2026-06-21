-- Cache FIFA's published table exactly, including the official rank and its
-- tie breakers. The sync runs server-side; players only receive the cache.
alter table public.golden_boot_stats
  add column if not exists minutes_played integer not null default 0 check (minutes_played >= 0),
  add column if not exists fifa_rank integer check (fifa_rank > 0),
  add column if not exists fifa_assist_rank integer check (fifa_assist_rank > 0),
  add column if not exists source text not null default 'kickoff-events' check (source in ('fifa', 'kickoff-events'));

create index if not exists golden_boot_stats_fifa_rank_idx
  on public.golden_boot_stats (fifa_rank asc nulls last);

create index if not exists golden_boot_stats_fifa_assist_rank_idx
  on public.golden_boot_stats (fifa_assist_rank asc nulls last);

create or replace function public.replace_golden_boot_stats(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.golden_boot_stats where provider_player_id is not null;

  insert into public.golden_boot_stats (
    provider_player_id, player_id, team_code, player_name, goals, assists,
    minutes_played, fifa_rank, fifa_assist_rank, photo_url, source, updated_at
  )
  select
    row.provider_player_id, row.player_id, row.team_code, row.player_name,
    row.goals, row.assists, row.minutes_played, row.fifa_rank,
    row.fifa_assist_rank, row.photo_url, row.source, now()
  from jsonb_to_recordset(p_rows) as row(
    provider_player_id bigint,
    player_id integer,
    team_code text,
    player_name text,
    goals integer,
    assists integer,
    minutes_played integer,
    fifa_rank integer,
    fifa_assist_rank integer,
    photo_url text,
    source text
  );
end;
$$;

revoke all on function public.replace_golden_boot_stats(jsonb) from public, anon, authenticated;
grant execute on function public.replace_golden_boot_stats(jsonb) to service_role;
