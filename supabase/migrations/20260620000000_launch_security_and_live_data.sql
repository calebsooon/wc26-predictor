-- Launch hardening: secure account bootstrap, private leagues, live-data audit
-- records, and the one missing high-value player lookup index.

-- Keep SECURITY DEFINER helpers deterministic and resistant to search_path abuse.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Profiles are created by Auth, never by a browser client. This prevents a
-- caller from supplying is_admin=true while preserving editable preferences.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
begin
  base_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'player'
  );
  candidate := left(base_name, 32);

  if exists (select 1 from public.profiles where username = candidate) then
    candidate := left(base_name, 25) || '-' || left(new.id::text, 6);
  end if;

  insert into public.profiles (id, username, is_admin)
  values (new.id, candidate, false)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill any Auth accounts that predate the trigger without attempting to
-- infer privileged roles from client-controlled data.
insert into public.profiles (id, username, is_admin)
select
  u.id,
  left(coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'player'), 25) || '-' || left(u.id::text, 6),
  false
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

drop policy if exists "profiles: own insert" on public.profiles;
drop policy if exists "profiles: own update" on public.profiles;
drop policy if exists "profiles: own safe update" on public.profiles;

revoke insert, update on public.profiles from authenticated;
grant update (username, avatar_url, active_league_id, theme, colorblind, colorblind_scope, calendar_token)
  on public.profiles to authenticated;

create policy "profiles: own safe update"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Membership checks are used by multiple RLS policies without self-recursive
-- policy queries on league_members.
create or replace function public.is_league_member(target_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = target_league_id and user_id = auth.uid()
  );
$$;
revoke all on function public.is_league_member(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;

create or replace function public.shares_revealed_league(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    join public.leagues league on league.id = mine.league_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
      and league.reveal_predictions = true
  );
$$;
revoke all on function public.shares_revealed_league(uuid) from public, anon;
grant execute on function public.shares_revealed_league(uuid) to authenticated;

-- A user may only point their profile at a league they already joined. This is
-- recreated after the helper exists so a fresh migration has no dependency gap.
drop policy if exists "profiles: own safe update" on public.profiles;
create policy "profiles: own safe update"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (active_league_id is null or public.is_league_member(active_league_id))
  );

drop policy if exists "leagues: authenticated read" on public.leagues;
create policy "leagues: member or admin read"
  on public.leagues for select to authenticated
  using (public.is_league_member(id) or public.is_admin());

drop policy if exists "league_members: authenticated read" on public.league_members;
drop policy if exists "league_members: self or admin insert" on public.league_members;
drop policy if exists "league_members: self or admin delete" on public.league_members;

create policy "league_members: league member read"
  on public.league_members for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

create policy "league_members: admin insert"
  on public.league_members for insert to authenticated
  with check (public.is_admin());

create policy "league_members: self leave or admin delete"
  on public.league_members for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Invite codes are secret. Only a member may receive their own league's code.
revoke select (join_code) on public.leagues from authenticated;

