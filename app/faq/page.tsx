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

export default function FaqPage() {
  const { league } = useActiveLeagueContext()
  const weights = resolveWeights(league?.scoring)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader eyebrow="Help" title="FAQ" sub="How MatchDay works — scoring, predictions, data and more." />

      <div className="space-y-2.5">
        <FaqItem q="How does the league work?" defaultOpen>
          <p>
            Predict every match scoreline, the finishing order of all 12 groups, and the full knockout bracket.
            As real results come in, points settle automatically and the live leaderboard — plus the prize pool —
            updates instantly. Leagues are private and invite-only.
          </p>
          <p>Predictions for a match lock at kickoff. Submit early — late picks score nothing.</p>
        </FaqItem>

        <FaqItem q="How is scoring calculated?">
          <p className="!mt-0">
            Every prediction earns across several categories. This reflects your current league&rsquo;s setup —
            see <Link href="/rules" className="text-primary font-semibold">Rules &amp; scoring</Link> for the full breakdown.
          </p>
          <div className="pt-1">
            <RulesContent weights={weights} showPrizePool={isMoneyLeague(league)} />
          </div>
        </FaqItem>

        <FaqItem q="When can I see other members' predictions?">
          <p>
            By default everyone&rsquo;s picks stay hidden until a match <span className="text-textp font-semibold">kicks off</span> —
            then the full prediction wall and consensus for that match are revealed. If your league admin turns on
            <span className="text-textp font-semibold"> &ldquo;reveal predictions&rdquo;</span>, league mates can also see each other&rsquo;s picks before kickoff.
          </p>
        </FaqItem>

        <FaqItem q="Can I add the fixtures to my calendar?">
          <p>
            Yes — use <span className="text-textp font-semibold">Add to calendar</span> on Fixtures or a match page.
            Subscribe for an always-up-to-date feed (knockout teams fill in automatically) or download a one-off file.
            Times show in your own time zone and you can set a reminder. Works with Google, Apple, Outlook and Notion calendars.
          </p>
        </FaqItem>

        <FaqItem q="Is there a colour-blind mode?">
          <p>
            Yes. In <Link href="/profile" className="text-primary font-semibold">Profile</Link> you can switch on a
            colour-blind-safe palette and choose whether it applies just to the leaderboard graph or across the whole app.
            The preference follows you across devices.
          </p>
        </FaqItem>

        <FaqItem q="Where do lineups, results and player info come from?">
          <p>
            Live fixtures, confirmed lineups, scores and injuries are pulled from a football data provider and refreshed
            automatically around match time.
          </p>
          <p>
            Player headshots, clubs and ages are sourced from public databases. These are community-maintained, so a few
            players may show an out-of-date club, a missing photo, or occasionally the wrong detail. We refresh them
            periodically and they don&rsquo;t affect scoring in any way.
          </p>
        </FaqItem>

        <FaqItem q="How do I install MatchDay on my phone?">
          <p>
            MatchDay is a PWA — see <Link href="/install" className="text-primary font-semibold">Get the app</Link> for one-tap
            install instructions on iOS, Android and desktop. Once installed it works like a native app, including offline.
          </p>
        </FaqItem>

        <FaqItem q="Is MatchDay affiliated with FIFA?">
          <p>No. MatchDay is an independent, private prediction game and is not affiliated with, endorsed by, or connected to FIFA or the FIFA World Cup.</p>
        </FaqItem>
      </div>
    </div>
  )
}
