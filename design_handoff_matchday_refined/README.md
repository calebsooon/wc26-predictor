# Handoff: MatchDay — "Refined" UI redesign

## Overview
MatchDay is a World Cup / football prediction-league app (web + PWA). This handoff
covers a full visual redesign — the **"Refined"** direction — that aligns the entire
product with the new app icon: clean, professional, Apple-grade, but with purposeful
colour. It replaces the older "Dark Stadium Analytics" look (emoji flags, dense
bordered cards, multi-accent neon).

Covered surfaces:
- **Mobile / PWA** — 5 screens: Dashboard, Match (predict), Leaderboard, Bracket, Profile. Light + dark.
- **Desktop web app** — dashboard with sidebar nav, hero, match cards, points trend, leaderboard rail.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that
show the intended look and behaviour. They are **not** production code to copy
verbatim. The task is to **recreate these designs in the MatchDay codebase's existing
environment** (Next.js + React + Tailwind + Supabase, per the repo) using its
established patterns — `components/ui.tsx`, `app/globals.css` tokens, etc. Map the
values below onto the codebase's design tokens rather than pasting inline styles.

The `.dc.html` files are self-contained interactive prototypes. Open them in a browser
(they need the included `support.js` sibling) to see hover states, the score stepper,
leaderboard tab switching, and the light/dark toggle.

## Fidelity
**High-fidelity (hifi).** Final colours, typography, spacing, radii, and interactions
are specified below to exact values. Recreate pixel-faithfully using the codebase's
component library; substitute Tailwind tokens / CSS variables for the raw values.

---

## Design Tokens

### Typography
- **Display & numerals:** `Schibsted Grotesk` (weights 500/600/700/800). Used for
  headings, team names, all stats/scores/ranks. Numerals use tabular figures:
  `font-feature-settings: 'tnum' 1, 'lnum' 1; letter-spacing: -0.015em`.
- **Body / UI:** `Hanken Grotesk` (weights 400/500/600/700). Labels, descriptions, nav.
- **Eyebrow label** ("YOUR SEASON", "GROUP C", etc.): 10.5–11px, `text-transform:uppercase`,
  `letter-spacing: 0.13em`, `font-weight: 600`.
- Type scale (px): hero number 42–54 / section title 16–24 / stat 19–30 / body 13–14 /
  caption 11–12.5 / eyebrow 10.5–11.

### Colour — Dark (primary)
| Token            | Value                         | Use |
|------------------|-------------------------------|-----|
| bg               | `#0a0b10` (page) / `#0c0e13`  | app background |
| surface          | `#15181f`                     | cards |
| surface-2        | `#1d212a`                     | inset controls, steppers |
| surface-3        | `#262b35`                     | avatars, track fills |
| border           | `rgba(255,255,255,0.07)`      | card hairline |
| hair             | `rgba(255,255,255,0.06)`      | dividers |
| text             | `#f3f5f9`                     | primary text |
| muted            | `#9aa3b2`                     | secondary text |
| faint            | `#69707e`                     | tertiary / eyebrow |
| **accent**       | `#1fc16b` (emerald)           | primary buttons, active, positive |
| accent-ink       | `#042614`                     | text on accent fills |
| accent-soft      | `rgba(31,193,107,0.14)`       | "you" row, soft chips |
| hero gradient    | `linear-gradient(145deg,#1aa85e,#0f7a48)` | feature card / hero |
| hero-ink         | `#eafff3`                     | text on hero gradient |
| sky              | `#5b9dff`                     | "your pick" / informational |
| sky-soft         | `rgba(91,157,255,0.15)`       | group chips |
| amber            | `#ffb24d`                     | countdown / caution |
| coral            | `#ff6b6b`                     | negative prize / danger |
| gold             | `#ffce5a`                     | rank #1 |
| shadow           | `0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 26px -12px rgba(0,0,0,0.6)` | card elevation |

