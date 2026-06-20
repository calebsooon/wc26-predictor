import Link from 'next/link'
import {
  Logo, Button, Pill, ChartIcon, ShieldIcon, TreeIcon, TrophyIcon, GridIcon,
} from '@/components/ui'
import RulesButton from '@/components/RulesButton'
import { DEFAULT_WEIGHTS, SCORING_RULES, type ScoringWeights } from '@/lib/scoring'

const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL

const FEATURES = [
  { Ico: ChartIcon, title: 'Exact-score predictions', desc: 'Call every scoreline. Points for outcome, exact result, goal difference, scorers and more.' },
  { Ico: ShieldIcon, title: 'One private league', desc: 'Just your crew — no randoms, no noise. Everyone predicts the same schedule.' },
  { Ico: TreeIcon, title: 'Group + bracket picks', desc: "Predict every group's final order and run the bracket all the way to the final." },
  { Ico: TrophyIcon, title: 'Live leaderboard', desc: 'Points settle the moment results land. Watch the table move in real time.' },
  { Ico: GridIcon, title: 'Analytics & badges', desc: 'Per-category accuracy, form trends and collectible badges to back up your takes.' },
]

function IconTile({ Ico, tone = 'primary' }: { Ico: (p: { size?: number }) => JSX.Element; tone?: 'primary' | 'gold' }) {
  return (
    <div className={`w-10 h-10 grid place-items-center rounded-md border border-border bg-surface shrink-0 ${tone === 'gold' ? 'text-gold' : 'text-primary'}`}>
      <Ico size={20} />
    </div>
  )
}

function PreviewStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-texts">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums mt-1 ${className ?? 'text-textp'}`}>{value}</div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-textp overflow-x-hidden">
      {/* nav */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-extrabold tracking-tight text-lg">MATCHDAY</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link href="/login"><Button variant="primary" size="sm">Enter league</Button></Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-texts mb-6 whitespace-nowrap">
            <span className="w-2 h-2 bg-primary shrink-0" /> World Cup 2026 · 48 Teams · 12 Groups
          </div>
          <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.92] text-textp">
            Predict every match.<br />
            <span className="text-primary">Your road to glory.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-texts max-w-xl mx-auto font-medium leading-relaxed">
            The private World Cup prediction league for your group chat. Call exact scorelines, climb a live leaderboard, and settle it once and for all.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login"><Button variant="primary" size="lg">Enter your league</Button></Link>
            <Link href="/dashboard"><Button variant="outline" size="lg">See the dashboard</Button></Link>
          </div>

          {/* dashboard preview */}
          <div className="mt-16 max-w-3xl mx-auto text-left">
            <div className="flex items-center gap-1.5 px-3 h-9 bg-surface border border-border border-b-0 rounded-t-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-border" />
              <span className="w-2.5 h-2.5 rounded-full bg-border" />
              <span className="w-2.5 h-2.5 rounded-full bg-border" />
              <span className="ml-2 text-[11px] font-semibold text-texts">matchday.app/dashboard</span>
            </div>
            <div className="bg-card border border-border rounded-b-lg p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <Pill tone="gold">Rank 3 of 12</Pill>
                <Pill tone="green">+18 pts today</Pill>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <PreviewStat label="My Rank" value="#3" className="text-gold" />
                <PreviewStat label="Points" value="233" />
                <PreviewStat label="Exact" value="7" className="text-primary" />
                <PreviewStat label="Accuracy" value="58%" className="text-blue" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <div className="mb-10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary mb-2">The platform</div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Everything the group chat needs</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border rounded-xl overflow-hidden">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-card p-6">
                <IconTile Ico={f.Ico} />
                <h3 className="font-extrabold text-textp mt-4 mb-1.5 text-[15px]">{f.title}</h3>
                <p className="text-sm text-texts font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
            <div className="bg-card p-6 flex flex-col justify-between">
              <div>
                <IconTile Ico={TrophyIcon} tone="gold" />
                <h3 className="font-extrabold text-textp mt-4 mb-1.5 text-[15px]">Win the season</h3>
                <p className="text-sm text-texts font-medium leading-relaxed">One champion across the whole tournament. Eternal group-chat glory.</p>
              </div>
              <Link href="/login" className="mt-5 self-start"><Button variant="gold" size="sm">Start predicting</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* scoring strip */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary mb-2">Scoring</div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">How points are earned</h2>
              <p className="text-texts font-medium mt-1.5">Every prediction earns across multiple categories — stack them up.</p>
            </div>
            <RulesButton label="Read the full rules" variant="outline" size="md" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-xl overflow-hidden">
            {SCORING_RULES.filter((s) => (DEFAULT_WEIGHTS[s.key as keyof ScoringWeights] ?? s.pts) > 0).map((s) => (
              <div key={s.key} className="flex items-center gap-3 p-4 bg-card">
                <div className="w-11 h-11 grid place-items-center rounded-md bg-surface border border-border text-primary font-extrabold tabular-nums shrink-0 text-lg leading-none">+{s.pts}</div>
                <span className="text-[13px] font-semibold text-textp leading-tight">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-7 flex items-center justify-between text-sm text-texts">
          <div className="flex items-center gap-2"><Logo size={20} /><span className="font-bold text-textp">MATCHDAY</span></div>
          <div className="flex items-center gap-3 font-medium">
            {githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer" className="hover:text-textp">GitHub</a>}
            <Link href="/privacy" className="hover:text-textp">Privacy</Link>
            <Link href="/terms" className="hover:text-textp">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
