-- ============================================================
-- 20260620000001_predictions_kickoff_visibility.sql
--   Fix: in reveal-OFF leagues, other members' match predictions stayed hidden
--   after a match closed until an admin scored it. The UI treats a match as
--   closed at kickoff TIME (match_date <= now), but the read policy only opened
--   on is_locked / scored — which an admin sets later. Reveal at actual kickoff
--   time so visibility matches the UI's consensus / prediction-wall gate.
--
--   Reuses the shares_revealed_league() helper from the launch-security migration
--   for the pre-kickoff reveal-league clause (SECURITY DEFINER, no RLS recursion).
-- ============================================================

drop policy if exists "predictions: read own or revealed" on public.predictions;

create policy "predictions: read own or revealed"
  on public.predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and (m.is_locked = true or m.real_home_score is not null or m.match_date <= now())
    )
    or public.shares_revealed_league(predictions.user_id)
  );