create or replace function public.get_my_leagues()
returns table (
  id uuid,
  name text,
  type text,
  join_code text,
  scoring jsonb,
  bracket_enabled boolean,
  reveal_predictions boolean,
  prize_pool boolean,
  banners_enabled boolean,
  label_id uuid,
  label_name text,
  label_color text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    l.id, l.name, l.type,
    case when public.is_admin() then l.join_code else null end,
    l.scoring, l.bracket_enabled,
    l.reveal_predictions, l.prize_pool, l.banners_enabled, l.label_id,
    ll.name, ll.color
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  left join public.league_labels ll on ll.id = l.label_id
  where lm.user_id = auth.uid()
  order by l.created_at;
$$;
revoke all on function public.get_my_leagues() from public, anon;
grant execute on function public.get_my_leagues() to authenticated;

create or replace function public.get_admin_leagues()
returns table (
  id uuid,
  name text,
  type text,
  join_code text,
  scoring jsonb,
  bracket_enabled boolean,
  reveal_predictions boolean,
  prize_pool boolean,
  banners_enabled boolean,
  label_id uuid,
  label_name text,
  label_color text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    l.id, l.name, l.type, l.join_code, l.scoring, l.bracket_enabled,
    l.reveal_predictions, l.prize_pool, l.banners_enabled, l.label_id,
    ll.name, ll.color
  from public.leagues l
  left join public.league_labels ll on ll.id = l.label_id
  order by l.created_at;
end;
$$;
revoke all on function public.get_admin_leagues() from public, anon;
grant execute on function public.get_admin_leagues() to authenticated;

create or replace function public.join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select id into v_league_id
  from public.leagues
  where upper(join_code) = upper(trim(p_code));

  if v_league_id is null then
    raise exception 'Invalid league code';
  end if;

  insert into public.league_members (league_id, user_id)
  values (v_league_id, auth.uid())
  on conflict (league_id, user_id) do nothing;

  update public.profiles
  set active_league_id = coalesce(active_league_id, v_league_id)
  where id = auth.uid();

  return v_league_id;
end;
$$;
revoke all on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

drop policy if exists "league_banners: authenticated read" on public.league_banners;
create policy "league_banners: league member read"
  on public.league_banners for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists "rank_snapshots: authenticated read" on public.rank_snapshots;
create policy "rank_snapshots: league member read"
  on public.rank_snapshots for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists "group_predictions: authenticated read" on public.group_predictions;
create policy "group_predictions: read own or revealed"
  on public.group_predictions for select to authenticated
  using (user_id = auth.uid() or public.shares_revealed_league(user_id));

drop policy if exists "tournament_predictions: authenticated read" on public.tournament_predictions;
create policy "tournament_predictions: read own or revealed"
  on public.tournament_predictions for select to authenticated
  using (user_id = auth.uid() or public.shares_revealed_league(user_id));

create index if not exists players_team_name_idx on public.players (team_name);

alter table public.matches
  add column if not exists provider_fixture_id bigint unique;

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lineups', 'results', 'injuries')),
  trigger_source text not null check (trigger_source in ('admin', 'cron')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  details jsonb not null default '{}'::jsonb
);

create index if not exists sync_runs_kind_started_idx
  on public.sync_runs (kind, started_at desc);

alter table public.sync_runs enable row level security;
create policy "sync_runs: admin read"
  on public.sync_runs for select to authenticated using (public.is_admin());

-- Keep provider refreshes all-or-nothing. A bad payload must never leave a
-- match with its old lineup or injury state erased.
create or replace function public.replace_match_lineup(
  p_match_id uuid,
  p_rows jsonb,
  p_home_formation text,
  p_away_formation text,
  p_provider_fixture_id bigint
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
    row.position_label, row.grid, row.sort_order, row.source
  from jsonb_to_recordset(p_rows) as row(
    team_code text,
    player_id integer,
    is_starting boolean,
    shirt_number integer,
    position_label text,
    grid text,
    sort_order integer,
    source text
  );

  update public.matches
  set home_formation = p_home_formation,
      away_formation = p_away_formation,
      provider_fixture_id = p_provider_fixture_id
  where id = p_match_id;
end;
$$;

create or replace function public.replace_injury_flags(p_flags jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.players
  set injured = false, injury_type = null
  where injured = true;

  update public.players p
  set injured = true, injury_type = flags.injury_type
  from jsonb_to_recordset(p_flags) as flags(player_id integer, injury_type text)
  where p.id = flags.player_id;
end;
$$;

revoke all on function public.replace_match_lineup(uuid, jsonb, text, text, bigint) from public, anon, authenticated;
revoke all on function public.replace_injury_flags(jsonb) from public, anon, authenticated;
grant execute on function public.replace_match_lineup(uuid, jsonb, text, text, bigint) to service_role;
grant execute on function public.replace_injury_flags(jsonb) to service_role;
