create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions: own read"
  on push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions: own insert"
  on push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions: own delete"
  on push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- Service role can read all subscriptions (for sending notifications)
create policy "push_subscriptions: service role read"
  on push_subscriptions for select
  to service_role
  using (true);
