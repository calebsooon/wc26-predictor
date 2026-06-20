import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg px-5 py-12 text-textp">
      <article className="mx-auto max-w-2xl space-y-6">
        <Link href="/" className="text-sm font-bold text-primary">← MatchDay</Link>
        <div><p className="eyebrow">Legal</p><h1 className="mt-2 text-3xl font-black">Terms</h1></div>
        <p className="text-sm leading-7 text-texts">MatchDay is a private prediction game. Scores, live data, fixtures, player information, and notifications may be delayed or incomplete. League organizers remain responsible for their rules, prizes, and participant conduct.</p>
        <p className="text-sm leading-7 text-texts">This project is not affiliated with FIFA, participating teams, or any data provider. It is provided as software for friendly competition.</p>
        <p className="text-sm leading-7 text-texts">Do not use the app for unlawful gambling or rely on it for official sporting records.</p>
      </article>
    </main>
  )
}
