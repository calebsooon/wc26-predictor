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
  const matchMax = SCORING_RULES.reduce((s, r) => s + (weights[r.key as keyof ScoringWeights] ?? r.pts), 0)
  return (
    <div className={`space-y-7 ${className}`}>
      <Section
        title="Match scoring"
        sub={`Every prediction earns across multiple categories — up to ${matchMax} points per match in this league.`}
      >
        <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
          {SCORING_RULES.map((s) => (
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

      <Section
        title="Group stage"
        sub={`Predict each group's final finishing order. ${weights.groupPosition} points for every team you place in the correct position (4 per group).`}
      >
        <div className="flex items-center gap-2 text-[13px] text-texts font-medium">
          <PointBadge pts={weights.groupPosition} />
          <span>per correctly placed team · up to {weights.groupPosition * 4} points per group.</span>
        </div>
      </Section>

      <Section
        title="Bracket game"
        sub="Call the champion, finalists and more — pre-tournament and again after the group stage."
      >
        <p className="text-[13px] text-texts font-medium">🎈 Just for fun — the bracket game has <span className="font-bold text-textp">no effect on points, standings or prizes</span>.</p>
      </Section>

      <Section title="Tiebreakers">
        <ol className="text-[13px] text-texts font-medium space-y-1.5 list-decimal list-inside">
          <li>Most total points.</li>
          <li>Most correct outcomes.</li>
          <li>Alphabetical by name (final fallback).</li>
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

function ordinalSuffix(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}
