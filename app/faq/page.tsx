'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader, ChevDown } from '@/components/ui'
import RulesContent from '@/components/RulesContent'
import { useActiveLeagueContext } from '@/lib/active-league'
import { isMoneyLeague } from '@/lib/league'
import { resolveWeights } from '@/lib/scoring'

function FaqItem({ q, children, defaultOpen = false }: { q: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group bg-card border border-border rounded-[16px] shadow-card overflow-hidden">
      <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <span className="font-bold text-textp text-[14.5px]">{q}</span>
        <ChevDown size={18} className="text-texts shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5 -mt-0.5 text-[13.5px] text-texts leading-relaxed space-y-3">{children}</div>
    </details>
  )
}

function FaqSection({ title }: { title: string }) {
  return <p className="pt-2 pb-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-faint px-1">{title}</p>
}

export default function FaqPage() {
  const { league } = useActiveLeagueContext()
  const weights = resolveWeights(league?.scoring)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader eyebrow="Help" title="FAQ" sub="Everything you need to know — scoring, predictions, data and more." />

      <div className="space-y-2.5">

        {/* ── The basics ──────────────────────────────────── */}
        <FaqSection title="The basics" />

        <FaqItem q="How does MatchDay work?" defaultOpen>
          <p>
            Predict every match scoreline, the finishing order of all 12 groups, and the full knockout bracket from the Round of 32 through to the final. As real results come in, points settle automatically and the live leaderboard — plus the prize pool — updates instantly.
          </p>
          <p>Leagues are private and invite-only. You can be a member of more than one league, and each can have its own scoring weights and prize structure.</p>
          <p>Predictions for any match <span className="text-textp font-semibold">lock at kickoff</span>. Submit early — picks entered after a match starts score nothing.</p>
        </FaqItem>

        <FaqItem q="What are the three types of prediction?">
          <ul className="list-disc pl-4 space-y-2">
            <li><span className="text-textp font-semibold">Match predictions</span> — the scoreline for every group-stage and knockout game, plus optional picks for first scorer, first-goal team, BTTS, and total goals.</li>
            <li><span className="text-textp font-semibold">Group-order predictions</span> — the final standing of all four teams in each of the 12 groups.</li>
            <li><span className="text-textp font-semibold">Bracket predictions</span> — who advances through each knockout phase, all the way to champion and runner-up. You lock in the bracket before the tournament starts; the further your picks survive, the more points you earn.</li>
          </ul>
          <p>All three categories contribute to your overall total, each weighted by your league&rsquo;s settings.</p>
        </FaqItem>

        <FaqItem q="What are the gameweeks?">
          <p>
            The tournament is split into 8 gameweeks — 3 covering the group stage and 5 for the knockout rounds (Round of 32, Round of 16, Quarter-finals, Semi-finals, Final). Per-gameweek standings and prizes are match-only; your overall total folds in group and bracket points too.
          </p>
        </FaqItem>

        {/* ── Scoring ──────────────────────────────────────── */}
        <FaqSection title="Scoring" />

        <FaqItem q="How is scoring calculated?">
          <p className="!mt-0">
            Every prediction earns across several categories. This reflects your current league&rsquo;s setup —
            see <Link href="/rules" className="text-primary font-semibold">Rules &amp; scoring</Link> for the full breakdown.
          </p>
          <div className="pt-1">
            <RulesContent weights={weights} showPrizePool={isMoneyLeague(league)} />
          </div>
        </FaqItem>

        <FaqItem q="What is the first scorer pick?">
          <p>
            On each match prediction you can optionally pick which player scores the <span className="text-textp font-semibold">first goal</span> of the game. You can also pick &ldquo;no scorer&rdquo; if you think it finishes 0–0.
          </p>
          <p>
            If the match has a goal and your player scores it first, you earn the first scorer bonus. Own goals do not count — if the first goal of the game is an own goal, the pick passes to the next scorer. A &ldquo;no scorer&rdquo; pick pays out only on an actual 0–0.
          </p>
        </FaqItem>

        <FaqItem q="How are tiebreakers resolved?">
          <p>When two or more players are level on points, the leaderboard breaks ties in this order:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Total points</li>
            <li>Correct outcomes (win / draw / loss)</li>
            <li>Exact scorelines</li>
            <li>Goal difference calls</li>
            <li>Total goals calls</li>
            <li>BTTS calls</li>
            <li>First-goal team calls</li>
            <li>First scorer calls</li>
            <li>Number of predictions submitted (more = lower in tie)</li>
          </ol>
        </FaqItem>

        <FaqItem q="How do group-order and bracket predictions score?">
          <p>
            <span className="text-textp font-semibold">Groups</span> — points are awarded for each team placed in the correct position. Exact group order earns a bonus. Your admin can adjust the per-position point values.
          </p>
          <p>
            <span className="text-textp font-semibold">Bracket</span> — you pick every knockout matchup in advance. Teams you correctly advance through each round score progressively more, with the biggest points for semi-finalists, finalist, and champion. The bracket is locked before the Round of 32 begins.
          </p>
        </FaqItem>

        {/* ── Predictions & privacy ─────────────────────────── */}
        <FaqSection title="Predictions &amp; privacy" />

        <FaqItem q="When can I see other members' predictions?">
          <p>
            By default everyone&rsquo;s picks stay hidden until a match <span className="text-textp font-semibold">kicks off</span> —
            then the full prediction wall and consensus for that match are revealed. If your league admin turns on
            <span className="text-textp font-semibold"> &ldquo;reveal predictions&rdquo;</span>, league mates can also see each other&rsquo;s picks before kickoff.
          </p>
        </FaqItem>

        <FaqItem q="Can I change a prediction after submitting?">
          <p>
            Yes, as many times as you like — right up until kickoff. Once the match starts your most recent submission is locked in and cannot be changed.
          </p>
        </FaqItem>

        <FaqItem q="What if I miss predicting a match?">
          <p>
            Missed predictions score zero for that match. There is no penalty for not submitting — you simply don&rsquo;t earn points for that game. It is worth predicting every match, even a guess, since any correct call earns points.
          </p>
        </FaqItem>

        {/* ── Leagues ──────────────────────────────────────── */}
        <FaqSection title="Leagues" />

        <FaqItem q="How do leagues and invite codes work?">
          <p>
            Your admin creates a league and shares an invite code (or link). Paste the code on the{' '}
            <Link href="/join" className="text-primary font-semibold">Join league</Link> page to become a member.
            Members can switch between their leagues in the sidebar at any time — your active league determines which leaderboard, prizes and scoring weights you see.
          </p>
        </FaqItem>

        <FaqItem q="Can a league have a money prize pool?">
          <p>
            Yes. When your admin creates a money league, the prize pool page shows real currency amounts for each finishing position. Weekly and overall prizes are tracked separately. All payments are handled outside MatchDay between league members — the app tracks standings and calculates payouts, but does not process money directly.
          </p>
        </FaqItem>

        {/* ── Features ──────────────────────────────────────── */}
        <FaqSection title="Features" />

        <FaqItem q="What is the Recap page?">
          <p>
            After each gameweek settles, the <Link href="/recap" className="text-primary font-semibold">Recap</Link> page tells the story of the week — the league headline, a podium, per-match stats including xG and possession, category accuracy rates for the whole league, and your personal breakdown vs the league average. You can share it as a text summary.
          </p>
        </FaqItem>

        <FaqItem q="What is the Compare (H2H) page?">
          <p>
            <Link href="/h2h" className="text-primary font-semibold">Compare</Link> lets you pick any two league members and see a head-to-head breakdown across every category, gameweek and match. Useful for tracking rivalries or spotting where you&rsquo;re leaking points.
          </p>
        </FaqItem>

        <FaqItem q="What is the Golden Boot tracker?">
          <p>
            <Link href="/golden-boot" className="text-primary font-semibold">Golden Boot</Link> tracks the top scorers at the tournament in real time. Goals are sourced from the same live data feed that powers match pages — so stats update as results come in.
          </p>
        </FaqItem>

        <FaqItem q="Can I add the fixtures to my calendar?">
          <p>
            Yes — use <span className="text-textp font-semibold">Add to calendar</span> on Fixtures or a match page.
            Subscribe for an always-up-to-date feed (knockout teams fill in automatically as the tournament progresses) or download a one-off file.
            Times show in your own time zone. Works with Google, Apple, Outlook and Notion.
          </p>
        </FaqItem>

        <FaqItem q="Is there a colour-blind mode?">
          <p>
            Yes. In <Link href="/profile" className="text-primary font-semibold">Profile</Link> you can switch on a
            colour-blind-safe palette and choose whether it applies just to the leaderboard graph or across the whole app.
            The preference syncs across devices.
          </p>
        </FaqItem>

        <FaqItem q="How do I install MatchDay on my phone?">
          <p>
            MatchDay is a PWA — see <Link href="/install" className="text-primary font-semibold">Get the app</Link> for one-tap
            install instructions on iOS, Android and desktop. Once installed it works like a native app and you can enable push notifications.
          </p>
        </FaqItem>

        {/* ── Data & technical ─────────────────────────────── */}
        <FaqSection title="Data &amp; technical" />

        <FaqItem q="Where do lineups, results and player info come from?">
          <p>
            Live fixtures, confirmed lineups, scores and injuries are pulled from official tournament data and refreshed automatically around match time. Lineup availability typically improves one hour before kickoff.
          </p>
          <p>
            Player headshots, clubs and ages are sourced from public databases. These are community-maintained, so a few players may show an out-of-date club, a missing photo, or occasionally the wrong detail. They don&rsquo;t affect scoring in any way.
          </p>
        </FaqItem>

        <FaqItem q="What happens if a match is abandoned or postponed?">
          <p>
            If a match is officially abandoned or postponed, your admin will handle it manually — either voiding the prediction (no points awarded) or rescoring once the match concludes. The admin panel allows manual result entry for exactly this scenario.
          </p>
        </FaqItem>

        <FaqItem q="Is MatchDay affiliated with FIFA?">
          <p>No. MatchDay is an independent, private prediction game and is not affiliated with, endorsed by, or connected to FIFA or the FIFA World Cup.</p>
        </FaqItem>

      </div>
    </div>
  )
}
