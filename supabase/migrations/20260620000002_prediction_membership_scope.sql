-- Keep post-kickoff prediction visibility inside a shared private league.
-- The previous kickoff policy checked only the match state, which exposed every
-- closed-match prediction to any authenticated account.

create or replace function public.shares_league(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;
revoke all on function public.shares_league(uuid) from public, anon;
grant execute on function public.shares_league(uuid) to authenticated;

drop policy if exists "predictions: read own or revealed" on public.predictions;

create policy "predictions: read own or revealed"
  on public.predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.shares_revealed_league(predictions.user_id)
    or (
      public.shares_league(predictions.user_id)
      and exists (
        select 1 from public.matches m
        where m.id = predictions.match_id
          and (m.is_locked = true or m.real_home_score is not null or m.match_date <= now())
      )
    )
  );

-- Scored group and tournament rows must stay visible to league standings even
-- when picks are hidden before resolution. At that point the outcome is known,
-- so revealing the underlying pick is no longer a competitive advantage.
drop policy if exists "group_predictions: read own or revealed" on public.group_predictions;
create policy "group_predictions: read own, revealed, or scored league row"
  on public.group_predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.shares_revealed_league(user_id)
    or (public.shares_league(user_id) and points_awarded is not null)
  );

drop policy if exists "tournament_predictions: read own or revealed" on public.tournament_predictions;
create policy "tournament_predictions: read own, revealed, or scored league row"
  on public.tournament_predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.shares_revealed_league(user_id)
    or (
      public.shares_league(user_id)
      and (pts_champion is not null or pts_runner_up is not null or pts_semi is not null or pts_quarter is not null)
    )
  );
