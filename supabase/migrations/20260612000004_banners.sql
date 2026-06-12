-- Banner slider feature
-- leagues.banners_enabled controls whether the slider is shown on the dashboard
alter table leagues
  add column if not exists banners_enabled boolean not null default false;

-- Per-league ordered banner images
create table if not exists league_banners (
  id            uuid        primary key default gen_random_uuid(),
  league_id     uuid        not null references leagues(id) on delete cascade,
  image_url     text        not null,
  storage_path  text        not null,           -- path inside the 'banners' bucket
  display_order integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists league_banners_league_idx on league_banners(league_id, display_order);

alter table league_banners enable row level security;

drop policy if exists "league_banners: authenticated read" on league_banners;
drop policy if exists "league_banners: authenticated insert" on league_banners;
drop policy if exists "league_banners: authenticated delete" on league_banners;
drop policy if exists "league_banners: admin insert" on league_banners;
drop policy if exists "league_banners: admin delete" on league_banners;

-- All authenticated users can read (the app filters by league_id)
create policy "league_banners: authenticated read"
  on league_banners for select to authenticated using (true);

-- Admins can manage banner metadata
create policy "league_banners: admin insert"
  on league_banners for insert to authenticated with check (is_admin());

create policy "league_banners: admin delete"
  on league_banners for delete to authenticated using (is_admin());

-- Public banners storage bucket (images served directly by URL)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'banners',
  'banners',
  true,
  10485760,   -- 10 MB per banner
  array['image/jpeg','image/jpg','image/png','image/gif','image/webp']
)
on conflict (id) do nothing;

drop policy if exists "banners: authenticated upload" on storage.objects;
drop policy if exists "banners: authenticated delete" on storage.objects;
drop policy if exists "banners: admin upload" on storage.objects;
drop policy if exists "banners: admin delete" on storage.objects;
drop policy if exists "banners: public read" on storage.objects;

-- Admins can upload and delete banner files
create policy "banners: admin upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'banners' and is_admin());

create policy "banners: admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'banners' and is_admin());

-- Public read (images embedded via <img src>)
create policy "banners: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'banners');
