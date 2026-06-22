-- Manual formation controls supplement — never overwrite — the formation
-- supplied by FIFA. The match page resolves override -> FIFA formation, then
-- applies the latest verified in-match shape change for the live/current XI.

alter table public.matches
  add column if not exists home_formation_override text,
  add column if not exists away_formation_override text;

alter table public.matches
  drop constraint if exists matches_home_formation_override_format;
alter table public.matches
  add constraint matches_home_formation_override_format
  check (home_formation_override is null or home_formation_override ~ '^[1-5](-[1-5]){1,4}$');

alter table public.matches
  drop constraint if exists matches_away_formation_override_format;
alter table public.matches
  add constraint matches_away_formation_override_format
  check (away_formation_override is null or away_formation_override ~ '^[1-5](-[1-5]){1,4}$');

create table if not exists public.match_formation_changes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_code text not null,
  minute smallint not null check (minute between 0 and 130),
  formation text not null check (formation ~ '^[1-5](-[1-5]){1,4}$'),
  source text not null default 'manual' check (source in ('fifa', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_code, minute)
);

create index if not exists match_formation_changes_match_team_minute_idx
  on public.match_formation_changes (match_id, team_code, minute, created_at);

alter table public.match_formation_changes enable row level security;

create policy "match_formation_changes: authenticated read"
  on public.match_formation_changes for select to authenticated using (true);

create policy "match_formation_changes: admin insert"
  on public.match_formation_changes for insert to authenticated with check (public.is_admin());

create policy "match_formation_changes: admin update"
  on public.match_formation_changes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "match_formation_changes: admin delete"
  on public.match_formation_changes for delete to authenticated using (public.is_admin());
