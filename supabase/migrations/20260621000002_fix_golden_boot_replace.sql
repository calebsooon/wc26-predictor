-- Supabase's SQL safety guard requires an explicit predicate for replacement
-- deletes, even inside a SECURITY DEFINER function.
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