### Colour — Light
| Token       | Value                       |
|-------------|-----------------------------|
| bg          | `#eef1f6` / surfaces `#ffffff` |
| surface-2   | `#f4f6fa`                   |
| surface-3   | `#e9edf3`                   |
| border      | `rgba(16,22,40,0.07)`       |
| text        | `#101521`                   |
| muted       | `#5c6473`                   |
| faint       | `#8a929f`                   |
| **accent**  | `#0e9e55` (deeper emerald)  |
| accent-ink  | `#ffffff`                   |
| sky         | `#2f6fe0`                   |
| amber       | `#c98318`                   |
| coral       | `#dd4b4b`                   |
| gold        | `#c08a1a`                   |
| shadow      | `0 1px 2px rgba(16,22,40,0.05), 0 10px 26px -14px rgba(16,22,40,0.14)` |

### Spacing & shape
- Spacing rhythm: multiples of 4 (gaps 8/9/11/14/16/20/24; screen padding 18px mobile, 26–32px desktop).
- Radii: cards 16–20px · feature/hero 20px · inset controls & chips 11–14px · pills 999px · avatars 10–11px (squircle) or 50% (people).
- Cards are borderless-feeling: 1px low-contrast border + soft shadow + (dark) a 1px inset top highlight. No heavy strokes.

---

## Screens / Views

### 1. Dashboard (mobile) / Home (desktop) — the showcase
- **Purpose:** at-a-glance season standing + the next fixtures to predict + league snapshot.
- **Layout (mobile):** vertical scroll, 18px side padding, fixed bottom tab bar (74px, blurred).
  1. Greeting row: eyebrow date + "Good evening" (Schibsted 23/700) + round avatar.
  2. **Feature card hero** — green gradient (`145deg,#1aa85e→#0f7a48`), two decorative
     translucent circles, eyebrow "YOUR SEASON", big points number (42px/800, hero-ink),
     "▲ 14" delta, rank line, and a 5-segment season-progress bar (filled = hero-ink,
     empty = `rgba(255,255,255,0.28)`).
  3. Stat trio (3 cards): accuracy (text), exact (sky), pool (accent/positive).
  4. "Next to predict" section header + a match card (group chip, amber countdown,
     two flag chips + names, your-pick line, full-width accent "Review prediction" button).
  5. Mini league (top 3 rows; the "you" row tinted accent-soft).
