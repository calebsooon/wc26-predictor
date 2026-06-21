import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(resolve(root, 'supabase/migrations/20260620000000_launch_security_and_live_data.sql'), 'utf8')
const predictionScopeMigration = readFileSync(resolve(root, 'supabase/migrations/20260620000002_prediction_membership_scope.sql'), 'utf8')
const substitutionMigration = readFileSync(resolve(root, 'supabase/migrations/20260621000000_lineup_substitutions.sql'), 'utf8')
const loginPage = readFileSync(resolve(root, 'app/login/page.tsx'), 'utf8')

describe('launch security migration contract', () => {
  it('uses database-owned profile bootstrap and denies browser privilege writes', () => {
    expect(migration).toContain('create trigger on_auth_user_created')
    expect(migration).toContain('revoke insert, update on public.profiles from authenticated')
    expect(migration).toContain('grant update (username, avatar_url, active_league_id, theme, colorblind, colorblind_scope, calendar_token)')
    expect(loginPage).not.toContain("from('profiles').upsert")
  })

  it('keeps invite codes and membership writes behind scoped functions and policies', () => {
    expect(migration).toContain('revoke select (join_code) on public.leagues from authenticated')
    expect(migration).toContain('create policy "league_members: admin insert"')
    expect(migration).toContain('create or replace function public.join_league(p_code text)')
    expect(migration).toContain('revoke all on function public.join_league(text) from public, anon')
  })

  it('removes implicit public execution from elevated helpers', () => {
    expect(migration).toContain('revoke all on function public.is_admin() from public, anon')
    expect(migration).toContain('revoke all on function public.get_my_leagues() from public, anon')
    expect(migration).toContain('revoke all on function public.get_admin_leagues() from public, anon')
  })

  it('limits post-kickoff prediction reads to league-mates', () => {
    expect(predictionScopeMigration).toContain('create or replace function public.shares_league')
    expect(predictionScopeMigration).toContain('public.shares_league(predictions.user_id)')
    expect(predictionScopeMigration).toContain('revoke all on function public.shares_league(uuid) from public, anon')
    expect(predictionScopeMigration).toContain('group_predictions: read own, revealed, or scored league row')
    expect(predictionScopeMigration).toContain('tournament_predictions: read own, revealed, or scored league row')
  })

  it('keeps live substitutions readable to members but writable only by admins', () => {
    expect(substitutionMigration).toContain('alter table public.lineup_substitutions enable row level security')
    expect(substitutionMigration).toContain('lineup_substitutions: authenticated read')
    expect(substitutionMigration).toContain('lineup_substitutions: admin insert')
    expect(substitutionMigration).toContain('lineup_substitutions: admin delete')
  })
})
