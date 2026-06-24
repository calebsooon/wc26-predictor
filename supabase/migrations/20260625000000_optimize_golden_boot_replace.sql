-- Avoid full-table replacement for FIFA's published Golden Boot cache.
-- Incremental upserts keep the write path fast and avoid timeouts when the
-- table is briefly busy, while still deleting rows that vanished from FIFA's
-- latest published standings.
create or replace function public.replace_golden_boot_stats(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.golden_boot_stats (
    provider_player_id,
    player_id,
    team_code,
    player_name,
    goals,
    assists,
    minutes_played,
    fifa_rank,
    fifa_assist_rank,
    fifa_assist_order,
    photo_url,
    source,
    updated_at
  )
  select
    row.provider_player_id,
    row.player_id,
    row.team_code,
    row.player_name,
    row.goals,
    row.assists,
    row.minutes_played,
    row.fifa_rank,
    row.fifa_assist_rank,
    row.fifa_assist_order,
    row.photo_url,
    row.source,
    now()
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
  )
  on conflict (provider_player_id) do update
  set
    player_id = excluded.player_id,
    team_code = excluded.team_code,
    player_name = excluded.player_name,
    goals = excluded.goals,
    assists = excluded.assists,
    minutes_played = excluded.minutes_played,
    fifa_rank = excluded.fifa_rank,
    fifa_assist_rank = excluded.fifa_assist_rank,
    fifa_assist_order = excluded.fifa_assist_order,
    photo_url = excluded.photo_url,
    source = excluded.source,
    updated_at = now();

  delete from public.golden_boot_stats as existing
  where existing.provider_player_id is not null
    and not exists (
      select 1
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
      )
      where row.provider_player_id = existing.provider_player_id
    );
end;
$$;

revoke all on function public.replace_golden_boot_stats(jsonb) from public, anon, authenticated;
grant execute on function public.replace_golden_boot_stats(jsonb) to service_role;
