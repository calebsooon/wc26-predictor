<p align="center">
  <img src="public/icon.svg" width="88" height="88" alt="MatchDay logo" />
</p>

<h1 align="center">MatchDay</h1>

<p align="center">
  <strong>Private World Cup 2026 prediction league</strong><br/>
  Predict every scoreline &nbsp;·&nbsp; Compete on a live leaderboard &nbsp;·&nbsp; Settle the prize pool
</p>

<p align="center">
  Built by <a href="https://github.com/aryan12singh">@aryan12singh</a> &nbsp;&amp;&nbsp; <a href="https://github.com/calebsooon">@calebsooon</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15_App_Router-black?style=flat-square&logo=next.js" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_+_Realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vercel-deployed-black?style=flat-square&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa" alt="PWA" />
</p>

<br/>

MatchDay is a private, invite-only prediction league for FIFA World Cup 2026. Players predict scorelines, group finishing orders, and the full knockout bracket across 104 matches. An admin enters real results, points settle instantly via server-side scoring, and a zero-sum prize pool updates live — no page refresh needed.

---

## Highlights

- **Full-tournament prediction system** — scorelines, group orders, and knockout bracket in one app, across 8 gameweeks and 104 matches
- **Granular scoring** — correct outcome, exact score, goal difference, total goals, BTTS, first-goal team, and first scorer (+4 pts), all with independent hedging
- **Zero-sum prize pool** — per-gameweek and overall payouts settle automatically from a shared pot; dashboard shows projected and settled totals at all times
- **Real-time everything** — Supabase Realtime pushes leaderboard and prediction updates to every connected client the moment a result is scored
- **Multi-league** — admin-created leagues with private join codes; each group of friends gets isolated standings, rules, and a prize pool
- **Live squad data** — 48-nation rosters with headshots, clubs, ages, and injury flags; formation pitch rendered from confirmed lineups; Golden Boot race with headshots and flags
- **Calendar integration** — RFC 5545 iCalendar feed per user, timezone-aware, with configurable reminders; subscribes to Google, Apple, Outlook, and Notion calendars
- **PWA** — installable on iOS, Android, and desktop; offline shell with Workbox
- **Colour-blind mode** — Okabe–Ito CVD-safe palette, scoped to the leaderboard chart alone or the whole app; synced across devices
- **RLS-hardened** — predictions hidden before kickoff, scoped to shared league members only; invite codes never exposed to the client

---

## Contents

