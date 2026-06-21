import { describe, expect, it } from 'vitest'
import { buildGameweekRecap } from './gameweek-recap'
import { DEFAULT_WEIGHTS } from './scoring'

describe('buildGameweekRecap', () => {
  const profiles = [{ id: 'a', username: 'Ann', avatar_url: null }, { id: 'b', username: 'Ben', avatar_url: null }]
  const matches = [{ id: 'old', gw_number: 1, home_team: 'AAA', away_team: 'BBB', real_home_score: 1, real_away_score: 0 }, { id: 'now', gw_number: 2, home_team: 'CCC', away_team: 'DDD', real_home_score: 2, real_away_score: 1 }]
  const hit = { points_awarded: 6, pts_outcome: 3, pts_exact: 3, pts_goal_diff: 0, pts_total_goals: 0, pts_team_goals: 0, pts_btts: 0, pts_first_team: 0, pts_first_scorer: 0 }

  it('marks a completed week final and calculates its leader', () => {
    const recap = buildGameweekRecap({ gameweek: 2, matches, profiles, userId: 'a', weights: DEFAULT_WEIGHTS, predictions: [
      { user_id: 'a', match_id: 'old', pred_home: 1, pred_away: 0, ...hit },
      { user_id: 'b', match_id: 'now', pred_home: 2, pred_away: 1, ...hit },
      { user_id: 'a', match_id: 'now', pred_home: 0, pred_away: 0, points_awarded: 0 },
    ] })
    expect(recap.state).toBe('final')
    expect(recap.leader?.name).toBe('Ben')
    expect(recap.stories).not.toHaveLength(0)
  })
})
