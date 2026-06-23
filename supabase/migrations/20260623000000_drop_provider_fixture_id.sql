-- provider_fixture_id was the Kickoff API's fixture ID. The Kickoff API is
-- defunct (Cloudflare blocked). All sync now uses fifa_event_id instead.
alter table public.matches drop column if exists provider_fixture_id;
