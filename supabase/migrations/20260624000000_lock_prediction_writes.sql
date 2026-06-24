-- ============================================================
-- 20260624000000_lock_prediction_writes.sql
--
-- Enforce submission deadlines on prediction writes at the DATABASE level.
--
-- Until now the only write protection on the three prediction tables was
-- ownership (RLS `with check (user_id = auth.uid())`). The kickoff deadline
-- was enforced only in the browser, so a user could bypass the UI and write a
-- prediction directly through PostgREST AFTER a match/group/phase had started —
-- or even after the real result was published — and bank the points. The
-- tournament bracket had no time gate at all.
--
-- These BEFORE INSERT/UPDATE triggers close that hole by rejecting any
-- end-user write once the relevant fixture has locked. They mirror the exact
-- conditions the match UI already uses (is_locked OR result published OR
-- match_date in the past).
--
-- Backend writes (admin scoring, cron sync, rescoring) run with the service
-- role and therefore have no `auth.uid()` — those bypass the deadline so that
-- pts_* columns can still be updated after kickoff.
-- ============================================================

-- ---------- match predictions ----------
create or replace function public.enforce_prediction_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  -- Service-role / backend writes (no authenticated end user) bypass the lock.
  if auth.uid() is null then
    return new;
  end if;

  select is_locked, real_home_score, match_date
    into m
    from matches
   where id = new.match_id;

  if not found then
    raise exception 'prediction references an unknown match';
  end if;

  if m.is_locked or m.real_home_score is not null or m.match_date <= now() then
    raise exception 'predictions are locked for this match';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_prediction_lock on predictions;
create trigger trg_enforce_prediction_lock
  before insert or update on predictions
  for each row execute function public.enforce_prediction_lock();

-- ---------- group-order predictions ----------
-- A group prediction locks the moment the first match in that group kicks off.
create or replace function public.enforce_group_prediction_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1
      from matches
     where group_name = new.group_name
       and (is_locked or real_home_score is not null or match_date <= now())
  ) then
    raise exception 'group predictions are locked — group % has already started', new.group_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_group_prediction_lock on group_predictions;
create trigger trg_enforce_group_prediction_lock
  before insert or update on group_predictions
  for each row execute function public.enforce_group_prediction_lock();

-- ---------- tournament bracket predictions ----------
-- 'pre'  bracket locks at the tournament's very first kickoff.
-- 'r32'  bracket locks at the first knockout kickoff (matches have no group_name).
create or replace function public.enforce_tournament_prediction_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deadline timestamptz;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.phase = 'pre' then
    select min(match_date) into deadline from matches;
  else
    select min(match_date) into deadline from matches where group_name is null;
  end if;

  if deadline is not null and deadline <= now() then
    raise exception 'tournament bracket (%) is locked', new.phase;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_tournament_prediction_lock on tournament_predictions;
create trigger trg_enforce_tournament_prediction_lock
  before insert or update on tournament_predictions
  for each row execute function public.enforce_tournament_prediction_lock();
