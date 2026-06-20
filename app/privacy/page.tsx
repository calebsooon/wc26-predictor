import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg px-5 py-12 text-textp">
      <article className="mx-auto max-w-2xl space-y-6">
        <Link href="/" className="text-sm font-bold text-primary">← MatchDay</Link>
        <div><p className="eyebrow">Legal</p><h1 className="mt-2 text-3xl font-black">Privacy</h1></div>
        <p className="text-sm leading-7 text-texts">MatchDay stores the account information needed to run a private prediction league: your email through Supabase Auth, display name, optional avatar, prediction data, league membership, and display preferences.</p>
        <p className="text-sm leading-7 text-texts">Optional push notifications store a browser subscription endpoint. Calendar subscriptions use a private rotating token. Player photos and public league banners are served from Supabase Storage.</p>
        <p className="text-sm leading-7 text-texts">We do not sell personal data. League organizers should use MatchDay only with people they are comfortable inviting into a private competition.</p>
        <p className="text-sm leading-7 text-texts">For data deletion or support, contact the organizer running your deployment.</p>
      </article>
    </main>
  )
}
