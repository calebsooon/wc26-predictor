# Bracket XI — World Cup 2026 Predictor

A full-stack prediction game for FIFA World Cup 2026. Players submit scoreline predictions before each match kicks off, earn points across eight scoring categories, and compete on a live leaderboard.

The UI uses the **"Dark Stadium Analytics"** design system (Archivo / Space Grotesk type, token-driven colours) with full **light and dark mode** support (toggle in the header, defaults to system preference).

---

## Tech stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS**
- **Supabase** (Postgres, Auth, Row Level Security, Realtime)
- **Vercel** (hosting)

---

## Local development

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd wc26-predictor
npm install
```

### 2. Set environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Find these in your Supabase dashboard under **Project Settings → API**.

### 3. Apply database migrations

Install the Supabase CLI if you haven't already:

```bash
brew install supabase/tap/supabase
```

Log in and link your project:

```bash
supabase login --token <your-access-token>   # token from supabase.com/dashboard/account/tokens
supabase link --project-ref <your-project-ref>
```

Push the schema and seed data:

```bash
supabase db push
```

This runs all migrations in order:

| File | Contents |
|---|---|
| `20260609000000_initial_schema.sql` | All tables, RLS policies, `is_admin()` helper |
| `20260609000001_seed_matches.sql` | 7 rounds + 111 matches (72 group + 39 knockout) |
| `20260609000002_add_group_gameweek.sql` | `group_name`, `gameweek` columns on matches |
| `20260609000003_players.sql` | Players table |
| `20260610000000_design_upgrade.sql` | Multi-category scoring inputs, per-category points breakdown, `group_predictions` table |
| `20260610000001_avatar_storage.sql` | Avatar storage bucket |
| `20260610000002_lineups.sql` | Lineups table |
| `20260611000000_bracket_and_rank.sql` | `tournament_predictions`, `group_predictions.points_awarded`, `rank_snapshots` |
| `20260611000001_gameweek_number.sql` | `matches.gw_number` (1–8 for prize-pool GW grouping), `players.jersey_number`, `players.photo_url` |

> **All migrations must be applied before the scoring, group predictor, tournament picks, rank-movement, and prize-pool features work.**

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Granting admin access

After signing up, your profile row is auto-created. To grant admin access:

1. Go to your [Supabase dashboard](https://supabase.com/dashboard) → your project → **Table Editor** → `profiles`
2. Find the row for your user (matched by `username` or `id`)
3. Set `is_admin` to `true` and save

The **Admin** link appears in the nav on your next page load.

---

## Deployment on Vercel

### 1. Push to GitHub

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Vercel will auto-detect Next.js — `vercel.json` handles the build config

### 3. Add environment variables in Vercel

In the Vercel project dashboard → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key from Supabase |

Set these for **Production**, **Preview**, and **Development**.

### 4. Set the auth redirect URL in Supabase

In Supabase → **Authentication → URL Configuration → Redirect URLs**, add:

```
https://<your-vercel-domain>/auth/callback
```

### 5. Deploy

Vercel deploys automatically on every push to `main`.

---

## Project structure

```
app/
  login/              Email/password login page
  auth/callback/      Post-login redirect → /dashboard
  dashboard/          Main hub: rank, stats, next picks, mini leaderboard
  predictions/        All fixtures with filters (today / missing / round)
  match/[id]/         Full match prediction: score + first goal + first scorer + knockout advance
  groups/             Group standings + group-order predictor
  bracket/            Knockout bracket viewer + My Tournament Picks tab
  leaderboard/        Live leaderboard with round filter, podium, rank-movement arrows
  profile/            Per-user analytics, badges, tournament picks, group prediction history
  admin/              Result entry (score + first goal + scorer) + tournament admin actions
  api/
    score-match/      POST — scores all predictions for a single match
    score-groups/     POST — scores group-order predictions (admin, after group stage)
    score-tournament/ POST — scores tournament picks (admin, after knockout rounds)
    snapshot-ranks/   POST — snapshots current leaderboard for rank-movement arrows

components/
  AppShell.tsx        Desktop sidebar + mobile bottom nav (auth-aware, admin link)
  ThemeToggle.tsx     Light/dark mode toggle
  MatchModal.tsx      Match detail modal (used on bracket page)
  PlayerCardPicker.tsx FIFA-style card grid for picking first scorer (silhouette + jersey number)
  ui.tsx              Full design system: Button, Card, Pill, Avatar, ScoreStepper, etc.
  football.tsx        MatchCard, NextPredictCard, LeaderboardTable (with prize column), ScoreDisplay

