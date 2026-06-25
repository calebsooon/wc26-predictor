<p align="center">
  <img src="public/icon.svg" width="88" height="88" alt="MatchDay logo" />
</p>

<h1 align="center">MatchDay</h1>

<p align="center">
  <strong>Private World Cup 2026 prediction league</strong><br/>
  Predict every scoreline &nbsp;·&nbsp; Compete on a live leaderboard &nbsp;·&nbsp; Follow the prize pool
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

<p align="center">
  <a href="https://youtu.be/Lr90xLBT0lY">
    <img src="docs/MatchDay-Video-Thumbnail-1280x720.png" alt="Watch the MatchDay demo" width="720" />
  </a><br/>
  <sub>&#9654; &nbsp;Click to watch the demo</sub>
</p>

<br/>

<p align="center">
  A private prediction league for FIFA World Cup 2026.<br/>
  Predict every scoreline, group order, and knockout bracket across 104 matches.<br/>
  Points settle instantly. The leaderboard updates live. The prize pool runs itself.
</p>

---

## Highlights

| | |
| :-- | :-- |
| ![](https://img.shields.io/badge/SCOPE-16a34a?style=flat-square) | **104 matches · 8 gameweeks.** Group stage through the final, fully predicted |
| ![](https://img.shields.io/badge/SCORING-2563eb?style=flat-square) | **Granular scoring.** Outcome · exact score · goal diff · total goals · BTTS · first scorer (+4 pts) |
| ![](https://img.shields.io/badge/PRIZES-d97706?style=flat-square) | **Zero-sum prize pool.** Per-GW and overall payouts settle automatically from a shared pot |
| ![](https://img.shields.io/badge/REALTIME-7c3aed?style=flat-square) | **Live leaderboard.** Supabase Realtime pushes updates the moment a result lands |
| ![](https://img.shields.io/badge/LEAGUES-0891b2?style=flat-square) | **Multi-league.** Private leagues with join codes; isolated standings per group of friends |
| ![](https://img.shields.io/badge/MATCH_CENTRE-16a34a?style=flat-square) | **Broadcast-style pitch.** Formation-first XI layout, kit-coloured player tokens, verified substitutions, tactical shape changes, and match events on a live positional pitch |
| ![](https://img.shields.io/badge/DATA-ea580c?style=flat-square) | **FIFA-backed match data.** Cached rosters · full-kit player images · team/player stats · confirmed lineups · Golden Boot · import freshness |
| ![](https://img.shields.io/badge/RECAPS-be185d?style=flat-square) | **Gameweek stories.** Dynamic recaps, League Pulse, rank movement, xG upsets, and private share cards |
| ![](https://img.shields.io/badge/CALENDAR-0284c7?style=flat-square) | **iCal feed.** Auto-updating per user; works in Google, Apple, Outlook, and Notion |
| ![](https://img.shields.io/badge/PWA-4f46e5?style=flat-square) | **Installable.** iOS, Android, and desktop; offline shell with Workbox |
| ![](https://img.shields.io/badge/A11Y-db2777?style=flat-square) | **Colour-blind mode.** Okabe–Ito CVD-safe palette, scoped to chart or whole app; DB-synced |
| ![](https://img.shields.io/badge/SECURITY-475569?style=flat-square) | **RLS-hardened.** Predictions gated by kickoff time and league membership at the DB level |

---

## Contents

- [How it works](#how-it-works)
- [Scoring](#scoring)
- [Prize pool](#prize-pool)
- [Features](#features)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Data operations](#data-operations)
- [Deployment](#deployment)
- [Launch checklist](#launch-checklist)

---

## How it works

![](https://img.shields.io/badge/01-16a34a?style=flat-square) **Join your league**

Sign up with email, enter your invite code, and you're in. Leagues are private and admin-created; each group of friends gets its own isolated standings and prize pool. Multiple leagues are supported.

![](https://img.shields.io/badge/02-16a34a?style=flat-square) **Submit predictions before kickoff**

Head to **Fixtures** and enter your scoreline for each match. On top of the score, you can predict:

- **First-goal team** — which side opens the scoring
- **First scorer** — the specific player (highest reward, +4 pts)
- **Total goals** — an independent hedge that earns points even if the exact score is wrong
- **Goal difference** — a second hedge, togglable per league by the admin

Predictions lock at kickoff. The admin enters the result and every prediction is scored automatically across all per-category columns.

![](https://img.shields.io/badge/03-16a34a?style=flat-square) **Compete across 8 gameweeks**

Points accumulate through the group stage and all knockout rounds. Supabase Realtime pushes leaderboard updates the moment results land, no refresh needed.

![](https://img.shields.io/badge/04-16a34a?style=flat-square) **Predict the structure**

Beyond individual matches, predict group finishing orders (+2 per correct placement) and the full knockout bracket — champion, runner-up, semi-finalists, and quarter-finalists (up to +55 pts total).

![](https://img.shields.io/badge/05-16a34a?style=flat-square) **The prize pool settles itself**

Each gameweek and the overall standings pay out and claw back based on finishing position. The dashboard shows your current rank, settled net, projected total, and best/worst prize range at all times.

---

## Scoring

### Match predictions &nbsp;&nbsp; ![](https://img.shields.io/badge/max_16_pts-16a34a?style=flat-square)

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

### Group predictions &nbsp;&nbsp; ![](https://img.shields.io/badge/max_8_pts_per_group-16a34a?style=flat-square)

**+2** for each team placed in the correct group finishing position across 12 groups.

### Tournament bracket &nbsp;&nbsp; ![](https://img.shields.io/badge/max_55_pts-16a34a?style=flat-square)

| Pick | Pts |
| :--- | :---: |
| Champion | **+15** |
| Runner-up | **+8** |
| Each correct semi-finalist (×4) | **+4** |
| Each correct quarter-finalist (×8) | **+2** |

---

## Prize pool

Zero-sum pool settled per gameweek (GW1–GW8) and overall at tournament end.

| Position | Per gameweek | Overall |
| :---: | :---: | :---: |
| 1st | ![](https://img.shields.io/badge/+%2415-16a34a?style=flat-square) | ![](https://img.shields.io/badge/+%2440-16a34a?style=flat-square) |
| 2nd | ![](https://img.shields.io/badge/+%2410-16a34a?style=flat-square) | ![](https://img.shields.io/badge/+%2420-16a34a?style=flat-square) |
| 3rd | ![](https://img.shields.io/badge/+%245-16a34a?style=flat-square) | ![](https://img.shields.io/badge/+%2410-16a34a?style=flat-square) |
| 4th | ![](https://img.shields.io/badge/%240-6b7280?style=flat-square) | ![](https://img.shields.io/badge/%240-6b7280?style=flat-square) |
| 5th | ![](https://img.shields.io/badge/-%245-dc2626?style=flat-square) | ![](https://img.shields.io/badge/-%2410-dc2626?style=flat-square) |
| 6th | ![](https://img.shields.io/badge/-%2410-dc2626?style=flat-square) | ![](https://img.shields.io/badge/-%2420-dc2626?style=flat-square) |
| 7th | ![](https://img.shields.io/badge/-%2415-dc2626?style=flat-square) | ![](https://img.shields.io/badge/-%2440-dc2626?style=flat-square) |

**Tiebreakers (in order):** total points → correct outcomes → exact scorelines → correct goal differences → correct total goals → correct BTTS calls → correct first-goal team → correct first scorer → predictions submitted → shared rank if still equal.

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
| First scorer pick | Full-screen card modal — search the available match squad, or pick "No scorer" / "Own goal" |
| Total goals &amp; goal diff | Independent hedges set separately from the scoreline |
| Own goal handling | Admin marks OG; excluded from first-scorer scoring |
| Group order predictor | Drag-and-drop finishing predictions for all 12 groups |
| Knockout bracket | Pick champion, runner-up, semi-finalists, quarter-finalists |
| Per-league goal diff | Admin can enable or disable goal difference scoring per league |
| Quick-predict sheet | Bottom sheet on the Fixtures page for fast in-line prediction without leaving the list |
| Reveal-safe league insight | League Pulse and the prediction wall respect each league&apos;s reveal setting; aggregate reads unlock only when the current rule permits |

</details>

<details>
<summary><strong>Match Centre</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Positional pitch | Broadcast-style pitch rendered with kit-coloured player tokens scaled to the pitch container; tap any token to open a player detail sheet |
| Formation-first rendering | FIFA tactics resolve full formations — including back threes, wing-backs, five-at-the-back, pivots, diamonds, and narrow systems — into balanced tactical rows using `lib/lineup-layout.ts` |
| Provider-resilient placement | Side-specific roles such as `LCB` / `RCB` and `LWB` / `RWB` are classified correctly; an incomplete team sheet retains its intended formation depth rather than compressing into the available rows |
| Player tokens | Silhouette or official headshot, shirt number, surname plate, goal ball / yellow card indicators, and GK colour dot |
| Confirmed XI vs bench | Starting XI on pitch; substitutes listed below in a responsive grid. Dense four-/five-player lines automatically use more compact tokens for clear spacing |
| Substitution events | Verified in-match subs replace the outgoing player in their exact pitch slot, with minute and player-in/out preserved |
| Tactical shape changes | The latest verified formation change powers the Current XI; shape changes sit alongside goals, cards, and substitutions in the match timeline |
| Match events timeline | Goals, yellow cards, red cards, substitutions, and tactical changes are shown per team with minute |
| Match facts panel | Venue, officials, weather, attendance, xG, shots, possession, passes, fouls, corners, and full player match-stat grids |
| Focus view | Fullscreen pitch overlay for immersive viewing |
| Live Supabase sync | Lineup and event data updates in real time without a page reload |

</details>

<details>
<summary><strong>Fixtures &amp; results</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Filter tabs | Open · Today · Missing · Closed · Full — always know where to act |
| Points colour coding | Points pill turns green / amber / red based on percentage of max possible |
| Stage filter | All · Group Stage · Knockout — second filter row |
| Consensus reveal | After kickoff, every member's full prediction for that match is visible |
| Prediction wall | See the whole league's pick distribution, scorer choices, and points breakdown per match |
| Calendar export | Subscribe to or download fixtures as an iCalendar feed — auto-updating, timezone-aware, with a configurable reminder; works in Google, Apple, Outlook, and Notion |
| League Pulse | Reveal-safe crowd distributions, top scorelines, BTTS / goals read, scorer podium, and your majority / minority context |
| Match-page layout | Desktop section rail (Match Centre → Match Stats → League Pulse → Everyone's Picks) and mobile tab bar; prediction form is always one tap away |

</details>

<details>
<summary><strong>Live data</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| FIFA Match Centre | Official fixtures, results, venue, officials, weather, team sheets, substitutions, and match stats cached into Supabase |
| Live lineups | Confirmed XI, bench, shirt numbers, FIFA formation, manual formation overrides, verified substitutions, and tactical shape changes rendered on a positional pitch |
| Match facts | Venue, officials, weather, attendance, score comparison, xG, and complete player match-stat grids |
| Availability flags | Any recorded unavailable / suspended players are flagged across team views |
| FIFA Teams centre | 48 team cards, confederation filters, form, fixtures, tournament stats, and full-kit squad cards — all served from Supabase |
| Golden Boot | FIFA-published tournament scorers and assists, cached in Supabase with FIFA's official ordering |
| Player enrichment | Official FIFA player images cached in Supabase Storage; optional Wikidata enrichment supplies club and date-of-birth gaps |
| Local sync | Official data is imported by local `npm run data:fifa:*` scripts; player-facing pages read only cached Supabase data |
| Import resilience | Sync runs record freshness, rows read/written, errors, raw FIFA match snapshots, and per-match identity for safe replay and debugging |

</details>

<details>
<summary><strong>Leaderboard &amp; social</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Live leaderboard | Supabase Realtime; rank arrows &#9650;&#9660;, point totals, prize column |
| Per-GW standings | Switch between overall and any individual gameweek |
| Points race chart | Multi-line area chart tracking cumulative points across gameweeks for all members |
| Gameweek recaps | Dynamic leader, climber, exact-score, consensus, prize, and xG storylines — private to the active league |
| Moment of the week | Deterministic headline and hero moment selected from the biggest climb, best match score, consensus miss, exact calls, prize movement, or xG upset |
| Private sharing | Copy a formatted recap, use the native share sheet, or generate a branded share card without publishing league data |
| Head-to-head | Full H2H stats, win/draw/loss record, and side-by-side points race chart |
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
| Sidebar preferences | Desktop users can collapse the rail and hide optional navigation items; choices persist to their profile while the active destination stays reachable |
| Push reminders | Optional browser notification subscription for prediction reminders; users can enable or remove it from their profile |

</details>

<details>
<summary><strong>Admin</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| Result entry | Score, first goal, first scorer, knockout winner, save, and rescore controls |
| Manual team sheets | Independently edit announced XI, bench, and position with an immediate team preview plus an on-demand full two-team pitch shared with the public Match Centre resolver |
| Formation controls | Keep FIFA as the default, optionally set a per-team formation override, or return to the provider shape at any time |
| Tactical changes | Record, inline-edit, or remove a team&apos;s formation switch at a minute; the latest verified shape drives the Current XI pitch and timeline |
| Lineup checks | Save-time checks flag non-11-player XIs, missing / duplicate goalkeepers, incomplete positions, and suspicious back-line / attacking-shape mismatches before an admin confirms the sheet |
| Manual grid override | Formation-first layout is the default; switch to manual grid only when a specific player needs a precise row or left/right lane |
| FIFA sync cockpit | Shows FIFA fixture coverage, freshness, started-match lineup / stat coverage, missing-data counts, and copyable per-match sync commands |
| Local operations guide | Copyable commands for the daily FIFA refresh, teams/media refresh, historical backfill, and read-only database audit — opening the cockpit itself does not call FIFA |
| Targeted repair | Missing started matches expose a copyable per-match command; manual sheets remain the correction path when FIFA has not published a field yet |
| Rank snapshots | Captured automatically after scoring for movement arrows |
| Bracket results | Entry panel for knockout round advancement, positioned separately from match scoring |
| Rescore all | Full recompute — use after any rule or data correction |

</details>

<details>
<summary><strong>Platform</strong></summary>

<br/>

| Feature | Detail |
| :--- | :--- |
| PWA | Installable on iOS, Android, and desktop; offline shell with guided install page at `/install` |
| Multi-league | Admin-created leagues with unique join codes; independent standings per group |
| Invite links | Shareable `?code=` links that pre-fill the join form |
| Command palette | Global keyboard-driven navigation across all pages |
| Privacy boundaries | Row Level Security scopes predictions to their owner or a shared league after reveal rules permit; admin-only writes protect results and live data |
| Operational telemetry | Best-effort anonymous client error telemetry, structured sync-run health, raw FIFA snapshots, and a read-only database audit for troubleshooting |
| FAQ | In-app answers to common questions at `/faq` |
| Mobile-first | Fully responsive; all pages optimised for PWA and phone use |

</details>

<details>
<summary><strong>Pages &amp; routes</strong></summary>

<br/>

| Route | Description |
| :--- | :--- |
| `/` | Landing page |
| `/login` | Email / password auth |
| `/dashboard` | Rank, stats, hero match, form strip, mini-leaderboard, prize outlook, activity feed |
| `/predictions` | All fixtures with filters; quick-predict bottom sheet |
| `/match/[id]` | Prediction form, Match Centre (pitch + facts), League Pulse, and prediction wall |
| `/groups` | Group finishing order predictor (all 12 groups) |
| `/bracket` | Full knockout bracket and tournament picks |
| `/leaderboard` | Live standings, per-GW view, points race chart, rank movement, CSV export |
| `/h2h` | Head-to-head compare — pick any two members |
| `/squads` | Teams centre — FIFA squads, form, fixtures, tournament leaders, stat leaders, and player cards |
| `/golden-boot` | Tournament top scorers and assists |
| `/recap?gw=<1–8>` | Private gameweek story, rank movement, match moments, and share actions |
| `/profile` | Stats, accuracy, rank chart, badges, bracket and group picks |
| `/rules` | Scoring rules reference |
| `/admin` | FIFA sync cockpit, result entry, formation controls, live lineup preview, tactical changes, substitutions, and scoring actions |
| `/join` | League join form; pre-filled via `?code=` invite links |
| `/install` | Guided PWA install instructions for iOS, Android, and desktop |
| `/faq` | In-app frequently asked questions |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

</details>

---

## Screenshots

### Landing & Dashboard

![Landing page](docs/screenshots/HomePage.png)

![Dashboard](docs/screenshots/Dashboard.png)

<details>
<summary><strong>Core gameplay</strong></summary>

<br/>

| Fixtures (dark) | Fixtures — group filter (light) |
|---|---|
| ![Fixtures](docs/screenshots/FixturePage.png) | ![Fixtures light mode](docs/screenshots/FixtureGroupsLight.png) |

| Predict a match | Scored match — league predictions revealed |
|---|---|
| ![Match prediction](docs/screenshots/MatchPredictions.png) | ![Completed match card](docs/screenshots/CompletedMatchCard.png) |

![Full match page — lineups, prediction form, league picks](docs/screenshots/CompletedMatchCardFull.png)

| Group predictor | Tournament bracket |
|---|---|
| ![Groups](docs/screenshots/GroupPage.png) | ![Bracket](docs/screenshots/Tournament.png) |

</details>

<details>
<summary><strong>Standings &amp; competition</strong></summary>

<br/>

![Leaderboard](docs/screenshots/LeaderBoard.png)

![Gameweek leaderboard](docs/screenshots/LeaderboardGW.png)

| Rank over time | Points race | Points vs. average | Points vs. leader |
|---|---|---|---|
| ![Rank over time](docs/screenshots/PointsRank.png) | ![Points race](docs/screenshots/PointsGraph.png) | ![Points vs average](docs/screenshots/PointsVSAvg.png) | ![Points vs leader](docs/screenshots/PointsVSLeader.png) |

| Matchday recap | Head-to-head comparison |
|---|---|
| ![Recap](docs/screenshots/RecapPage.png) | ![Comparison](docs/screenshots/Compare.png) |

</details>

<details>
<summary><strong>Squads &amp; teams</strong></summary>

<br/>

![Team browser](docs/screenshots/Teams.png)

![Squad roster](docs/screenshots/TeamSquad.png)

| Team stats | Golden Boot |
|---|---|
| ![Team stats](docs/screenshots/TeamStats.png) | ![Golden Boot](docs/screenshots/GoldenBoot.png) |

</details>

<details>
<summary><strong>Mobile (PWA)</strong></summary>

<br/>

| Dashboard | Fixtures | Navigation |
|---|---|---|
| ![Mobile dashboard](docs/screenshots/PhoneDashboard.png) | ![Mobile fixtures](docs/screenshots/PhoneFixture.png) | ![Mobile navigation](docs/screenshots/PhoneNavBar.png) |

![PWA install guide](docs/screenshots/PWAInstallGuide.png)

</details>

<details>
<summary><strong>Admin</strong></summary>

<br/>

| Admin — console | Admin — scoring |
|---|---|
| ![Admin console](docs/screenshots/AdminPage.png) | ![Admin scoring](docs/screenshots/AdminPageScoring.png) |

| Admin — result entry | Admin — scoring weights |
|---|---|
| ![Result entry](docs/screenshots/AdminPageEdit.png) | ![Scoring weights](docs/screenshots/AdminPageWeightage.png) |

</details>

<details>
<summary><strong>More screenshots</strong></summary>

<br/>

![Profile](docs/screenshots/Profile.png)

![Settings &amp; colour-blind mode](docs/screenshots/Settings.png)

| Calendar export | Customise sidebar |
|---|---|
| ![Calendar](docs/screenshots/Calendar.png) | ![Customise sidebar](docs/screenshots/CustomiseSideBar.png) |

| Rules &amp; FAQ | |
|---|---|
| ![FAQ](docs/screenshots/FAQ.png) | |

</details>

---

## Tech stack

| | Layer | Technology |
| :---: | :--- | :--- |
| ![Next.js](https://img.shields.io/badge/-Next.js-000?style=flat-square&logo=next.js) | **Framework** | Next.js 15 — App Router, server and client components, API route handlers |
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) | **Language** | TypeScript in strict mode throughout |
| ![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=000) ![Tailwind](https://img.shields.io/badge/-Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) | **UI** | React 18, Tailwind CSS with CSS-variable design tokens (light/dark via `.dark` on `<html>`), Framer Motion for pitch animations |
| ![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Database** | Supabase Postgres with Row Level Security — prediction visibility scoped by kickoff time and league membership |
| ![Supabase](https://img.shields.io/badge/-Auth-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Auth** | Supabase Auth — email/password; middleware guards app routes while the landing, legal pages, and login remain public |
| ![Supabase](https://img.shields.io/badge/-Realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Realtime** | Supabase Realtime — leaderboard and lineup updates push to all clients without a page reload |
| ![Supabase](https://img.shields.io/badge/-Storage-3ECF8E?style=flat-square&logo=supabase&logoColor=000) | **Storage** | Supabase Storage — avatars plus a cached `fifa-media` library for player images, flags, and team artwork |
| ![PWA](https://img.shields.io/badge/-PWA-5A0FC8?style=flat-square&logo=pwa) | **PWA** | `@ducanh2912/next-pwa` with Workbox service worker, offline shell, and app badge |
| ![Vercel](https://img.shields.io/badge/-Vercel-000?style=flat-square&logo=vercel) | **Hosting** | Vercel — auto-deploys on every push to `main` |
| ![FIFA](https://img.shields.io/badge/-FIFA-326295?style=flat-square) | **Tournament data** | FIFA GameDay schedule, team sheets, match stats, media, and official Golden Boot ordering; imported locally and cached in Supabase |
| ![Google Calendar](https://img.shields.io/badge/-iCalendar-4285F4?style=flat-square&logo=googlecalendar&logoColor=white) | **Calendar** | RFC 5545 iCalendar feeds — auto-updating, timezone-aware; works in Google, Apple, Outlook, Notion |
| | **Charts** | Custom SVG charts — BarChart, AreaChart, RankLine, RaceCompareChart — no third-party chart library |
| | **Accessibility** | Colour-blind-safe palette mode (Okabe–Ito), DB-backed and synced across devices |
| ![Vitest](https://img.shields.io/badge/-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white) | **Quality** | Vitest unit and contract coverage, ESLint, strict TypeScript, repository guards, Supabase migration checks, and a production-build release gate |
| | **Design** | Schibsted Grotesk typeface, token-driven colour scheme, custom SVG icons throughout |

---

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.png">
  <img src="docs/architecture-light.png" alt="MatchDay architecture diagram" width="100%">
</picture>

**Data flow**

1. Users open the Next.js PWA and read or write through Supabase Auth, Postgres RLS, Realtime, and Storage.
2. Prediction writes go directly through `supabase-js`; database policies and lock triggers protect kickoff visibility and write timing.
3. Admin scoring calls `/api/score-match`, which uses `lib/scoring.ts`, writes per-category points, snapshots ranks, and can trigger push notifications.
4. `lib/leaderboard.ts`, `lib/prizes.ts`, `lib/gameweek-recap.ts`, and `lib/lineup-layout.ts` provide the shared domain logic used by pages and API routes.
5. Local FIFA sync scripts import official fixtures, results, lineups, stats, events, Golden Boot rows, and media into the Supabase cache. Player-facing pages read cached Supabase data only.

<details>
<summary>Project structure</summary>

```
app/
  page.tsx                  Landing page
  login/                    Email/password auth
  dashboard/                Rank, stats, hero match, form strip, prize outlook, activity feed
  predictions/              Fixtures list with filters and quick-predict bottom sheet
  match/[id]/               Prediction form, Match Centre, League Pulse, match facts, prediction wall
  groups/                   Group order predictor (all 12 groups)
  bracket/                  Knockout bracket and tournament picks
  leaderboard/              Live standings, per-GW view, points race chart, rank arrows, CSV export
  h2h/                      Head-to-head compare with stats and points race chart
  squads/                   FIFA Teams centre — form, fixtures, stat leaders, and squad cards
  golden-boot/              Tournament top scorers and assists
  recap/                    Private gameweek recap and share actions
  profile/                  Stats, accuracy, rank chart tabs, badges, avatar crop
  offline/                  PWA offline fallback
  rules/                    Scoring rules reference
  admin/                    FIFA sync cockpit, results, lineup positioning, and scoring (is_admin guard)
  join/                     League join — pre-filled from invite ?code= links
  install/                  Guided PWA install instructions per platform
  faq/                      Frequently asked questions
  api/
    admin/fifa-health/      Admin-only FIFA freshness and coverage summary
    score-match/            Score one match and trigger Realtime
    score-groups/           Score group finishing predictions
    score-tournament/       Score bracket predictions
    snapshot-ranks/         Capture rank snapshot after scoring
    rescore-all/            Full recompute of all scored predictions
    golden-boot/            Serve top scorers / assists from cache
    recap/                  Active-league-scoped gameweek recap data
    teams/[code]/           Cached FIFA team list and per-team detail
    calendar/[token]/       Per-user iCalendar fixture feed
    sync-results/           Admin / scheduled final-score sync
    sync-events/            Admin / scheduled FIFA goal and card sync
    fetch-lineup/           Admin FIFA lineup refresh for one match
    push/                   Browser push subscribe / send handlers
    telemetry/              Anonymous best-effort client error telemetry

components/
  AppShell.tsx              Desktop sidebar preferences, mobile bottom nav, theme toggle
  ui.tsx                    Design system — Button, Card, StatCard, Pill, Avatar,
                            ScoreStepper, Countdown, Modal, CountUp, icons, Logo
  football.tsx              MatchCard, NextPredictCard, LeaderboardTable
  MatchLineups.tsx          Positional pitch with kit-coloured player tokens, substitutions, and events
  MatchFacts.tsx            Venue, officials, weather, xG, shots, possession, player stat grids
  PlayerCardPicker.tsx      Full-screen card modal for first-scorer selection
  PredictionModal.tsx       Quick-predict bottom sheet used from the Fixtures page
  LeagueRead.tsx            League Pulse — reveal-safe pick distributions and personal context
  MatchModal.tsx            Match detail modal with lineups and squad panel
  charts.tsx                BarChart, AreaChart, RankLine, RaceCompareChart — SVG only, no chart library
  FlagChip.tsx              Flag images for all 48 nations
  CalendarExport.tsx        iCalendar subscribe / download UI
  CommandPalette.tsx        Global keyboard-driven navigation
  RecapShareActions.tsx     Copy / native share recap card actions
  FormationPitch.tsx        Compact formation display using the shared lineup resolver
  TeamLink.tsx              Linked team name + flag chip
  ThemeToggle.tsx           Light / dark mode toggle
  RulesContent.tsx          Shared rules copy used by RulesModal and /rules
  RulesButton.tsx           Login-page rules trigger (client island)
  Telemetry.tsx             Minimal client error reporter

lib/
  active-league.tsx         League context and active-league switching
  scoring.ts                Single source of truth for all point values and scorePrediction
  prizes.ts                 Prize pool constants and computePrizeSnapshot
  leaderboard.ts            aggregateLeaderboard — shared aggregation and canonical sort
  lineup-layout.ts          Formation-first position resolver with tactical-row capacity matching and manual-grid fallback
  lineup-state.ts           Pure announced-XI, verified-substitution, and current-shape state resolver
  lineup-validation.ts      Conservative admin XI / goalkeeper / formation-shape checks
  events-sync.ts            FIFA goal / card normalisation and idempotent match-event writes
  fifa-client.ts            Shared FIFA GameDay token, schedule, and event helpers
  score-sync.ts             Shared prediction scoring flow used by admin and result sync scripts
  gameweek-recap.ts         Dynamic recap, match-story, headline, and share-text builder
  league-read.ts            Reveal-safe League Pulse distributions and personal context
  normalize.ts              Universal ASCII name folding (Turkish, Nordic, Polish, …)
  team-match.ts             External team/player name → internal codes and roster matching
  league.ts                 getMyLeagues, isMoneyLeague, multi-league helpers
  teams.ts                  48 WC2026 teams with code, name, flag, and playerKey
  snapshot.ts               Rank snapshot capture shared by scoring and scripts
  ics.ts                    RFC 5545 iCalendar builder for the fixture feed
  match-ui.ts               DBMatch / MyPred types + toUIMatch
  date-format.ts            fmtDateTime, fmtDateLong, timezone helpers
  url-state.ts              useUrlState — useSearchParams with Suspense safety
  prefs.ts                  User preference helpers (CVD mode, sidebar collapse)
  push.ts                   Browser push subscribe / unsubscribe helpers
  rate-limit.ts             In-memory rate limiter for API routes
  require-admin.ts          Server-side is_admin guard for admin routes
  supabase-browser.ts       Browser Supabase client (anon key)
  supabase-server.ts        Server Supabase client (service role, RSC)
  sync-runs.ts              Shared import-run lifecycle and structured health metadata
  telemetry.ts              Server-side safe telemetry payload handling

supabase/migrations/        SQL migrations applied in filename order via supabase db push
scripts/
  audit-data.ts             Read-only paginated Supabase data-quality audit
  sync-fifa-matches.ts      Cache FIFA fixtures, results, team sheets, substitutions, and match stats
  sync-fifa-teams.ts        Cache FIFA team, roster, player-stat, flag, and full-kit media data
  sync-golden-boot.ts       Cache FIFA's official tournament scorer / assist table into Supabase
  sync-events.ts            Cache FIFA goal and card events for scored matches
  cache-team-crests.ts      Cache FIFA team artwork in Supabase Storage (fifa-media)
  fetch-players.ts          Seed WC2026 squads from football-data.org (legacy one-time)
  fetch-wikidata-players.ts Enrich players with clubs, DOBs, and Wikidata photo URLs
  grant-admin.ts            Bootstrap the first organizer account (is_admin = true)
  setup-check.ts            Schema, connectivity, and launch-readiness check
  repo-check.ts             Migration, env, command-doc, retired-provider, and generated-asset guard
.github/workflows/
  live-data.yml             Manual GitHub Action for prediction reminders only
middleware.ts               Guards authenticated app routes; public landing, legal, and login pages bypass it
```

</details>

---

## Local development

### ![](https://img.shields.io/badge/01-16a34a?style=flat-square) Clone and install

```bash
git clone <your-repository-url>
cd wc26-predictor
npm ci
```

### ![](https://img.shields.io/badge/02-16a34a?style=flat-square) Environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>   # server-only — never commit
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional — GitHub Actions prediction-reminder trigger
CRON_SECRET=<random-string>                         # server-only — never commit

# Optional — browser push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>                     # server-only — never commit
VAPID_EMAIL=mailto:<you@example.com>

# Optional — legacy enrichment only
FOOTBALL_API_TOKEN=<football-data.org-key>          # only for legacy roster seeding

# Optional — public footer link
NEXT_PUBLIC_GITHUB_URL=https://github.com/<owner>/<repo>
```

### ![](https://img.shields.io/badge/03-16a34a?style=flat-square) Apply migrations

```bash
brew install supabase/tap/supabase   # macOS — see supabase.com/docs for other platforms
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### ![](https://img.shields.io/badge/04-16a34a?style=flat-square) Populate the official tournament cache

```bash
npm run setup:check
npm run data:fifa:bootstrap
npm run data:audit
```

`data:fifa:bootstrap` is the fresh-project import: it creates the FIFA team cache, imports every currently published match detail and event, and caches the official Golden Boot table. It is safe to rerun; unpublished future fixtures remain empty until FIFA publishes them.

### ![](https://img.shields.io/badge/05-16a34a?style=flat-square) Create the first organizer

Sign up once at `http://localhost:3000/login`. Grant the organizer role and verify:

```bash
ADMIN_EMAIL=you@example.com npm run bootstrap:admin
ADMIN_EMAIL=you@example.com npm run setup:check
```

### ![](https://img.shields.io/badge/06-16a34a?style=flat-square) Verify and run

```bash
npm run check   # lint, typecheck, unit tests, and production build
npm run dev     # development server → http://localhost:3000
```

> **PWA note:** the service worker is disabled in development. To test offline behaviour, run `npm run build && npm start` and open DevTools → Application → Service Workers → **Offline**.

---

## Data operations

Run FIFA imports from a **trusted local machine**. Player-facing pages read the Supabase cache, so normal page loads never wait for FIFA. Provider writes are idempotent: schedules and stats upsert, provider lineups are replaced per team while manual corrections remain intact, and goal/card events are keyed to avoid duplicates.

| When | Command | Purpose |
| :--- | :--- | :--- |
| Fresh project | `npm run data:fifa:bootstrap` | Full official FIFA bootstrap after migrations |
| Daily / matchday | `npm run data:fifa:daily` | Fixtures, nearby XI/stats, finished events, and Golden Boot |
| Roster update | `npm run data:fifa:team-stats` | Fast 48-team roster/stat update without media downloads |
| After FIFA squad/media changes | `npm run data:fifa-teams` | Full teams, media, flags, and crests refresh |
| Investigate | `npm run data:audit` | Read-only cache quality and sync-health report |

> The **Admin → FIFA sync cockpit** shows freshness and started-match coverage, then copies the exact targeted repair command for any match missing lineups or stats. Opening the cockpit itself does not call FIFA.

<details>
<summary><strong>Complete command reference — development, setup, data, and repair</strong></summary>

<br/>

### Development and release checks

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Create a production build. |
| `npm start` | Run the production build locally; run `npm run build` first. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run strict TypeScript checks without emitting files. |
| `npm test` | Run Vitest unit and contract tests. |
| `npm run repo:check` | Validate migration naming, documented env/commands, generated-file ignores, and retired-provider cleanup. |
| `npm run check` | Full release gate: repository checks, lint, types, tests, and production build. |

### Supabase and organizer setup

| Command | What it does |
| :--- | :--- |
| `npm run setup:check` | Verify required Supabase tables and environment connectivity. |
| `ADMIN_EMAIL=<email> npm run bootstrap:admin` | Grant organizer access after that person has signed up once. |
| `ADMIN_EMAIL=<email> npm run setup:check` | Also verify the selected organizer account has admin access. |

### Official FIFA imports

| Command | What it does |
| :--- | :--- |
| `npm run data:fifa:bootstrap` | One-time full bootstrap: teams/media, all currently published match detail/events, then Golden Boot. |
| `npm run data:fifa:daily` | Standard idempotent daily run: fixture metadata, nearby lineups/substitutions/stats, recently finished goals/cards, and Golden Boot. |
| `npm run data:fifa:refresh` | Readable alias for the complete daily routine; use before or after a matchday. |
| `npm run data:live` | Compatibility alias for `data:fifa:daily`. |
| `npm run data:fifa-teams` | Full 48-team squad, image, flag, crest, and team-stat cache refresh. |
| `npm run data:fifa:team-stats` | Faster team/squad/stat refresh that skips image downloads. |
| `npm run data:team-crests` | Re-cache FIFA team crest artwork in Supabase Storage. |
| `npm run data:fifa:fixtures` | Refresh all fixture IDs, dates, statuses, final scores, venues, and FIFA metadata. |
| `npm run data:fifa:lineups` | Refresh confirmed team sheets, formations, and substitutions for fixtures within roughly ±36 hours. |
| `npm run data:fifa:stats` | Refresh team and player stat packs for nearby started matches. |
| `npm run data:fifa:matches` | Refresh fixtures plus nearby lineups, substitutions, and stats together. |
| `npm run data:fifa:match` | Low-level all-mode match importer; normally use `data:fifa:matches`, or add `MATCH_ID` for a targeted repair. |
| `npm run data:fifa:events` | Refresh FIFA goal/card events for recently finished matches. |
| `npm run data:golden-boot` | Refresh FIFA&apos;s official scorer and assist tables only. |
| `npm run data:fifa:backfill` | Re-import all currently published lineups, substitutions, stat packs, and goal/card events. Safe but slower. |
| `npm run data:audit` | Read-only paginated Supabase audit; never writes and never calls FIFA. |

### Targeted repair and safe previews

| Command | What it does |
| :--- | :--- |
| `FIFA_SYNC_MODE=all MATCH_ID=<uuid> npm run data:fifa:match` | Repair one match completely. |
| `FIFA_SYNC_MODE=lineups MATCH_ID=<uuid> npm run data:fifa:match` | Repair one match&apos;s FIFA lineups, formation, and substitutions. |
| `FIFA_SYNC_MODE=stats MATCH_ID=<uuid> npm run data:fifa:match` | Repair one match&apos;s team and player stat packs. |
| `MATCH_ID=<uuid> npm run data:fifa:events` | Repair FIFA goal/card events for one completed match. |
| `ALL=1 npm run data:fifa:events` | Backfill goal/card events for every scored match. |
| `DRY_RUN=1 npm run data:fifa-teams` | Fetch and validate the FIFA team payload without database or Storage writes. |

### Optional and legacy enrichment

| Command | What it does |
| :--- | :--- |
| `npm run data:enrich` | Optional Wikidata enrichment for clubs and dates of birth; FIFA remains the squad/photo source. |
| `FOOTBALL_API_TOKEN=<token> npm run data:players` | Legacy football-data.org seeder. Not needed for a normal FIFA bootstrap. |
| `npm run data:lineups` | Compatibility alias for `data:fifa:lineups`. |
| `npm run data:results` | Compatibility alias for `data:fifa:fixtures`; final-score updates also trigger prediction scoring. |
| `npm run data:events` | Compatibility alias for `data:fifa:events`. |

</details>

---

## Deployment

| Step | Action |
| :---: | :--- |
| 1 | Create a hosted Supabase project, run `supabase db push`, and add `http://localhost:3000/auth/callback` + `https://<your-domain>/auth/callback` under **Authentication → URL Configuration**. |
| 2 | Sign up once, run `ADMIN_EMAIL=<email> npm run bootstrap:admin`, create a private league, and confirm a second account can join only via its invite code. |
| 3 | Import the repository in [Vercel](https://vercel.com). Add every value from `.env.example`; set `NEXT_PUBLIC_SITE_URL` to your production domain. |
| 4 | Optional — in GitHub **Settings → Secrets → Actions**, add `APP_URL=https://<your-domain>` and `CRON_SECRET` to run prediction reminders manually. FIFA data is refreshed locally with `npm run data:fifa:*`; this workflow does not sync match data. |
| 5 | Deploy, then run `ADMIN_EMAIL=<email> npm run setup:check` against the production URL. |

---

## Launch checklist

- `npm ci`, `supabase db push`, `npm run setup:check`, and `npm run check` all pass cleanly
- A normal account cannot change `is_admin`, read a league's join code directly, add itself to a league, or update match data
- The first organizer is created only via `npm run bootstrap:admin`
- Test a locked prediction, the Match Centre pitch, result scoring, calendar token, and the Open Graph preview
- Confirm live data by running `npm run data:fifa:daily` from your local machine after a match finishes
- Check **Admin → FIFA sync cockpit** after every refresh: freshness, coverage, import writes, and missing started matches should all be green
- During live matches, run `npm run data:fifa:daily`; it refreshes nearby team sheets, match stats, finished-match goals/cards, and Golden Boot in one pass

---

## Launch notes

MatchDay is a private-league product, not a public demo. It stores email-auth accounts, optional public avatars, browser push subscriptions, and revocable calendar-feed tokens. The in-app [Privacy](/privacy) and [Terms](/terms) pages describe those surfaces. This is an independent fan project and is not affiliated with FIFA.

---

<p align="center">
  <sub>Built for WC2026 &nbsp;·&nbsp; Private league &nbsp;·&nbsp; Not affiliated with FIFA</sub><br/>
  <sub>Built by <a href="https://github.com/aryan12singh">@aryan12singh</a> &nbsp;&amp;&nbsp; <a href="https://github.com/calebsooon">@calebsooon</a></sub>
</p>
