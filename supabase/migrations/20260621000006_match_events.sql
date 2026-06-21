-- Verified match events for the live Match Centre. Provider writes happen only
-- through the residential sync; clients read a compact indexed timeline.
create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_code text not null,
  minute smallint not null check (minute between 1 and 130),
  type text not null check (type in ('goal', 'yellow_card', 'red_card')),
  detail text,
  player_id integer references public.players(id) on delete set null,
  assist_id integer references public.players(id) on delete set null,
  provider_key text not null,
  source text not null default 'kickoff' check (source in ('kickoff', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, provider_key)
);

create index if not exists match_events_match_minute_idx
  on public.match_events (match_id, minute, created_at);

alter table public.match_events enable row level security;

create policy "match_events: authenticated read"
  on public.match_events for select to authenticated using (true);

create policy "match_events: admin insert"
  on public.match_events for insert to authenticated with check (public.is_admin());

create policy "match_events: admin update"
  on public.match_events for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "match_events: admin delete"
  on public.match_events for delete to authenticated using (public.is_admin());