lib/
  scoring.ts          7-category match scoring + group prediction scoring + tournament scoring
  prizes.ts           Prize pool constants (GW: ±$15, overall: ±$40) + PrizeSnapshot computation
  match-ui.ts         DBMatch → UIMatch transformer, matchStatus helpers
  teams.ts            All 48 WC2026 team codes with name, flag, playerKey
  supabase-browser.ts createClient() for Client Components
  supabase-server.ts  createServerSupabaseClient() for Route Handlers
  supabase-middleware.ts createMiddlewareSupabaseClient() for middleware.ts

scripts/
  fetch-players.ts    Fetches WC2026 squad data from football-data.org v4 and upserts to Supabase

supabase/
  migrations/         SQL migration files (schema + seed, applied in filename order)

middleware.ts         Route protection — unauthenticated → /login
```

---

## Scoring system

### Match predictions

| Points | Condition |
|---|---|
| **+3** | Correct outcome (win / draw / loss) |
| **+3** | Exact scoreline (bonus on top of outcome) |
| **+2** | Correct goal difference |
| **+1** | Correct total goals |
| **+1** | Both-teams-to-score called correctly |
| **+2** | Correct first-goal team |
| **+4** | Correct first scorer |

Categories stack — an exact scoreline also earns outcome, goal-difference, total-goals, and BTTS points. Max possible per match: 14 pts. Per-category breakdowns are stored on each prediction row for profile analytics.

### Group predictions

Users predict the final finishing order for each of the 12 groups.

| Points | Condition |
|---|---|
| **+2** | Each team in the exact finishing position |

Max 8 pts per group · max 96 pts across all 12 groups. Scored by the admin after the group stage via **Admin → Score group predictions**.

### Tournament picks

Users pick their champion, runner-up, semi-finalists, and quarter-finalists (from all 48 teams) before the Round of 32 kicks off.

| Points | Condition |
|---|---|
| **+15** | Correct tournament champion |
| **+8** | Correct runner-up |
| **+4** | Each correct semi-finalist (×2, max +8) |
| **+2** | Each correct quarter-finalist (×4, max +8) |

Max 47 pts. Scored by the admin after each knockout round via **Admin → Score tournament picks**.

---

## Prize pool

7-player zero-sum pool, settled independently per gameweek (GW1–GW8) and overall.

| Position | Per GW | Overall |
|---|---|---|
| 1st | +$15 | +$40 |
| 2nd | +$10 | +$20 |
| 3rd | +$5 | +$10 |
| 4th | $0 | $0 |
| 5th | -$5 | -$10 |
| 6th | -$10 | -$20 |
| 7th | -$15 | -$40 |

**Tiebreaker:** count of predictions with a correct outcome (pts_outcome > 0).

The **Dashboard** shows your settled net from completed GWs, projected total (assuming current standings hold), and the full best-to-worst range visualised as a bar.

GW mapping: GW1/2/3 = Group Stage Days 1/2/3 · GW4 = R32 · GW5 = R16 · GW6 = QF · GW7 = SF · GW8 = Final + 3rd Place.

---

## Admin workflow

1. **Enter a result** — expand a match row, enter the real score + first-goal team + first scorer, hit **Save & score**. This locks the match and immediately recalculates all predictions for that match.
2. **Rescore all matches** — click **Rescore all matches** after any rule change to recalculate every prediction across all scored matches in one pass.
3. **Snapshot leaderboard** — click **Snapshot leaderboard** after any significant scoring event. This records current ranks so movement arrows (▲▼) appear on the leaderboard.
4. **Score group predictions** — after all group stage matches are complete, click **Score group predictions**. Only groups where every match has a result will be scored.
5. **Score tournament picks** — click after each knockout round. The endpoint determines champion / runner-up / semi-finalists / quarter-finalists from completed match results and scores picks accordingly.

### Fetch player data

After the `20260611000001_gameweek_number.sql` migration is applied, populate the players table with jersey numbers:

```bash
FOOTBALL_API_TOKEN=<your-token> \
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<service-role-key> \
npx tsx scripts/fetch-players.ts
```

Get a free API token at [football-data.org](https://www.football-data.org/client/register). The free tier allows 10 requests/minute; the script handles rate limiting automatically.
