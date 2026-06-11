-- ============================================================
-- 20260611000005_bracket_phases.sql
--   • leagues.bracket_enabled — per-league toggle for the for-fun bracket
--   • tournament_predictions.phase — two for-fun predictions per user:
--       'pre' (pre-tournament) and 'r32' (re-evaluation after the group stage)
--     PK becomes (user_id, phase).
-- ============================================================

alter table leagues
  add column if not exists bracket_enabled boolean not null default true;

alter table tournament_predictions
  add column if not exists phase text not null default 'pre';

-- Constrain phase values (guard against re-runs)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournament_predictions_phase_chk'
  ) then
    alter table tournament_predictions
      add constraint tournament_predictions_phase_chk check (phase in ('pre', 'r32'));
  end if;
end $$;

-- Re-key on (user_id, phase) so each user can hold both predictions
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'tournament_predictions_pkey' and contype = 'p'
  ) then
    alter table tournament_predictions drop constraint tournament_predictions_pkey;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tournament_predictions'::regclass and contype = 'p'
  ) then
    alter table tournament_predictions add primary key (user_id, phase);
  end if;
end $$;
