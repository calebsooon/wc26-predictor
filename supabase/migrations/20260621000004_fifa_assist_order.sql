-- FIFA’s assists table uses tied displayed ranks but still has a deliberate
-- row order within each tie. Store both so MatchDay can reproduce it exactly.
alter table public.golden_boot_stats
  add column if not exists fifa_assist_order integer check (fifa_assist_order > 0);

create index if not exists golden_boot_stats_fifa_assist_order_idx
  on public.golden_boot_stats (fifa_assist_order asc nulls last);

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
    minutes_played, fifa_rank, fifa_assist_rank, fifa_assist_order, photo_url, source, updated_at
  )
  select
    row.provider_player_id, row.player_id, row.team_code, row.player_name,
    row.goals, row.assists, row.minutes_played, row.fifa_rank,
    row.fifa_assist_rank, row.fifa_assist_order, row.photo_url, row.source, now()
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
    fifa_assist_order integer,
    photo_url text,
    source text
  );
end;
$$;

revoke all on function public.replace_golden_boot_stats(jsonb) from public, anon, authenticated;
grant execute on function public.replace_golden_boot_stats(jsonb) to service_role;
