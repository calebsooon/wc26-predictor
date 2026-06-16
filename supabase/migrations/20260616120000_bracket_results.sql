-- Stores the real tournament bracket results (set by admin after each round).
-- Single row per tournament; upserted on primary key.
create table if not exists public.bracket_results (
  id            text primary key default 'wc2026',
  champion      text,
  runner_up     text,
  semi          text[] not null default '{}',
  quarter       text[] not null default '{}',
  top16         text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id)
);

-- Only admins can write; anyone authenticated can read (bracket page loads it).
alter table public.bracket_results enable row level security;

create policy "admins can upsert bracket_results"
  on public.bracket_results for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "authenticated users can read bracket_results"
  on public.bracket_results for select
  using (auth.role() = 'authenticated');
