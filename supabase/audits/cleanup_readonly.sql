-- Read-only cleanup audit for MatchDay.
-- Run sections independently in the Supabase SQL editor if you want targeted output.

-- Profiles pointing at missing active leagues.
select p.id, p.username, p.active_league_id
from profiles p
left join leagues l on l.id = p.active_league_id
where p.active_league_id is not null
  and l.id is null;

-- League memberships pointing at missing users or leagues.
select lm.*
from league_members lm
left join leagues l on l.id = lm.league_id
left join profiles p on p.id = lm.user_id
where l.id is null
   or p.id is null;

-- Predictions pointing at missing matches or users.
select pr.user_id, pr.match_id
from predictions pr
left join matches m on m.id = pr.match_id
left join profiles p on p.id = pr.user_id
where m.id is null
   or p.id is null;

-- Matches without gameweek numbers.
select id, match_date, home_team, away_team, group_name, gameweek, gw_number
from matches
where gw_number is null
order by match_date;

-- Scored predictions that are missing any scoring breakdown column.
select user_id, match_id, points_awarded
from predictions
where points_awarded is not null
  and (
    pts_outcome is null
    or pts_exact is null
    or pts_goal_diff is null
    or pts_total_goals is null
    or pts_team_goals is null
    or pts_btts is null
    or pts_first_team is null
    or pts_first_scorer is null
  );

-- Banner metadata whose league is gone.
select lb.*
from league_banners lb
left join leagues l on l.id = lb.league_id
where l.id is null;

-- Enabled banner leagues with no banner metadata.
select l.id, l.name
from leagues l
left join league_banners lb on lb.league_id = l.id
where l.banners_enabled is true
group by l.id, l.name
having count(lb.id) = 0;
