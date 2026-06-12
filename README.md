<p align="center">
  <img src="public/icon.svg" width="88" height="88" alt="MatchDay logo" />
</p>

<h2 align="center">MatchDay</h2>
<p align="center">
  <em>World Cup 2026 private prediction league</em><br/>
  Predict every scoreline · Compete on a live leaderboard · Settle the prize pool
</p>

---

## Table of contents

- [What is MatchDay?](#what-is-matchday)
- [How it works](#how-it-works)
- [Scoring](#scoring)
- [Prize pool](#prize-pool)
- [Features](#features)
- [Install as an app (PWA)](#install-as-an-app-pwa)
- [Admin workflow](#admin-workflow)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Deployment](#deployment)

---

## What is MatchDay?

MatchDay is a private, invite-only prediction league for FIFA World Cup 2026. Before every match kicks off, each player submits their predicted scoreline and optional hedges. An admin enters the real result, points settle instantly, and the leaderboard and zero-sum prize pool update in real time.

It covers the full tournament — 104 group-stage and knockout matches, group finishing orders, and a complete bracket prediction — spread across 8 scored gameweeks.

---

## How it works

**1. Join your league**
Sign up with your email, enter your invite code, and you're in. Leagues are private — only people with the code can join.

**2. Submit predictions before kickoff**
Head to **Fixtures** and submit your scoreline for each match. On top of the score you can predict:
- **First-goal team** — which side opens the scoring
- **First scorer** — the specific player (highest reward)
- **Total goals** and **goal difference** — independent hedges that earn points even when the exact score is wrong

Predictions lock at kickoff. After the match the admin enters the result and every prediction is scored automatically.

**3. Compete across 8 gameweeks**
Points accumulate across the group stage and all knockout rounds. The leaderboard is live — Supabase Realtime pushes updates the moment results are scored, no refresh needed.

**4. Predict the structure**
Beyond individual matches you can predict group finishing orders (+2 per correct placement) and pick the full knockout bracket — champion, runner-up, semi-finalists, and quarter-finalists (up to +47 pts).

**5. The prize pool settles itself**
Every gameweek and the overall standings pay out (and claw back) based on finishing position. The dashboard shows your settled net, projected total, and best/worst outcome at all times.

---

## Scoring

### Match predictions — max 14 pts

| Category | Points |
|---|---|
| Correct outcome (win / draw / loss) | **+3** |
| Exact scoreline | **+3** |
| Correct goal difference | **+2** |
| Correct total goals | **+1** |
| Both teams to score — correct call | **+1** |
| Correct first-goal team | **+2** |
| Correct first scorer | **+4** |

All categories are independent and stack. Total goals and goal difference are set separately from the scoreline, so a smart hedge can bank points even when the exact score is wrong.

### Group predictions

**+2** for each team placed in the correct group finishing position — max 8 pts per group.

### Tournament bracket — max 47 pts

| Pick | Points |
|---|---|
| Champion | **+15** |
| Runner-up | **+8** |
| Each correct semi-finalist (×2) | **+4** |
| Each correct quarter-finalist (×4) | **+2** |

---

## Prize pool

Zero-sum pool settled per gameweek (GW1–GW8) and overall at the end of the tournament.

| Position | Per gameweek | Overall |
|---|---|---|
| 1st | +$15 | +$40 |
| 2nd | +$10 | +$20 |
| 3rd | +$5 | +$10 |
| 4th | $0 | $0 |
| 5th | -$5 | -$10 |
| 6th | -$10 | -$20 |
| 7th | -$15 | -$40 |

**Tiebreakers:** most points → most correct outcomes → alphabetical.

**Gameweek mapping:** GW1/2/3 = Group Stage Days 1–3 · GW4 = Round of 32 · GW5 = Round of 16 · GW6 = Quarter-finals · GW7 = Semi-finals · GW8 = Final + 3rd place.

---

## Features

| Feature | Detail |
|---|---|
| Live leaderboard | Realtime updates via Supabase; rank-movement arrows, streak 🔥 badges |
| Consensus reveal | After kickoff, see how the rest of the league predicted the same match |
| Quick-predict | Bottom-sheet popover for fast score entry from the fixtures list |
| Match history | Full scored breakdown per match on your profile page |
| GW sparkline | Points-per-gameweek chart on your profile |
| Activity feed | Live league event feed on the dashboard |
| CSV export | Download the full leaderboard as a spreadsheet |
| Invite links | Shareable `?code=` links that pre-fill the join form |
| Scoring audit log | Every admin scoring action recorded in `scoring_events` |
| Rate limiting | Token-bucket rate limit (10 req/min) on all scoring API routes |
| PWA | Installable on iOS, Android, and desktop; offline shell; app badge; OS shortcuts |

---

## Install as an app (PWA)

MatchDay is a Progressive Web App — install it directly from your browser with no App Store needed.

| Platform | Steps |
|---|---|
| **iPhone / iPad** | Safari → Share icon → **Add to Home Screen** |
| **Android** | Chrome → ⋮ menu → **Add to Home screen** (or tap the install banner) |
| **Desktop** | Click the **Install** icon in the Chrome / Edge address bar |

Once installed it opens full-screen with no browser chrome, loads instantly from cache, and shows a graceful offline page if you lose connectivity. Visit **Get the app** in the sidebar for a guided walkthrough.

---

## Admin workflow

1. **Enter a result** — on `/admin` expand a match, enter the real score, first-goal team, and first scorer → **Save & score**. Locks the match and calculates every player's points.
2. **Snapshot leaderboard** — captures current ranks so movement arrows (▲▼) are accurate next session.
3. **Score group predictions** — run after the group stage (only fully-resulted groups are scored).
4. **Score tournament picks** — run after each knockout round.
5. **Rescore all** — recomputes every prediction; useful after any rule or data correction.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 — App Router, TypeScript (strict) |
| UI | React 18, Tailwind CSS (CSS-variable design tokens, light/dark) |
| Database | Supabase — Postgres, Auth, Row Level Security, Realtime, Storage |
| PWA | `@ducanh2912/next-pwa` (Workbox service worker) |
| Hosting | Vercel |

**Design system:** Archivo + Space Grotesk typefaces, token-driven colour scheme. Defaults to system preference; toggle in the header.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser — Next.js App Router                                     │
│  app/* pages  ·  components/*  ·  lib/*                           │
└──────────┬───────────────────────────────────┬───────────────────┘
           │ RLS-guarded reads/writes           │ admin-only POST
           │ via supabase-js                    │
┌──────────▼──────────────────┐   ┌────────────▼─────────────────┐
│  Supabase Postgres           │   │  app/api/score-*              │
│  tables + RLS policies       │◀──┤  Next.js route handlers       │
│  Storage (avatars)           │   │  (server-side, service role)  │
│  Realtime (leaderboard feed) │   └────────────┬─────────────────┘
└─────────────────────────────┘                │ imports
                                    ┌───────────▼─────────────────┐
                                    │  lib/scoring.ts              │
                                    │  lib/prizes.ts               │
                                    │  lib/leaderboard.ts          │
                                    └─────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  Service Worker — @ducanh2912/next-pwa (Workbox)                  │
│  Caches static assets on first visit · /offline navigation fallback│
└──────────────────────────────────────────────────────────────────┘
```

**Data flow:** a user submits a prediction (client → `predictions` table). An admin enters the real result on `/admin`, which posts to `app/api/score-match`; that handler runs `lib/scoring.ts` and writes per-category point breakdowns back to each prediction row. `lib/leaderboard.ts` aggregates those rows client-side (shared by dashboard and `/leaderboard`). `lib/prizes.ts` derives the prize snapshot. Supabase Realtime pushes `predictions` UPDATE events so standings reflect results without a page reload.

**Auth:** `middleware.ts` redirects unauthenticated requests to `/login` for every route. All point values are defined once in `lib/scoring.ts` and `lib/prizes.ts` — the UI imports constants, never hardcodes them.

---

## Project structure

```
app/
  page.tsx              Landing page
  login/                Email/password auth
  dashboard/            Rank, stats, hero match, form, leaderboard, prize, activity feed
  predictions/          All fixtures + quick-predict popover
  match/[id]/           Full prediction form, consensus reveal, prediction wall
  groups/               Group order predictor
  bracket/              Knockout bracket + tournament picks
  leaderboard/          Live standings, per-GW view, CSV export
  profile/              Match history, GW sparkline, avatar upload
  install/              PWA install guide with platform detection
  offline/              Offline fallback (rendered by service worker)
  rules/                Scoring rules reference
  admin/                Result entry + scoring actions
  api/                  score-match · score-groups · score-tournament
                        snapshot-ranks · rescore-all

components/
  AppShell.tsx          Desktop sidebar + mobile bottom nav
  ui.tsx                Design system — Button, Card, StatCard, Pill, Avatar, …
  football.tsx          MatchCard, NextPredictCard, LeaderboardTable
  RulesContent.tsx      Shared rules copy (used by modal and /rules page)

lib/
  scoring.ts            Source of truth for all point values
  prizes.ts             Prize pool constants + snapshot computation
  leaderboard.ts        Aggregation + canonical sort (shared)
  pwa.ts                useInstallPrompt(), useAppBadge()
  hooks.ts              useMyLeagues(), useActiveLeague() with 30s TTL cache
  rate-limit.ts         In-memory token bucket (10 req/min per key)
  match-ui.ts           DBMatch / MyPred types + toUIMatch helper
  teams.ts              48 WC2026 teams + position helpers
  supabase-*.ts         Browser / server / middleware Supabase clients

supabase/migrations/    SQL migrations — applied in filename order
scripts/
  fetch-players.ts      Pull WC2026 squads from football-data.org → players table
middleware.ts           Unauthenticated → /login for all routes
```

---

## Local development

### 1. Clone and install

```bash
git clone <your-repo-url>
cd wc26-predictor
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Find these in Supabase → **Project Settings → API**.

### 3. Apply database migrations

```bash
brew install supabase/tap/supabase
supabase login --token <your-access-token>
supabase link --project-ref <your-project-ref>
supabase db push
```

| Migration | Contents |
|---|---|
| `000000_initial_schema` | Core tables, RLS policies, `is_admin()` function |
| `000001_seed_matches` | Rounds + all 104 WC2026 matches |
| `000002_add_group_gameweek` | `group_name`, `gameweek` on matches |
| `000003_players` | Players table |
| `000000_design_upgrade` | Per-category scoring columns, `group_predictions` |
| `000001_avatar_storage` | `avatars` storage bucket + public-read policies |
| `000002_lineups` | Lineups table |
| `000000_bracket_and_rank` | `tournament_predictions`, `rank_snapshots` |
| `000001_gameweek_number` | `matches.gw_number`, player jersey + photo fields |
| `000002_match_winner` | `matches.match_winner` for knockout shootout results |
| `000003_pred_goal_fields` | `predictions.pred_total_goals`, `pred_goal_diff` (hedges) |
| `000005_cleanup_indexes` | Performance indexes + admin-only rank_snapshots policy |
| `000006_events` | `scoring_events` audit log + `league_events` activity feed |

### 4. Run

```bash
npm run dev     # Development server — http://localhost:3000
npm run build   # Production build (also generates the service worker)
npm run lint    # ESLint
npm run test    # Vitest unit tests
```

> **PWA note:** the service worker is disabled in development to avoid stale-cache issues. To test offline behaviour: `npm run build && npm start`, then open Chrome DevTools → Application → Service Workers → tick **Offline**.

### 5. Grant admin access

In Supabase → **Table Editor → `profiles`**, set `is_admin = true` for your account. The **Admin** link appears on next page load.

### 6. Populate player data (optional)

```bash
FOOTBALL_API_TOKEN=<token> \
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<service-role-key> \
npx tsx scripts/fetch-players.ts
```

Get a free token at [football-data.org](https://www.football-data.org/client/register). The free tier allows 10 req/min and does not include player photos.

---

## Deployment

1. Push the repository to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New Project** → import the repo. Next.js is auto-detected.
3. Add environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) under **Settings → Environment Variables** for Production, Preview, and Development.
4. In Supabase → **Authentication → URL Configuration → Redirect URLs**, add `https://<your-vercel-domain>/auth/callback`.
5. Vercel deploys automatically on every push to `main`.
