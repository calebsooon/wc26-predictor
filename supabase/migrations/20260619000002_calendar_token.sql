-- Personal calendar feed token for ICS export / subscription.
-- Each profile gets an unguessable token that gates its public calendar feed
-- (calendar apps can't authenticate, so the token stands in for a session).
-- A volatile default backfills every existing row with a distinct uuid.

alter table profiles
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_calendar_token_idx
  on profiles (calendar_token);

-- Lets a signed-in user rotate their token to revoke old subscriptions:
--   update profiles set calendar_token = gen_random_uuid() where id = auth.uid();
-- (Covered by the existing "profiles: own update" RLS policy.)