- [Demo](#demo)
- [How it works](#how-it-works)
- [Scoring](#scoring)
- [Prize pool](#prize-pool)
- [Features](#features)
- [Screenshots](#screenshots)
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
| GW1 / GW2 / GW3 | Group Stage |
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
| Calendar export | Subscribe to or download fixtures as an iCalendar feed — auto-updating, timezone-aware, with a configurable reminder; works in Google, Apple, Outlook, and Notion |
| Lineups &amp; formation | Confirmed starting XI and manager formation rendered on a positional pitch once published |

</details>

<details>
<summary><strong>Live data</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Live lineups | Confirmed XI, substitutes, shirt numbers, and formation pulled from Kickoffapi |
| Results &amp; first scorer | Final scores and the opening goalscorer fetched from match events, then scored automatically |
| Injury flags | Out/suspended players flagged across squad views |
| Golden Boot | Tournament top scorers and assists, with headshots and nation flags; data cached in Supabase |
| Player enrichment | Headshots, clubs, and dates of birth sourced from Wikidata; self-hosted in Supabase Storage |
| Residential sync | Live data is pulled via local `npm run data:*` scripts (Kickoffapi blocks datacenter IPs); the app reads from Supabase |

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
| Colour-blind mode | CVD-safe (Okabe–Ito) palette, scoped to the leaderboard chart or the whole app; synced across devices |

</details>

<details>
<summary><strong>Admin</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Result entry | Score and first scorer per match; locks prediction input for all players |
| Fetch lineup | One-click confirmed lineup and formation import per match |
| Sync results + scorers | Pull finished scores and the first goalscorer, then auto-score every prediction |
| Sync injuries | Refresh injury and suspension flags across the squad data |
| Rank snapshots | Captured automatically after scoring for movement arrows |
| Rescore all | Full recompute — use after any rule or data correction |

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
| `/squads` | 48-nation squad browser — headshots, clubs, ages, injury flags, scorer picks |
| `/golden-boot` | Tournament top scorers and assists |
| `/profile` | Stats, accuracy, rank chart, badges, bracket and group picks |
| `/rules` | Scoring rules reference |
| `/admin` | Result entry and all scoring actions |

</details>

---

## Demo

> ▶ [**Watch the demo on YouTube**](https://youtu.be/IPu3W5JPbZQ)

[![Watch the MatchDay demo](docs/MatchDay-Video-Thumbnail-1280x720.png)](https://youtu.be/IPu3W5JPbZQ)

---

## Screenshots

### Landing & Dashboard

![Landing page](docs/screenshots/VisitPage.png)

![Dashboard](docs/screenshots/DashBoard.png)

<details>
<summary><strong>Core gameplay</strong></summary>

<br/>

| Fixtures (dark) | Fixtures — group filter (light) |
|---|---|
| ![Fixtures](docs/screenshots/FixturesPage.png) | ![Fixtures light mode](docs/screenshots/FixturesLightModeGroupFilter.png) |

| Predict a match | Scored match — league predictions revealed |
|---|---|
| ![Match prediction](docs/screenshots/MatchCard.png) | ![Completed match card](docs/screenshots/CompletedMatchCard.png) |

![Full match page — lineups, prediction form, league picks](docs/screenshots/FullMatchDetails.png)

</details>

<details>
<summary><strong>Standings &amp; competition</strong></summary>

<br/>

![Leaderboard](docs/screenshots/Leaderboard.png)

![Points race chart](docs/screenshots/Leaderboard1.png)

| Tournament bracket | Group predictor |
|---|---|
| ![Bracket](docs/screenshots/TournamentBracket.png) | ![Groups](docs/screenshots/Groups.png) |

</details>

<details>
<summary><strong>Mobile (PWA)</strong></summary>

<br/>

| Fixtures | Home &amp; navigation |
|---|---|
| ![Mobile fixtures](docs/screenshots/PhoneFixture.png) | ![Mobile home](docs/screenshots/PhoneHome.png) |

</details>

<details>
<summary><strong>More screenshots</strong></summary>

<br/>

| Profile | Head-to-head comparison |
|---|---|
| ![Profile](docs/screenshots/Profile.png) | ![Comparison](docs/screenshots/Comparison.png) |

| Squad browser | Golden Boot |
|---|---|
| ![Squads](docs/screenshots/Squads.png) | ![Golden Boot](docs/screenshots/GoldenBoot.png) |

| Calendar export | Profile settings &amp; colour-blind mode |
|---|---|
| ![Calendar](docs/screenshots/Calendar.png) | ![Settings](docs/screenshots/Settings.png) |

| Admin — result entry | Admin — console |
|---|---|
| ![Score entry](docs/screenshots/ScoreEntry.png) | ![Admin console](docs/screenshots/Admin.png) |

| PWA install guide |  |
|---|---|
| ![PWA install](docs/screenshots/PWAInstall.png) | |

</details>

---

## Tech stack

| | Layer | Technology |
| :---: | :--- | :--- |
| ![Next.js](https://img.shields.io/badge/-Next.js-000?style=flat-square&logo=next.js) | **Framework** | Next.js 15 — App Router, server and client components, API route handlers |
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) | **Language** | TypeScript in strict mode throughout |
| ![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=000) ![Tailwind](https://img.shields.io/badge/-Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) | **UI** | React 18, Tailwind CSS with CSS-variable design tokens (light/dark via `.dark` on `<html>`) |
| ![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Database** | Supabase Postgres with Row Level Security — prediction visibility scoped by kickoff time and league membership |
| ![Supabase](https://img.shields.io/badge/-Auth-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Auth** | Supabase Auth — email/password; `middleware.ts` guards every route except `/login` |
| ![Supabase](https://img.shields.io/badge/-Realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Realtime** | Supabase Realtime — leaderboard updates push to all clients the moment a result is scored |
| ![Supabase](https://img.shields.io/badge/-Storage-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Storage** | Supabase Storage — `avatars` bucket for profile photos; `player-photos` for self-hosted headshots |
| ![PWA](https://img.shields.io/badge/-PWA-5A0FC8?style=flat-square&logo=pwa) | **PWA** | `@ducanh2912/next-pwa` with Workbox service worker, offline shell, and app badge |
| ![Vercel](https://img.shields.io/badge/-Vercel-000?style=flat-square&logo=vercel) | **Hosting** | Vercel — auto-deploys on every push to `main` |
| ![Postgres](https://img.shields.io/badge/-Postgres-4169E1?style=flat-square&logo=postgresql&logoColor=white) | **Live data** | Kickoffapi for fixtures, lineups, events, injuries, scorers; Wikidata for bios and photos |
| ![Google Calendar](https://img.shields.io/badge/-iCalendar-4285F4?style=flat-square&logo=googlecalendar&logoColor=white) | **Calendar** | RFC 5545 iCalendar feeds — auto-updating, timezone-aware; works in Google, Apple, Outlook, Notion |
| | **Accessibility** | Colour-blind-safe palette mode (Okabe–Ito), DB-backed and synced across devices |
| | **Design** | Schibsted Grotesk typeface, token-driven colour scheme, custom SVG charts — no chart library |

---

## Architecture

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontSize": "18px",
    "fontFamily": "ui-sans-serif, system-ui, sans-serif"
  },
  "flowchart": {
    "nodeSpacing": 55,
    "rankSpacing": 110,
    "padding": 24
  }
}}%%
flowchart LR
  subgraph Client["🖥️  Client Layer"]
    direction TB
    subgraph PWA["PWA Boundary"]
      direction TB
      Browser["Browser\nNext.js App Router"]
      Pages["app/* pages"]
      Components["components/*"]
      ClientLib["lib/* client helpers"]
      SW["⚙️ Service Worker — Workbox"]
      Browser --> Pages --> Components --> ClientLib
      SW -. offline shell .-> Browser
    end
  end

  subgraph Server["⚡  Server Layer"]
    direction TB
    API["app/api/* route handlers"]
    ScoreMatch["score-match"]
    ScoreGroups["score-groups"]
    ScoreTournament["score-tournament"]
    SnapshotRanks["snapshot-ranks"]
    RescoreAll["rescore-all"]
    LiveSync["fetch-lineup\nsync-results\nsync-injuries"]
    GoldenBoot["golden-boot"]
    Calendar["calendar\niCal feed"]
    API --> ScoreMatch & ScoreGroups & ScoreTournament & SnapshotRanks & RescoreAll & LiveSync & GoldenBoot & Calendar
  end

  subgraph External["🌐  External APIs"]
    direction TB
    Kickoff["Kickoffapi\nlineups · events · scorers · injuries"]
    Wikidata["Wikidata\nplayer bios · photos"]
  end

  subgraph Scripts["🏠  Residential Scripts"]
    direction TB
    DataLive["npm run data:live\nresults · lineups · injuries · Golden Boot"]
  end

  subgraph Data["🗄️  Supabase"]
    direction TB
    Postgres["Postgres + RLS"]
    Auth["Auth"]
    Realtime["Realtime"]
    Storage["Storage\navatars · player-photos"]
    LiveCache["live_cache\nKickoffapi snapshot"]
  end

  subgraph Domain["📐  Shared Domain Logic"]
    direction TB
    Scoring["lib/scoring.ts\npoint values"]
    Prizes["lib/prizes.ts\nprize pool"]
    Leaderboard["lib/leaderboard.ts\naggregate + sort"]
  end

  Client -->|"supabase-js — RLS-guarded reads/writes"| Data
  Client -->|"admin POST"| Server
  Server -->|"validated writes"| Data
  Scripts -->|"fetch via residential IP"| External
  Scripts -->|"service role upsert"| LiveCache
  LiveCache --- Postgres
  Realtime -. "live push — no page reload" .-> Client
  Domain -. "imported by" .-> Client & Server

  classDef layer fill:#ffffff,stroke:#d0d7de,color:#24292f,stroke-width:2px
  classDef client fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:2px
  classDef pwa fill:#fff7ed,stroke:#f97316,color:#9a3412,stroke-width:2px
  classDef server fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:2px
  classDef data fill:#ecfdf5,stroke:#059669,color:#064e3b,stroke-width:2px
  classDef domain fill:#eef2ff,stroke:#4f46e5,color:#312e81,stroke-width:2px
  classDef worker fill:#fffbeb,stroke:#d97706,color:#92400e,stroke-width:2px

  class Client,Server,Data,Domain,External,Scripts layer
  class Browser,Pages,Components,ClientLib client
  class PWA pwa
  class SW worker
  class API,ScoreMatch,ScoreGroups,ScoreTournament,SnapshotRanks,RescoreAll,LiveSync,GoldenBoot,Calendar server
  class Kickoff,Wikidata,DataLive worker
  class Postgres,Auth,Realtime,Storage,LiveCache data
  class Scoring,Prizes,Leaderboard domain
```

**Data flow**

1. User submits a prediction → client writes to `predictions` via supabase-js (RLS enforces own-row-only writes; predictions hidden from other members until kickoff)
2. Admin enters a result → POST to `/api/score-match` → reads point values from `lib/scoring.ts`, computes per-category breakdown, writes back to each `predictions` row
3. `lib/leaderboard.ts` aggregates scored predictions — shared between the dashboard mini-table and `/leaderboard`
4. `lib/prizes.ts` derives the prize snapshot from aggregated standings
5. Supabase Realtime pushes `predictions` UPDATE events to all connected clients — standings update instantly with no page reload
6. Live data (lineups, results, injuries, Golden Boot) is fetched from Kickoffapi via residential `npm run data:*` scripts and cached in Supabase; the app reads from Supabase, not from the provider directly

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
  squads/                   48-nation browser — photos, clubs, ages, injuries, scorer picks
  golden-boot/              Tournament top scorers and assists
  profile/                  Stats, accuracy, rank chart tabs, badges, avatar crop
  rules/                    Scoring rules reference
  admin/                    Result entry and scoring actions (is_admin guard)
  api/
    score-match/            Score one match and trigger Realtime
    score-groups/           Score group finishing predictions
    score-tournament/       Score bracket predictions
    snapshot-ranks/         Capture rank snapshot
    rescore-all/            Full recompute of all scored predictions
    fetch-lineup/           Import confirmed XI + formation (admin)
    sync-results/           Pull scores + first scorer, then auto-score (admin)
    sync-injuries/          Refresh injury / suspension flags (admin)
    golden-boot/            Serve top scorers / assists from cache
    calendar/[token]/       Per-user iCalendar fixture feed

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
  normalize.ts              Universal ASCII name folding (Turkish, Nordic, Polish, …)
  league.ts                 getMyLeagues, isMoneyLeague, multi-league helpers
  teams.ts                  48 WC2026 teams with code, name, flag, and playerKey
  kickoff.ts                Kickoffapi client — fixtures, lineups, events
  team-match.ts             External team/player name → our codes and roster matching
  ics.ts                    RFC 5545 iCalendar builder for the fixture feed
  supabase-browser.ts       Browser Supabase client (anon key)
  supabase-server.ts        Server Supabase client (service role, RSC)

supabase/migrations/        SQL migrations applied in filename order via supabase db push
scripts/
  fetch-players.ts          Pulls WC2026 squads from football-data.org
  fetch-wikidata-players.ts Enriches players with photos, clubs, and DOBs from Wikidata
  cache-player-photos.ts    Downloads Wikimedia photos and re-hosts in Supabase Storage
  fill-missing-photos.ts    Gap-fills remaining missing photos from Kickoffapi CDN
  sync-results.ts           Residential: pull finished scores + scorers, re-score predictions
  sync-lineups.ts           Residential: pull confirmed XI + formations
  sync-injuries.ts          Residential: pull injury / suspension flags
  sync-golden-boot.ts       Residential: pull top scorers / assists into Supabase cache
  grant-admin.ts            Bootstrap the first organizer account
  setup-check.ts            Schema, connectivity, and launch-readiness check
.github/workflows/
  live-data.yml             Manual GitHub Action that pings the sync endpoints
middleware.ts               Redirects unauthenticated users to /login for all routes
```

</details>

---

## Local development

### 1. Clone and install

```bash
git clone <your-repository-url>
cd wc26-predictor
npm ci
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values. Required fields are marked below:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>   # server-only — never commit
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional — live data sync (run from your local machine; see Live data below)
KICKOFF_API_KEY=<kickoffapi-key>
FOOTBALL_API_TOKEN=<football-data.org-key>          # only needed for data:players

# Optional — GitHub Actions manual sync trigger
CRON_SECRET=<random-string>                         # server-only — never commit

# Optional — browser push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>                     # server-only — never commit
VAPID_EMAIL=mailto:<you@example.com>

# Optional — public footer link
NEXT_PUBLIC_GITHUB_URL=https://github.com/<owner>/<repo>
```

### 3. Apply migrations

```bash
brew install supabase/tap/supabase   # macOS — see supabase.com/docs for other platforms
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Create the first organizer

Sign up once at `http://localhost:3000/login`. The Auth trigger creates a non-privileged profile automatically. Grant the organizer role:

```bash
ADMIN_EMAIL=you@example.com npm run bootstrap:admin
ADMIN_EMAIL=you@example.com npm run setup:check
```

### 5. Populate squad data

```bash
npm run data:players     # Required — seeds the 48-nation rosters from football-data.org
npm run data:enrich      # Optional — adds clubs, DOBs, and photos from Wikidata
npm run data:photos      # Optional — self-hosts Wikimedia photos in Supabase Storage
npm run data:fill-photos # Optional — gap-fills remaining missing photos via Kickoffapi CDN
```

### 6. Live data (lineups, results, injuries, Golden Boot)

Live match data is fetched from Kickoffapi. Because Kickoffapi sits behind Cloudflare, server-side calls from Vercel or GitHub Actions are blocked by an IP challenge. Live data is refreshed by running scripts **from your local machine**, which then writes to Supabase — the app reads from Supabase:

```bash
npm run data:live        # run all four: results → lineups → injuries → Golden Boot
# or individually:
npm run data:results     # finished scores + first scorer; re-scores predictions
npm run data:lineups     # confirmed XI + formations (published ~75 min before kickoff)
npm run data:injuries    # injury / suspension flags
npm run data:golden-boot # top scorers and assists
```

Run these after matches finish (or before kickoff for lineups). The admin result-entry form in `/admin` is always available as a manual fallback.

### 7. Verify and run

```bash
npm run setup:check  # schema, connectivity, and configured launch features
npm run check        # lint, typecheck, unit tests, and production build
npm run dev          # development server → http://localhost:3000
```

> **PWA note:** the service worker is disabled in development. To test offline behaviour, run `npm run build && npm start` and open DevTools → Application → Service Workers → **Offline**.

---

## Deployment

| Step | Action |
| :---: | :--- |
| 1 | Create a hosted Supabase project, run `supabase db push`, and add `http://localhost:3000/auth/callback` + `https://<your-domain>/auth/callback` under **Authentication → URL Configuration**. |
| 2 | Sign up once, run `ADMIN_EMAIL=<email> npm run bootstrap:admin`, create a private league, and confirm a second account can join only via its invite code. |
| 3 | Import the repository in [Vercel](https://vercel.com). Add every value from `.env.example`; set `NEXT_PUBLIC_SITE_URL` to your production domain. |
| 4 | In GitHub **Settings → Secrets → Actions**, add `APP_URL=https://<your-domain>` and `CRON_SECRET`. Use **Run workflow** on the Actions tab to manually trigger a live-data sync. |
| 5 | Deploy, then run `ADMIN_EMAIL=<email> npm run setup:check` against the production URL. |

---

## Launch checklist

- `npm ci`, `supabase db push`, `npm run setup:check`, and `npm run check` all pass cleanly
- A normal account cannot change `is_admin`, read a league's join code directly, add itself to a league, or update match data
- The first organizer is created only via `npm run bootstrap:admin`
- Test a locked prediction, the formation pitch, result scoring, calendar token, and the LinkedIn Open Graph preview
- Confirm live data by running `npm run data:live` from your local machine after a match finishes

---

## Launch notes

MatchDay is a private-league product, not a public demo. It stores email-auth accounts, optional public avatars, browser push subscriptions, and revocable calendar-feed tokens. The in-app [Privacy](/privacy) and [Terms](/terms) pages describe those surfaces. This is an independent fan project and is not affiliated with FIFA.

---

<p align="center">
  <sub>Built for WC2026 &nbsp;·&nbsp; Private league &nbsp;·&nbsp; Not affiliated with FIFA</sub><br/>
  <sub>Built by <a href="https://github.com/aryan12singh">@aryan12singh</a> &nbsp;&amp;&nbsp; <a href="https://github.com/calebsooon">@calebsooon</a></sub>
</p>
