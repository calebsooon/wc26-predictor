-- FIFA-backed team centre cache. Runtime reads stay inside Supabase; the
-- importer is the only code that contacts FIFA.
create sequence if not exists public.players_internal_id_seq;
select setval(
  'public.players_internal_id_seq',
  greatest(coalesce((select max(id) from public.players), 0), 1),
  true
);
alter table public.players alter column id set default nextval('public.players_internal_id_seq');

alter table public.players
  add column if not exists fifa_player_id bigint unique,
  add column if not exists team_code text,
  add column if not exists fifa_image_source text,
  add column if not exists fifa_updated_at timestamptz;

create index if not exists players_team_code_name_idx on public.players (team_code, name);
create index if not exists players_fifa_player_id_idx on public.players (fifa_player_id);

create table if not exists public.fifa_teams (
  code text primary key,
  fifa_team_id text not null unique,
  name text not null,
  confederation text not null check (confederation in ('AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA')),
  group_letter text,
  is_host boolean not null default false,
  flag_url text,
  crest_url text,
  stats jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.fifa_player_stats (
  fifa_player_id bigint primary key references public.players(fifa_player_id) on delete cascade,
  player_id integer not null references public.players(id) on delete cascade,
  team_code text not null references public.fifa_teams(code) on delete cascade,
  jersey_number integer,
  position text,
  height_cm integer,
  weight_kg integer,
  stats jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists fifa_player_stats_team_position_jersey_idx
  on public.fifa_player_stats (team_code, position, jersey_number);

alter table public.fifa_teams enable row level security;
alter table public.fifa_player_stats enable row level security;

create policy "fifa_teams: authenticated read" on public.fifa_teams for select to authenticated using (true);
create policy "fifa_player_stats: authenticated read" on public.fifa_player_stats for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fifa-media', 'fifa-media', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fifa-media: public read" on storage.objects;
create policy "fifa-media: public read" on storage.objects for select using (bucket_id = 'fifa-media');

create or replace function public.replace_fifa_team_cache(p_teams jsonb, p_players jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fifa_teams (
    code, fifa_team_id, name, confederation, group_letter, is_host,
    flag_url, crest_url, stats, source_updated_at, updated_at
  )
  select row.code, row.fifa_team_id, row.name, row.confederation, row.group_letter,
    row.is_host, row.flag_url, row.crest_url, row.stats, row.source_updated_at, now()
  from jsonb_to_recordset(p_teams) as row(
    code text, fifa_team_id text, name text, confederation text, group_letter text,
    is_host boolean, flag_url text, crest_url text, stats jsonb, source_updated_at timestamptz
  )
  on conflict (code) do update set
    fifa_team_id = excluded.fifa_team_id,
    name = excluded.name,
    confederation = excluded.confederation,
    group_letter = excluded.group_letter,
    is_host = excluded.is_host,
    flag_url = excluded.flag_url,
    crest_url = excluded.crest_url,
    stats = excluded.stats,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  insert into public.players (
    id, fifa_player_id, name, position, nationality, team_name, team_code,
    jersey_number, photo_url, dob, fifa_image_source, fifa_updated_at, last_updated
  )
  select coalesce(row.player_id, nextval('public.players_internal_id_seq')),
    row.fifa_player_id, row.name, row.position, row.nationality, row.team_name,
    row.team_code, row.jersey_number, row.photo_url, row.dob, row.fifa_image_source,
    row.source_updated_at, now()
  from jsonb_to_recordset(p_players) as row(
    player_id integer, fifa_player_id bigint, name text, position text, nationality text,
    team_name text, team_code text, jersey_number integer, photo_url text, dob date,
    fifa_image_source text, source_updated_at timestamptz
  )
  on conflict (id) do update set
    fifa_player_id = excluded.fifa_player_id,
    name = excluded.name,
    position = excluded.position,
    nationality = excluded.nationality,
    team_name = excluded.team_name,
    team_code = excluded.team_code,
    jersey_number = excluded.jersey_number,
    photo_url = excluded.photo_url,
    dob = excluded.dob,
    fifa_image_source = excluded.fifa_image_source,
    fifa_updated_at = excluded.fifa_updated_at,
    last_updated = now();

  delete from public.fifa_player_stats
  where team_code in (select row.code from jsonb_to_recordset(p_teams) as row(code text));

  insert into public.fifa_player_stats (
    fifa_player_id, player_id, team_code, jersey_number, position, height_cm,
    weight_kg, stats, source_updated_at, updated_at
  )
  select row.fifa_player_id, player.id, row.team_code, row.jersey_number,
    row.position, row.height_cm, row.weight_kg, row.stats, row.source_updated_at, now()
  from jsonb_to_recordset(p_players) as row(
    fifa_player_id bigint, team_code text, jersey_number integer, position text,
    height_cm integer, weight_kg integer, stats jsonb, source_updated_at timestamptz
  )
  join public.players player on player.fifa_player_id = row.fifa_player_id;
end;
$$;

revoke all on function public.replace_fifa_team_cache(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_fifa_team_cache(jsonb, jsonb) to service_role;
