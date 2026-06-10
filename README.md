# Bracket XI — World Cup 2026 Predictor

A full-stack prediction game for FIFA World Cup 2026. Players submit scoreline predictions before each match kicks off, earn points across multiple categories, and compete on a live leaderboard.

The UI uses the **"Dark Stadium Analytics"** design system (Archivo / Space Grotesk type, token-driven colours) and supports **light and dark mode** via the toggle in the header (defaults to your system preference).

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
cd 03_wc_predictor
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

This runs the migrations in order, including:
1. `20260609000000_initial_schema.sql` — creates all tables, RLS policies, and the `is_admin()` helper
2. `20260609000001_seed_matches.sql` — inserts 7 rounds and 111 matches (72 group stage + 39 knockout)
3. `20260610000000_design_upgrade.sql` — adds multi-category scoring inputs (first-goal team, first scorer, knockout advance pick), the per-category points breakdown columns, and the `group_predictions` table for the group-order predictor

> **Note:** the design upgrade migration must be applied before the new scoring, match-detail picks, group predictor, and profile analytics will work.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Granting admin access

After logging in for the first time (via magic link), your profile row is auto-created. To grant admin access:

1. Go to your [Supabase dashboard](https://supabase.com/dashboard) → your project → **Table Editor** → `profiles`
2. Find the row for your user (matched by `username` or `id`)
3. Set `is_admin` to `true`
4. Save

The **Admin** link will appear in the nav on your next page load. The admin page (`/admin`) lets you enter real match scores, which automatically locks the match and calculates points for all predictions.

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
3. Vercel will auto-detect Next.js — no build settings need changing (`vercel.json` handles it)

### 3. Add environment variables in Vercel

In the Vercel project dashboard → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key from Supabase |

Set these for **Production**, **Preview**, and **Development** environments.

### 4. Set the auth redirect URL in Supabase

Magic links redirect to your deployed URL after click. Add it in Supabase:

1. **Authentication → URL Configuration → Redirect URLs**
2. Add: `https://<your-vercel-domain>/auth/callback`

### 5. Deploy

Vercel deploys automatically on every push to `main`. You can also trigger a manual deploy from the dashboard.

---

## Project structure

```
app/
  login/          Magic link login page
  auth/callback/  Post-login redirect handler (creates profile row)
  predictions/    Main predictions page (grouped by round, real-time lock)
  leaderboard/    Live leaderboard with round filter and Realtime updates
  admin/          Admin panel to enter real scores and trigger scoring
  api/
    score-match/  POST endpoint that calculates and writes points_awarded

components/
  Navbar.tsx      Persistent nav bar (auth-aware, admin link, logout)

lib/
  supabase-browser.ts    createClient() for Client Components
  supabase-server.ts     createServerSupabaseClient() for Server Components / Route Handlers
  supabase-middleware.ts createMiddlewareSupabaseClient() for middleware

supabase/
  migrations/     SQL migration files (schema + seed)

middleware.ts     Route protection — unauthenticated → /login
```

---

## Scoring system

| Points | Condition |
|---|---|
| **+3** | Correct outcome (win / draw / loss) |
| **+5** | Exact scoreline |
| **+2** | Correct goal difference |
| **+1** | Correct total goals |
| **+1** | Both-teams-to-score called correctly |
| **+2** | Correct first-goal team |
| **+6** | Correct first scorer |
| **+4** | Correct knockout advance pick (knockout matches only) |

Categories stack — an exact scoreline also earns outcome, goal-difference, total-goals and BTTS points. Scores are calculated server-side by `POST /api/score-match` (using `lib/scoring.ts`) when an admin saves a result, and the per-category breakdown is stored on each prediction for the profile analytics.
