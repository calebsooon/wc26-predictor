'use client'

/* ============================================================
   MatchDay — Rules & scoring (single source of truth for copy)
   Reused by the /rules page and the RulesModal so they never drift.
   All point values come from lib/scoring.ts + lib/prizes.ts.
   ============================================================ */

import { SCORING_RULES, DEFAULT_WEIGHTS, type ScoringWeights } from '@/lib/scoring'
import { GW_PRIZES, OVERALL_PRIZES, formatPrize } from '@/lib/prizes'

const RULE_HINTS: Record<string, string> = {
  outcome: 'Pick the right result — home win, draw or away win.',
  exact: 'Nail the exact scoreline (on top of the outcome points).',
  goalDiff: 'Match the goal difference, even if the scoreline is off.',
  totalGoals: 'Match the combined number of goals in the match.',
  teamGoals: "At least one team's exact goal count matches, but the overall score was wrong.",
  btts: 'Correctly call whether both teams score (or both blank).',
  firstTeam: 'Pick which team scores the first goal of the match.',
  firstScorer: 'Name the player who scores the first goal (or call "no scorer").',
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-extrabold text-textp text-[15px]">{title}</h3>
        {sub && <p className="text-[13px] text-texts font-medium mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function PointBadge({ pts }: { pts: number }) {
  return (
    <div className="w-10 h-10 grid place-items-center rounded-md bg-surface border border-border text-primary font-extrabold tabular-nums shrink-0 text-base leading-none">
      +{pts}
    </div>
  )
}

export default function RulesContent({
  className = '', weights = DEFAULT_WEIGHTS, showPrizePool = true,
}: { className?: string; weights?: ScoringWeights; showPrizePool?: boolean }) {
  // Only show rules that are active (weight > 0) in this league
  const activeRules = SCORING_RULES.filter((r) => (weights[r.key as keyof ScoringWeights] ?? r.pts) > 0)
  const matchMax = activeRules.reduce((s, r) => s + (weights[r.key as keyof ScoringWeights] ?? r.pts), 0)
  const groupActive = weights.groupPosition > 0
  return (
    <div className={`space-y-7 ${className}`}>
      {activeRules.length > 0 && (
        <Section
          title="Match scoring"
          sub={`Every prediction earns across active categories — up to ${matchMax} points per match in this league.`}
        >
          <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
            {activeRules.map((s) => (
              <div key={s.key} className="flex items-center gap-3 p-3 bg-card">
                <PointBadge pts={weights[s.key as keyof ScoringWeights] ?? s.pts} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-textp leading-tight">{s.label}</p>
                  <p className="text-[12px] text-texts font-medium leading-snug">{RULE_HINTS[s.key]}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-texts font-medium">
            <span className="font-bold text-textp">Hedge tip:</span> you can set <em>total goals</em>,
            {' '}<em>goal difference</em> and <em>both teams to score</em> independently of your scoreline —
            so a smart hedge can still bank points even when the exact score is wrong.
          </p>
        </Section>
      )}

      <ScoringExample />

      {groupActive && (
        <Section
          title="Group stage"
          sub={`Predict each group's final finishing order. ${weights.groupPosition} points for every team you place in the correct position (4 per group).`}
        >
          <div className="flex items-center gap-2 text-[13px] text-texts font-medium">
            <PointBadge pts={weights.groupPosition} />
            <span>per correctly placed team · up to {weights.groupPosition * 4} points per group.</span>
          </div>
        </Section>
      )}

      <Section
        title="Bracket game"
        sub="Call the champion, finalists and more — pre-tournament and again after the group stage."
      >
        <p className="text-[13px] text-texts font-medium">Just for fun — the bracket game has <span className="font-bold text-textp">no effect on points, standings or prizes</span>.</p>
      </Section>

      <Section title="Tiebreakers">
        <ol className="text-[13px] text-texts font-medium space-y-1.5 list-decimal list-inside">
          <li>Total points.</li>
          <li>Predictions submitted.</li>
          <li>Correct outcomes.</li>
          <li>Exact scorelines.</li>
          <li>Correct goal differences.</li>
          <li>Correct total goals.</li>
          <li>Correct BTTS calls.</li>
          <li>Correct first-goal team calls.</li>
          <li>Correct first scorer calls.</li>
          <li>Shared/tied rank if still equal.</li>
        </ol>
      </Section>

      {showPrizePool && <Section
        title="Prize pool"
        sub="A zero-sum pot settled each gameweek, plus an overall pot for the season."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">Per gameweek</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold tabular-nums">
              {GW_PRIZES.map((p, i) => (
                <span key={i} className="text-textp">
                  {i + 1}<span className="text-texts text-[11px] align-top">{ordinalSuffix(i + 1)}</span>{' '}
                  <span className={p > 0 ? 'text-success' : p < 0 ? 'text-error' : 'text-texts'}>{formatPrize(p)}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-2">Overall (season)</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold tabular-nums">
              {OVERALL_PRIZES.map((p, i) => (
                <span key={i} className="text-textp">
                  {i + 1}<span className="text-texts text-[11px] align-top">{ordinalSuffix(i + 1)}</span>{' '}
                  <span className={p > 0 ? 'text-success' : p < 0 ? 'text-error' : 'text-texts'}>{formatPrize(p)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>}
    </div>
  )
}

function ScoringExample() {
  const rows = [
    { label: 'Correct outcome', pts: 3, earned: true, hint: 'Both picked Spain win' },
    { label: 'Exact scoreline', pts: 3, earned: false, hint: '2-1 ≠ 3-2' },
    { label: 'Goal difference', pts: 2, earned: true, hint: 'Both have a 1-goal diff' },
    { label: 'Total goals', pts: 1, earned: false, hint: '3 goals ≠ 5 goals' },
    { label: 'Both teams scored', pts: 1, earned: true, hint: 'Both picked yes correctly' },
  ]
  const total = rows.filter((r) => r.earned).reduce((s, r) => s + r.pts, 0)
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <p className="text-[11px] font-bold uppercase tracking-wider text-texts mb-1.5">Scoring example</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[13px]">
          <div><span className="text-texts">Actual result</span></div>
          <div className="font-bold text-textp">Spain 2–1 Morocco</div>
          <div><span className="text-texts">Your pick</span></div>
          <div className="font-bold text-textp">Spain 3–2 Morocco</div>
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-4 py-2.5">
            <div className={`w-8 h-8 grid place-items-center rounded-md shrink-0 text-[12px] font-extrabold tabular-nums ${r.earned ? 'bg-primary/10 text-primary' : 'bg-surface2 text-texts/40 line-through'}`}>
              +{r.pts}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-[13px] font-bold ${r.earned ? 'text-textp' : 'text-texts/60'}`}>{r.label}</span>
              <span className="text-[11px] text-texts ml-2">{r.hint}</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={r.earned ? 'text-primary shrink-0' : 'text-texts/30 shrink-0'}>
              {r.earned ? <path d="m5 12 5 5L20 7"/> : <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>}
            </svg>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 bg-primary/[0.06] border-t border-border flex items-center justify-between">
        <span className="text-[12px] font-bold text-texts">Total for this match</span>
        <span className="text-[18px] font-extrabold tabular-nums text-primary">+{total} pts</span>
      </div>
    </div>
  )
}

function ordinalSuffix(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
