# MatchDay — World Cup 2026 Predictor

> **Your road to glory starts here.**

MatchDay is a private, full-stack prediction league for the FIFA World Cup 2026. Your group submits
scoreline predictions before kickoff, earns points across multiple scoring categories, predicts group
orders and the full knockout bracket, and competes on a live leaderboard with a zero-sum prize pool.

The UI uses the **"Dark Stadium Analytics"** design system (Archivo / Space Grotesk type, token-driven
colours) with full **light and dark mode** (toggle in the header; defaults to system preference).

---

## Table of contents
- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Granting admin access](#granting-admin-access)
- [Scoring system](#scoring-system)
- [Prize pool](#prize-pool)
- [Admin workflow](#admin-workflow)
- [Player data](#player-data)
- [Deployment](#deployment-on-vercel)

---

## What it does

- **Predict every match** — exact scorelines plus first-goal team, first scorer, and independent
  total-goals / goal-difference hedges.
- **Predict the structure** — each group's finishing order and the knockout bracket (champion,
  runner-up, semi- and quarter-finalists).
- **Live leaderboard** — points settle the moment an admin enters a result; overall and per-gameweek
  standings with rank-movement arrows.
- **Prize pool** — a zero-sum pot settled each gameweek and overall, projected live on the dashboard.

---

## Tech stack

- **Next.js 14** — App Router, TypeScript (strict)
- **React 18** · **Tailwind CSS** (CSS-variable design tokens)
- **Supabase** — Postgres, Auth, Row Level Security, Realtime, Storage
- **Vercel** — hosting

---

## Architecture

```
                       ┌─────────────────────────────────────────────┐
   Browser (Next.js)   │  app/* pages  ·  components/*  ·  lib/*       │
                       └───────────────┬───────────────┬─────────────┘
        reads/writes (RLS)             │               │  admin-only POST
        via supabase-browser           │               │
                       ┌───────────────▼──────┐  ┌──────▼───────────────┐
                       │  Supabase Postgres    │  │  app/api/score-*      │
                       │  (tables + RLS)       │◀─┤  route handlers       │
                       │  + Storage (avatars)  │  │  (server, service key)│
                       └───────────────────────┘  └──────────┬───────────┘
                                                              │ uses
                                                   ┌──────────▼───────────┐
                                                   │  lib/scoring.ts       │
                                                   │  lib/prizes.ts        │
                                                   └───────────────────────┘
```

**Data flow:** a user submits a prediction (client → `predictions` table). An admin enters the real
result on `/admin`, which calls `POST /api/score-match`; that handler runs `lib/scoring.ts` and writes
the per-category points breakdown back to each prediction row. The leaderboard then aggregates those
rows client-side via `lib/leaderboard.ts` (shared by the dashboard and `/leaderboard`), and the prize
pool is derived by `lib/prizes.ts`.

**Auth:** `middleware.ts` redirects logged-out users to `/login` for every route except `/login`.
Scoring lives **only** in `lib/scoring.ts` / `lib/prizes.ts` — those are the single source of truth for
all point values; the UI never hardcodes them.

---

## Project structure

```
app/
  page.tsx            Landing (marketing + scoring strip + rules modal trigger)
  login/              Email/password auth
  auth/callback/      Post-login redirect → /dashboard
  dashboard/          Home: rank + count-up stats, hero next match, form/accuracy,
                      recent results, mini leaderboard, prize outlook, rules modal
  predictions/        All fixtures with filter chips
  match/[id]/         Full prediction: score + first goal + first scorer + total goals + goal diff
  groups/             Group standings + group-order predictor
  bracket/            Knockout bracket viewer + tournament picks
  leaderboard/        Live standings (overall + per-GW), podium, rank-movement arrows
  squads/             Team rosters
  profile/            Per-user analytics, badges, avatar upload
  rules/              Full rules & scoring reference page
  admin/              Result entry + scoring actions
  api/                Admin POST handlers: score-match, score-groups, score-tournament,
                      snapshot-ranks, rescore-all

components/
  AppShell.tsx        Desktop sidebar + mobile bottom nav (auth-aware, admin link)
  ui.tsx              Design system: Button, Card, StatCard, Pill, Avatar, ScoreStepper,
                      Countdown, Modal, CountUp, icons, … (Logo mark "MD")
  football.tsx        MatchCard, NextPredictCard, LeaderboardTable
  RulesContent.tsx    Shared rules/scoring copy (single source) → RulesModal + /rules
  RulesModal.tsx      Generic Modal wrapping RulesContent
  RulesButton.tsx     Client island: rules trigger usable on logged-out surfaces
  MatchModal.tsx      Match detail modal · PlayerCardPicker.tsx  first-scorer picker
  ThemeToggle.tsx     Light/dark toggle

lib/
  scoring.ts          Match / group / tournament scoring (source of truth for points)
  prizes.ts           Prize pool constants + PrizeSnapshot computation
  leaderboard.ts      aggregateLeaderboard() — shared aggregation + canonical sort
  match-ui.ts         DBMatch / MyPred types + toUIMatch
  teams.ts            48 WC2026 teams + position helpers
  supabase-*.ts       Browser / server / middleware Supabase clients

scripts/
  fetch-players.ts    Pull WC2026 squads from football-data.org v4 → players table

supabase/migrations/  SQL migrations (schema + seed), applied in filename order
middleware.ts         Route protection — unauthenticated → /login
```

---

## Local development

### 1. Clone & install

```bash
git clone <your-repo-url>
cd wc26-predictor
npm install
```

### 2. Environment variables

Create `.env.local` (copy from `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Find these in Supabase → **Project Settings → API**.

### 3. Apply database migrations

```bash
brew install supabase/tap/supabase            # if not installed
supabase login --token <your-access-token>    # supabase.com/dashboard/account/tokens
supabase link --project-ref <your-project-ref>
supabase db push                              # runs all migrations in order
```

| File | Contents |
|---|---|
| `…000000_initial_schema.sql` | All core tables, RLS policies, `is_admin()` helper |
| `…000001_seed_matches.sql` | Rounds + matches (group + knockout) |
| `…000002_add_group_gameweek.sql` | `group_name`, `gameweek` on matches |
| `…000003_players.sql` | Players table |
| `…000000_design_upgrade.sql` | Per-category scoring columns, `group_predictions` |
| `…000001_avatar_storage.sql` | `avatars` storage bucket + policies (public read) |
| `…000002_lineups.sql` | Lineups table |
| `…000000_bracket_and_rank.sql` | `tournament_predictions`, `rank_snapshots` |
| `…000001_gameweek_number.sql` | `matches.gw_number` (1–8), `players.jersey_number`, `players.photo_url` |
| `…000002_match_winner.sql` | `matches.match_winner` (knockout shootouts) |
| `…000003_pred_goal_fields.sql` | `predictions.pred_total_goals`, `pred_goal_diff` (hedging) |

> All migrations must be applied before scoring, group/tournament predictors, rank-movement, avatar
> upload, and prize-pool features work.

### 4. Run

```bash
npm run dev          # http://localhost:3000
npm run build        # production build
npm run lint         # eslint
```

---

## Granting admin access

After signing up your profile row is auto-created. In Supabase → **Table Editor → `profiles`**, set
`is_admin = true` for your user. The **Admin** link appears on your next page load.

---

## Scoring system

### Match predictions (max 14 pts)

| Points | Condition |
|---|---|
| **+3** | Correct outcome (win / draw / loss) |
| **+3** | Exact scoreline (on top of outcome) |
| **+2** | Correct goal difference |
| **+1** | Correct total goals |
| **+1** | Both-teams-to-score called correctly |
| **+2** | Correct first-goal team |
| **+4** | Correct first scorer |

Categories stack. Total goals and goal difference can be set **independently** of the scoreline, so a
smart hedge can still bank points when the exact score is wrong. Per-category breakdowns are stored on
each prediction row for analytics.

### Group predictions

**+2** for each team placed in the correct finishing position — max 8 per group. Scored by the admin
after the group stage.

### Tournament picks (max 47 pts)

| Points | Condition |
|---|---|
| **+15** | Champion |
| **+8** | Runner-up |
| **+4** | Each correct semi-finalist (×2) |
| **+2** | Each correct quarter-finalist (×4) |

Scored by the admin after each knockout round.

---

## Prize pool

Zero-sum pool, settled per gameweek (GW1–GW8) and overall.

| Position | Per GW | Overall |
|---|---|---|
| 1st | +$15 | +$40 |
| 2nd | +$10 | +$20 |
| 3rd | +$5 | +$10 |
| 4th | $0 | $0 |
| 5th | -$5 | -$10 |
| 6th | -$10 | -$20 |
| 7th | -$15 | -$40 |

**Tiebreakers:** most points → most correct outcomes → alphabetical by name.

GW mapping: GW1/2/3 = Group Stage Days 1/2/3 · GW4 = R32 · GW5 = R16 · GW6 = QF · GW7 = SF ·
GW8 = Final + 3rd Place. The dashboard shows settled net, projected total, and the best-to-worst range.

---

## Admin workflow

1. **Enter a result** — expand a match, enter the real score + first-goal team + first scorer →
   **Save & score**. Locks the match and recalculates its predictions.
2. **Rescore all matches** — recompute every prediction after a rule change.
3. **Snapshot leaderboard** — records current ranks so movement arrows (▲▼) appear.
4. **Score group predictions** — after the group stage (only fully-resulted groups score).
5. **Score tournament picks** — after each knockout round.

---

## Player data

Populate the players table (jersey numbers, positions) from football-data.org:

```bash
FOOTBALL_API_TOKEN=<your-token> \
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<service-role-key> \
npx tsx scripts/fetch-players.ts
```

Get a free token at [football-data.org](https://www.football-data.org/client/register). The free tier
allows 10 req/min (the script rate-limits automatically) and does not include player photos.

---

## Deployment on Vercel

1. Push to GitHub.
2. **vercel.com → Add New Project** → import the repo (Next.js auto-detected; `vercel.json` handles build).
3. Add env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for Production / Preview / Development.
4. In Supabase → **Authentication → URL Configuration → Redirect URLs**, add
   `https://<your-vercel-domain>/auth/callback`.
5. Vercel deploys on every push.
