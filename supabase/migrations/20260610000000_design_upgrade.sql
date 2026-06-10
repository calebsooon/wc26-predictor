-- ============================================================
-- BRACKET XI design upgrade
--   • multi-category scoring inputs (first goal team, first scorer,
--     knockout advance pick)
--   • per-category points breakdown on predictions
--   • group-order predictor table
-- ============================================================

-- ── Match result inputs (admin-entered) ─────────────────────────────────────
alter table matches add column if not exists first_goal_team      text;     -- home/away team code, or 'NONE'
alter table matches add column if not exists first_goal_player_id integer references players (id);

-- ── Prediction inputs ───────────────────────────────────────────────────────
alter table predictions add column if not exists pred_first_goal_team text;    -- home/away code or 'NONE'
alter table predictions add column if not exists pred_first_scorer_id integer references players (id);
alter table predictions add column if not exists pred_winner_team     text;    -- knockout advance pick (home/away code)

-- ── Per-category points breakdown (nullable until scored) ────────────────────
alter table predictions add column if not exists pts_outcome     integer;
alter table predictions add column if not exists pts_exact       integer;
alter table predictions add column if not exists pts_goal_diff   integer;
alter table predictions add column if not exists pts_total_goals integer;
alter table predictions add column if not exists pts_btts        integer;
alter table predictions add column if not exists pts_first_team  integer;
alter table predictions add column if not exists pts_first_scorer integer;
alter table predictions add column if not exists pts_knockout    integer;

-- ── Group-order predictor (single global league) ────────────────────────────
create table if not exists group_predictions (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    not null references auth.users (id) on delete cascade,
  group_name   text    not null,
  ranked_codes text[]  not null,
  updated_at   timestamptz default now(),
  unique (user_id, group_name)
);

alter table group_predictions enable row level security;

create policy "group_predictions: authenticated read"
  on group_predictions for select
  to authenticated
  using (true);

create policy "group_predictions: own insert"
  on group_predictions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "group_predictions: own update"
  on group_predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
