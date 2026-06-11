-- ============================================================
-- 20260612000002_league_labels.sql
--   Custom, reusable league labels (name + colour), admin-managed.
--   • league_labels        — the reusable set
--   • leagues.label_id     — which label a league displays
--   • leagues.prize_pool   — money behaviour, decoupled from the label
--   Backfill: seed "Money"/"Points" labels, set prize_pool from old type.
-- ============================================================

create table if not exists league_labels (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#22C55E',   -- hex
  created_at timestamptz default now()
);

alter table league_labels enable row level security;

create policy "league_labels: authenticated read"
  on league_labels for select to authenticated using (true);

create policy "league_labels: admin write"
  on league_labels for all to authenticated
  using (is_admin()) with check (is_admin());

alter table leagues
  add column if not exists label_id uuid references league_labels (id) on delete set null;

alter table leagues
  add column if not exists prize_pool boolean not null default false;

-- Money behaviour migrates from the old type
update leagues set prize_pool = true where type = 'money' and prize_pool = false;

-- Seed default labels once and assign them based on the old type
do $$
declare v_money uuid; v_points uuid;
begin
  if not exists (select 1 from league_labels) then
    insert into league_labels (name, color) values ('Money', '#EAB308') returning id into v_money;
    insert into league_labels (name, color) values ('Points', '#22C55E') returning id into v_points;
    update leagues set label_id = v_money where type = 'money' and label_id is null;
    update leagues set label_id = v_points where type <> 'money' and label_id is null;
  end if;
end $$;