- **Layout (desktop):** 248px sidebar + main. Main = top bar (greeting, search, "+ New
  prediction") then a content grid `1fr 360px`: left column has hero+stat band
  (`1.35fr 1fr`), a 2-up "Next to predict" match-card grid, and a "Points trend" bar
  chart; right rail is the full leaderboard with a "View full standings" button.

### 2. Match (predict)
- **Purpose:** enter a scoreline + bonus predictions for one fixture.
- **Components:** back button + group eyebrow; centered matchup (two 56×38 flag chips +
  team names, "vs"); amber lock countdown; **scoreline card** with two steppers
  (+ / number 38px/800 / −) and a colon; **bonus card** — "First goal" two-button
  toggle (selected = accent), "Both teams score" pill switch (on = accent), "First
  scorer" select chip; full-width accent "Submit prediction"; helper text.
- **Interaction:** steppers increment/decrement each score, clamped 0–20.

### 3. Leaderboard
- **Purpose:** ranked standings with prize/penalty pool.
- **Components:** title + "7 players · settled to GW3"; **segmented control**
  (Overall / This gameweek) — active segment = surface card + shadow; ranked rows:
  rank number (gold for #1, accent for you, else muted), squircle avatar, name
  (+ "YOU" pill), meta (accuracy · exact), points (Schibsted 700), prize delta
  (positive=accent, negative=coral, neutral=muted). The "you" row tinted accent-soft.
- **Interaction:** tab switch swaps the dataset (overall vs gameweek).

### 4. Bracket
- **Purpose:** knockout-stage picks and their point values.
- **Components:** title + "up to 47 pts"; grouped sections (Final / Semi-finalists /
  Quarter-finalists) each with eyebrow + point value; rows/tiles with flag chip +
  team + (final) a trophy icon in gold and the point value. 2-col grid for QF/SF tiles.

### 5. Profile
- **Purpose:** personal stats and history.
- **Components:** avatar (gradient squircle) + name + meta + edit button; 2×2 stat grid
  (Points, Rank, Accuracy=sky, Net pool=accent); "Points per gameweek" bar chart
  (accent bars, varying opacity, tallest = current); "Recent" list (flag + score +
  flag + your pick + points-earned chip; positive in accent-soft, neutral in surface-2).

### Global: bottom tab bar (mobile)
5 items (Home, Fixtures, Bracket, Ranks, Profile). Active = accent icon + label;
inactive = faint. Bar is `rgba(11,12,16,0.8)` + `backdrop-filter: blur(16px) saturate(140%)`,
1px top border, plus the iOS home indicator.

### Global: sidebar (desktop)
248px, `#0b0d12`, right border. Logo lockup (gradient squircle mark + "MatchDay" /
"Premier League"); nav items (active = `#15181f` bg, accent icon); a "This gameweek"
mini-card and a user chip pinned to the bottom.

---

## Interactions & Behavior
- **Score steppers:** + / − adjust each team's score, clamped to 0–20.
- **Leaderboard tabs:** Overall ⇄ This gameweek swap the row dataset; active segment
  gets the raised surface + shadow treatment.
- **Hover (desktop):** nav items and leaderboard rows lighten on hover; primary CTA
  lifts `translateY(-1px)` with a stronger accent shadow (150ms).
- **Theme:** light/dark is a full token swap (see tables). Mobile prototype has a
  toggle in the comparison shell; in-app it should follow the user/system preference.
- **Flags:** rendered as simple CSS gradients (no emoji, no image assets) — e.g. France
  `linear-gradient(90deg,#0055A4 0 33.33%,#F4F5F7 33.33% 66.66%,#EF4135 66.66%)`. In
  production, swap for the codebase's flag set (SVG sprite or a flag-icon library)
  keyed by team code.
- **Removed from old design:** confetti on scoring, emoji flags, neon multi-accent.

## State Management
- `homeScore`, `awayScore` (int, 0–20) — Match predict steppers.
- `leaderboardTab` ('overall' | 'gameweek') — Leaderboard segmented control.
- `theme` ('light' | 'dark') — token set.
- Active nav/route — drives sidebar + bottom-bar highlight.
- Data fetching (already in the app): fixtures, predictions, standings, profile stats
  from Supabase — wire the same sources into these layouts.

## Assets
- **App icon** — "pitch sphere" mark (white ball + black markings on near-black).
  PNG (512 & 192) + SVG source are in `design_files/icon/`. Use the SVG for any size.
- **Flags** — currently CSS gradients in the prototypes; replace with the codebase's
  flag system. No raster image assets are required by these designs.
- **Icons** — inline stroke SVGs (Lucide-style, 2.1 stroke). Use the codebase's icon
  set (e.g. lucide-react) to match.
- **Fonts** — Schibsted Grotesk + Hanken Grotesk (Google Fonts). Add via the codebase's
  font pipeline (next/font).

## Files (in this bundle, under `design_files/`)
- `MatchDay Final.dc.html` — combined showcase: desktop web app + phone PWA in one view.
- `MatchDay Refined.dc.html` — mobile comparison shell (all 5 screens, light/dark toggle).
- `RefinedScreen.dc.html` — the reusable mobile screen component (all 5 screens + tokens + logic).
- `MatchDay Web.dc.html` — the desktop web dashboard.
- `support.js` — runtime required to open the `.dc.html` prototypes in a browser.
- `icon/` — app icon exports (PNG 512/192 + SVG) and a readme.

> To preview: open any `.dc.html` in a browser with `support.js` in the same folder.
> The token source of truth is the `[data-rf]` / `[data-rf="light"]` blocks at the top
> of `RefinedScreen.dc.html`.
