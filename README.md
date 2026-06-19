<p align="center">
  <img src="public/icon.svg" width="88" height="88" alt="MatchDay logo" />
</p>

<h1 align="center">MatchDay</h1>

<p align="center">
  <strong>Private World Cup 2026 prediction league</strong><br/>
  Predict every scoreline &nbsp;·&nbsp; Compete on a live leaderboard &nbsp;·&nbsp; Settle the prize pool
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14_App_Router-black?style=flat-square&logo=next.js" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_+_Realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vercel-deployed-black?style=flat-square&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa" alt="PWA" />
</p>

<br/>

MatchDay is a private, invite-only prediction league for FIFA World Cup 2026. Players predict scorelines, group finishing orders, and the full knockout bracket across 104 matches. An admin enters real results, points settle instantly via server-side scoring, and a zero-sum prize pool updates live — no page refresh needed.

<br/>

---

## Contents

- [How it works](#how-it-works)
- [Scoring](#scoring)
- [Prize pool](#prize-pool)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Deployment](#deployment)

---

## How it works

**1. Join your league** &nbsp;—&nbsp; Sign up with email, enter your invite code, and you're in. Leagues are private and admin-created; each group of friends gets its own isolated standings and prize pool. Multiple leagues are supported.

**2. Submit predictions before kickoff** &nbsp;—&nbsp; Head to **Fixtures** and enter your scoreline for each match. On top of the score, you can predict:

- **First-goal team** — which side opens the scoring
- **First scorer** — the specific player (highest reward, +4 pts)
- **Total goals** — an independent hedge that earns points even if the exact score is wrong
- **Goal difference** — a second hedge, togglable per league by the admin

Predictions lock at kickoff. The admin enters the result and every prediction is scored automatically across all per-category columns.

**3. Compete across 8 gameweeks** &nbsp;—&nbsp; Points accumulate through the group stage and all knockout rounds. Supabase Realtime pushes leaderboard updates the moment results land — no refresh needed.

**4. Predict the structure** &nbsp;—&nbsp; Beyond individual matches, predict group finishing orders (+2 per correct placement) and the full knockout bracket — champion, runner-up, semi-finalists, and quarter-finalists (up to +47 pts total).

**5. The prize pool settles itself** &nbsp;—&nbsp; Each gameweek and the overall standings pay out and claw back based on finishing position. The dashboard shows your current rank, settled net, projected total, and best/worst prize range at all times.

---

## Scoring

### Match predictions &nbsp;—&nbsp; max 14 pts

| Category | Pts | Notes |
| :--- | :---: | :--- |
| Correct outcome (W / D / L) | **+3** | Always available |
| Exact scoreline | **+3** | Stacks with outcome |
| Correct goal difference | **+2** | Set independently of the scoreline |
| Correct total goals | **+1** | Set independently of the scoreline |
| Both teams to score — correct call | **+1** | Derived from your score prediction |
| Correct first-goal team | **+2** | Optional pick |
| Correct first scorer | **+4** | Optional pick — highest single reward |

> Total goals and goal difference are entered **separately** from the scoreline, so a well-placed hedge can bank points even when the exact score is wrong.

### Group predictions

**+2** for each team placed in the correct group finishing position — max 8 pts per group across 12 groups.

### Tournament bracket &nbsp;—&nbsp; max 47 pts

| Pick | Pts |
| :--- | :---: |
| Champion | **+15** |
| Runner-up | **+8** |
| Each correct semi-finalist (×2) | **+4** |
| Each correct quarter-finalist (×4) | **+2** |

---

## Prize pool

Zero-sum pool settled per gameweek (GW1–GW8) and overall at tournament end.

| Position | Per gameweek | Overall |
| :---: | :---: | :---: |
| 1st | +$15 | +$40 |
| 2nd | +$10 | +$20 |
| 3rd | +$5 | +$10 |
| 4th | $0 | $0 |
| 5th | −$5 | −$10 |
| 6th | −$10 | −$20 |
| 7th | −$15 | −$40 |

**Tiebreakers:** total points → most correct outcomes → most exact scorelines → shared rank.

<details>
<summary>Gameweek schedule</summary>

<br/>

| Gameweek | Stage |
| :--- | :--- |
| GW1 / GW2 / GW3 | Group Stage (Days 1–3) |
| GW4 | Round of 32 |
| GW5 | Round of 16 |
| GW6 | Quarter-finals |
| GW7 | Semi-finals |
| GW8 | Final + 3rd place play-off |

</details>

---

## Features

<details>
<summary><strong>Predictions &amp; gameplay</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Scoreline prediction | Home / away goals via stepper controls; locks at kickoff |
| First scorer pick | Choose from the full 26-man squad roster |
| Total goals &amp; goal diff | Independent hedges set separately from the scoreline |
| Own goal handling | Admin marks OG; excludes it from first-scorer scoring |
| Group order predictor | Drag-and-drop finishing predictions for all 12 groups |
| Knockout bracket | Pick champion, runner-up, semi-finalists, quarter-finalists |
| Per-league goal diff | Admin can enable or disable goal difference scoring per league |

</details>

<details>
<summary><strong>Fixtures &amp; results</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Filter tabs | Open · Today · Missing · Closed · Full — always know where to act |
| Points colour coding | `+N pts` pill turns green / amber / red based on % of max possible |
| Stage filter | All · Group Stage · Knockout — second filter row |
| Consensus reveal | After kickoff, every member's full prediction for that match is revealed |
| Prediction wall | See the whole league's pick distribution per match |

</details>

<details>
<summary><strong>Leaderboard &amp; social</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Live leaderboard | Supabase Realtime; rank arrows ▲▼, point totals, prize column |
| Per-GW standings | Switch between overall and any individual gameweek |
| Head-to-head | Full H2H stats, win/draw/loss record, side-by-side points race chart |
| Achievement badges | Auto-calculated (Scoreline Sniper, Golden Boot Guru, Hot Hand, …) |
| Activity feed | Live league event stream on the dashboard |
| CSV export | Download the full leaderboard as a spreadsheet |

</details>

<details>
<summary><strong>Profile &amp; personalisation</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Profile page | Stats, accuracy by category, rank movement chart, GW breakdown, badge showcase |
| Avatar upload | Circular crop tool — drag to reposition, slider to zoom |
| Settled prize | Shows real GW earnings after each gameweek closes |
| Light / dark mode | Follows system preference; toggle available in the header |

</details>

<details>
<summary><strong>Admin</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Result entry | Score and first scorer per match; locks prediction input for all players |
| Scoring audit log | Every action recorded in `scoring_events` |
| Rank snapshots | Captures rank state automatically after scoring for movement arrows |
| Rescore all | Full recompute — use after any rule or data correction |
| Rate limiting | Token-bucket rate limit on all scoring API routes |

</details>

<details>
<summary><strong>Platform</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| PWA | Installable on iOS, Android, and desktop; offline shell |
| 48-team squads | Full 26-man rosters for all WC2026 nations, searchable by team |
| Multi-league | Admin-created leagues with unique join codes; independent standings |
| Invite links | Shareable `?code=` links that pre-fill the join form |
| Mobile-first | Fully responsive; all pages optimised for PWA and phone use |

</details>

<details>
<summary><strong>Pages &amp; routes</strong></summary>

<br/>

| Route | Description |
| :--- | :--- |
| `/` | Landing page |
| `/login` | Email / password auth |
| `/dashboard` | Rank, stats, hero match, form strip, mini-leaderboard, prize outlook |
| `/predictions` | All fixtures with filters; quick-predict bottom sheet |
| `/match/[id]` | Full prediction form, consensus reveal, prediction wall |
| `/groups` | Group finishing order predictor (all 12 groups) |
| `/bracket` | Full knockout bracket and tournament picks |
| `/leaderboard` | Live standings, per-GW view, rank movement, CSV export |
| `/h2h` | Head-to-head compare — pick any two members |
| `/squads` | 48-nation squad browser with position grouping and jersey numbers |
| `/profile` | Stats, accuracy, rank chart, badges, bracket and group picks |
| `/rules` | Scoring rules reference |
| `/admin` | Result entry and all scoring actions |

</details>

---

## Tech stack

<p>
  <img src="https://img.shields.io/badge/Next.js-14_App_Router-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>
<p>
  <img src="https://img.shields.io/badge/Supabase-Postgres_+_Auth_+_Realtime-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Vercel-deploy-black?style=for-the-badge&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/PWA-Workbox-5A0FC8?style=for-the-badge&logo=pwa" alt="PWA" />
</p>

<br/>

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 14 — App Router, server and client components, API route handlers |
| **Language** | TypeScript in strict mode throughout |
| **UI** | React 18, Tailwind CSS with CSS-variable design tokens (light/dark via `.dark` on `<html>`) |
| **Database** | Supabase Postgres with Row Level Security — users read everything, write only their own rows |
| **Auth** | Supabase Auth — email/password; `middleware.ts` guards every route except `/login` |
| **Realtime** | Supabase Realtime — leaderboard updates push to all clients the moment a result is scored |
| **Storage** | Supabase Storage — `avatars` bucket (public-read) for profile photos |
| **PWA** | `@ducanh2912/next-pwa` with Workbox service worker, offline shell, and app badge |
| **Hosting** | Vercel — auto-deploys on every push to `main` |
| **Design** | Schibsted Grotesk typeface, token-driven colour scheme, custom SVG charts with no chart library |

---

## Architecture

```mermaid
flowchart LR
  subgraph Client["Client Layer"]
    direction TB
    subgraph PWA["PWA Boundary"]
      direction TB
      Browser["Browser — Next.js App Router"]
      Pages["app/* pages"]
      Components["components/*"]
      ClientLib["lib/* client helpers"]
      SW["Service Worker — Workbox"]
      Browser --> Pages --> Components --> ClientLib
      SW -. wraps .-> Browser
    end
  end

  subgraph Server["Server Layer"]
    direction TB
    API["app/api/* route handlers"]
    ScoreMatch["score-match"]
    ScoreGroups["score-groups"]
    ScoreTournament["score-tournament"]
    SnapshotRanks["snapshot-ranks"]
    RescoreAll["rescore-all"]
    API --> ScoreMatch & ScoreGroups & ScoreTournament & SnapshotRanks & RescoreAll
  end

  subgraph Data["Supabase"]
    direction TB
    Postgres["Postgres + RLS"]
    Auth["Auth"]
    Realtime["Realtime"]
    Storage["Storage"]
  end

  subgraph Domain["Shared Domain Logic"]
    direction TB
    Scoring["lib/scoring.ts"]
    Prizes["lib/prizes.ts"]
    Leaderboard["lib/leaderboard.ts"]
  end

  Client -->|"supabase-js — RLS-guarded"| Data
  Client -->|"admin POST"| Server
  Server -->|"validated writes"| Data
  Realtime -. "live push — no reload" .-> Client
  Domain -. "imported by" .-> Client & Server

  classDef layer fill:#ffffff,stroke:#d0d7de,color:#24292f,stroke-width:2px
  classDef client fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:2px
  classDef pwa fill:#fff7ed,stroke:#f97316,color:#9a3412,stroke-width:2px
  classDef server fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:2px
  classDef data fill:#ecfdf5,stroke:#059669,color:#064e3b,stroke-width:2px
  classDef domain fill:#eef2ff,stroke:#4f46e5,color:#312e81,stroke-width:2px
  classDef worker fill:#fffbeb,stroke:#d97706,color:#92400e,stroke-width:2px

  class Client,Server,Data,Domain layer
  class Browser,Pages,Components,ClientLib client
  class PWA pwa
  class SW worker
  class API,ScoreMatch,ScoreGroups,ScoreTournament,SnapshotRanks,RescoreAll server
  class Postgres,Auth,Realtime,Storage data
  class Scoring,Prizes,Leaderboard domain
```

**Data flow**

1. User submits a prediction → client writes to `predictions` via supabase-js (RLS enforces own-row-only writes)
2. Admin enters a result → POST to `/api/score-match` → reads point values from `lib/scoring.ts`, computes per-category breakdown, writes back to each `predictions` row
3. `lib/leaderboard.ts` aggregates scored predictions client-side — shared between the dashboard mini-table and `/leaderboard`
4. `lib/prizes.ts` derives the prize snapshot from aggregated standings
5. Supabase Realtime pushes `predictions` UPDATE events to all connected clients — standings update instantly with no page reload

<details>
<summary>Project structure</summary>

```
app/
  page.tsx                  Landing page
  login/                    Email/password auth
  dashboard/                Rank, stats, hero match, form strip, prize outlook, activity feed
  predictions/              Fixtures list with filters and quick-predict bottom sheet
  match/[id]/               Full prediction form, consensus reveal, prediction wall
  groups/                   Group order predictor (all 12 groups)
  bracket/                  Knockout bracket and tournament picks
  leaderboard/              Live standings, per-GW view, rank arrows, CSV export
  h2h/                      Head-to-head compare with stats and points race chart
  squads/                   48-nation squad browser with position grouping
  profile/                  Stats, accuracy, rank chart tabs, badges, avatar crop
  rules/                    Scoring rules reference
  admin/                    Result entry and scoring actions (is_admin guard)
  api/
    score-match/            Score one match and trigger Realtime
    score-groups/           Score group finishing predictions
    score-tournament/       Score bracket predictions
    snapshot-ranks/         Capture rank snapshot
    rescore-all/            Full recompute of all scored predictions

components/
  AppShell.tsx              Desktop sidebar, mobile bottom nav, theme toggle
  ui.tsx                    Design system — Button, Card, StatCard, Pill, Avatar,
                            ScoreStepper, Countdown, Modal, CountUp, icons, Logo
  football.tsx              MatchCard, NextPredictCard, LeaderboardTable
  FlagChip.tsx              Flag images for all 48 nations
  charts.tsx                BarChart, AreaChart, RankLine — SVG only, no chart library
  RulesContent.tsx          Shared rules copy used by RulesModal and /rules

lib/
  scoring.ts                Single source of truth for all point values
  prizes.ts                 Prize pool constants and computePrizeSnapshot
  leaderboard.ts            aggregateLeaderboard — shared aggregation and canonical sort
  league.ts                 getActiveLeague, isMoneyLeague, multi-league helpers
  teams.ts                  48 WC2026 teams with code, name, flag, and playerKey
  rate-limit.ts             In-memory token bucket (10 req/min per key)
  supabase-browser.ts       Browser Supabase client (anon key)
  supabase-server.ts        Server Supabase client (service role, RSC)

supabase/migrations/        SQL migrations applied in filename order via supabase db push
scripts/
  fetch-players.ts          Pulls WC2026 squads from football-data.org into the players table
middleware.ts               Redirects unauthenticated users to /login for all routes
```

</details>

---

## Local development

### 1. Clone and install

```bash
git clone https://github.com/calebsooon/wc26-predictor.git
cd wc26-predictor
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your Supabase project values (found under **Project Settings → API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 3. Apply migrations

```bash
brew install supabase/tap/supabase   # macOS — see supabase.com/docs for other platforms
supabase login --token <your-access-token>
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Run

```bash
npm run dev          # Development server → http://localhost:3000
npm run build        # Production build (generates service worker)
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript check
npx vitest run       # Unit tests
```

> **PWA note:** the service worker is disabled in development to avoid stale-cache issues. To test offline behaviour run `npm run build && npm start`, then open DevTools → Application → Service Workers → tick **Offline**.

### 5. Grant admin access

In Supabase → **Table Editor → `profiles`**, set `is_admin = true` for your account. The Admin nav link appears on next page load.

### 6. Populate squad data *(optional)*

```bash
FOOTBALL_API_TOKEN=<token> \
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<service-role-key> \
npx tsx scripts/fetch-players.ts
```

Get a free API token at [football-data.org](https://www.football-data.org/client/register). The free tier fetches all 48 WC2026 squads (~1,250 players) with a 7-second delay between teams to stay within rate limits.

---

## Deployment

| Step | Action |
| :---: | :--- |
| 1 | Push the repository to GitHub |
| 2 | On [vercel.com](https://vercel.com) → **Add New Project** → import the repo (Next.js is auto-detected) |
| 3 | Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` under **Settings → Environment Variables** |
| 4 | In Supabase → **Authentication → URL Configuration → Redirect URLs**, add `https://<your-vercel-domain>/auth/callback` |
| 5 | Vercel deploys automatically on every push to `main` |

---

<p align="center">
  <sub>Built for WC2026 &nbsp;·&nbsp; Private league &nbsp;·&nbsp; Not affiliated with FIFA</sub>
</p>
