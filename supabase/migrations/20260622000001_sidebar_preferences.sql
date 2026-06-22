-- Per-user desktop navigation visibility. This is a small preference payload
-- rather than a new table: Home remains fixed in the UI and the client only
-- accepts the known list of optional item keys.

alter table public.profiles
  add column if not exists sidebar_preferences jsonb not null default '{"version":1,"hidden":[]}'::jsonb;

-- Keep the safe, column-level profile update model introduced in the launch
-- hardening migration. The existing own-profile RLS policy still supplies the
-- row ownership check.
grant update (sidebar_preferences) on public.profiles to authenticated;
