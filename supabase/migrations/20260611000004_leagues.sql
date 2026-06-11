-- ============================================================
-- 20260611000004_leagues.sql
--   Multi-league support.
--   • leagues            — named groups; type 'money' (prize pool) or 'points'
--   • league_members     — membership (shared predictions, separate leaderboards)
--   • profiles.active_league_id — league the user is currently viewing
--   • rank_snapshots.league_id  — per-league rank-movement history
--   • join_league(code)  — security-definer join-by-code
--   Backfill: a main money league seeded with all existing users.
-- ============================================================

-- ── Leagues ────────────────────────────────────────────────────
create table if not exists leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text not null unique,
  type       text not null default 'points' check (type in ('money', 'points')),
  scoring    jsonb,                          -- per-league weight overrides; null = default weights
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz default now()
);

alter table leagues enable row level security;

-- Anyone authenticated may read leagues (needed to validate a join code + render names)
create policy "leagues: authenticated read"
  on leagues for select to authenticated using (true);

create policy "leagues: admin insert"
  on leagues for insert to authenticated with check (is_admin());

create policy "leagues: admin update"
  on leagues for update to authenticated using (is_admin()) with check (is_admin());

create policy "leagues: admin delete"
  on leagues for delete to authenticated using (is_admin());

-- ── League members ─────────────────────────────────────────────
create table if not exists league_members (
  league_id uuid not null references leagues (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (league_id, user_id)
);

create index if not exists league_members_user on league_members (user_id);

alter table league_members enable row level security;

-- Authenticated read (consistent with predictions/profiles; avoids RLS self-recursion).
-- Membership is low-sensitivity here and leaderboards need to list a league's members.
create policy "league_members: authenticated read"
  on league_members for select to authenticated using (true);

-- A user can add only themselves; admins can add anyone
create policy "league_members: self or admin insert"
  on league_members for insert to authenticated
  with check (user_id = auth.uid() or is_admin());

create policy "league_members: self or admin delete"
  on league_members for delete to authenticated
  using (user_id = auth.uid() or is_admin());

-- ── Active league on profiles ──────────────────────────────────
alter table profiles
  add column if not exists active_league_id uuid references leagues (id) on delete set null;

-- ── Per-league rank snapshots ──────────────────────────────────
alter table rank_snapshots
  add column if not exists league_id uuid references leagues (id) on delete cascade;

create index if not exists rank_snapshots_league_time
  on rank_snapshots (league_id, snapshot_at desc);

-- ── Join-by-code (validates code, joins caller, returns league id) ──
create or replace function join_league(p_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_league_id uuid;
begin
  select id into v_league_id
  from leagues
  where upper(join_code) = upper(trim(p_code));

  if v_league_id is null then
    raise exception 'Invalid league code';
  end if;

  insert into league_members (league_id, user_id)
  values (v_league_id, auth.uid())
  on conflict (league_id, user_id) do nothing;

  -- Make it the active league if the user has none set
  update profiles
  set active_league_id = coalesce(active_league_id, v_league_id)
  where id = auth.uid();

  return v_league_id;
end;
$$;

grant execute on function join_league(text) to authenticated;

-- ── Backfill: main money league seeded with every existing user ──
do $$
declare
  v_league_id uuid;
begin
  if not exists (select 1 from leagues where type = 'money') then
    insert into leagues (name, join_code, type)
    values ('Main League', 'MAIN26', 'money')
    returning id into v_league_id;

    insert into league_members (league_id, user_id)
    select v_league_id, id from profiles
    on conflict do nothing;

    update profiles
    set active_league_id = v_league_id
    where active_league_id is null;
  end if;
end $$;
