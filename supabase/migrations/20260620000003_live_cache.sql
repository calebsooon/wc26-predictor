-- ============================================================
-- 20260620000003_live_cache.sql
--   Generic cache for live provider data that Vercel can't fetch directly
--   (Kickoffapi's Cloudflare blocks datacenter IPs). A residential script
--   (scripts/sync-golden-boot.ts) writes here via the service role; the app
--   reads it instead of calling the provider live.
-- ============================================================

create table if not exists public.live_cache (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.live_cache enable row level security;

-- Anyone signed in may read cached live data; writes are service-role only.
create policy "live_cache: authenticated read"
  on public.live_cache for select to authenticated using (true);
