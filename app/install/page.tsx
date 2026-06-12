'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader, Card, SectionHeader, Pill } from '@/components/ui'

/* ── Platform detection ───────────────────────────────────────── */
type Platform = 'ios' | 'android' | 'desktop-chrome' | 'desktop-other' | 'unknown'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream
  if (isIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Chrome/.test(ua) && !/Mobile/.test(ua)) return 'desktop-chrome'
  return 'desktop-other'
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/* ── Step component ──────────────────────────────────────────── */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: n * 0.06, duration: 0.22 }}
      className="flex gap-4"
    >
      <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 border border-primary/30 grid place-items-center">
        <span className="text-[13px] font-extrabold text-primary">{n}</span>
      </div>
      <div className="pt-1 min-w-0">
        <p className="font-bold text-[14px] text-textp leading-tight">{title}</p>
        <div className="text-[13px] text-texts mt-1 leading-relaxed">{children}</div>
      </div>
    </motion.div>
  )
}

/* ── Platform guide content ──────────────────────────────────── */
function IOSGuide() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl"></span>
        <span className="font-extrabold text-textp">iPhone & iPad (Safari)</span>
        <Pill tone="blue">Recommended browser</Pill>
      </div>
      <div className="rounded-xl border border-border bg-surface/60 p-4 text-[12px] text-texts font-medium">
        ⚠️ Must use <strong className="text-textp">Safari</strong> — Chrome and Firefox on iOS don&apos;t support Add to Home Screen.
      </div>
      <div className="space-y-5">
        <Step n={1} title="Open MatchDay in Safari">
          Make sure you&apos;re visiting this page in the Safari app (the compass icon), not Chrome or another browser.
        </Step>
        <Step n={2} title='Tap the Share button'>
          At the bottom of the screen, tap the <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border text-[11px] font-bold text-textp">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg> Share
          </span> icon (a box with an arrow pointing up).
        </Step>
        <Step n={3} title='"Add to Home Screen"'>
          Scroll down in the share sheet and tap <strong className="text-textp">Add to Home Screen</strong>. You&apos;ll see the MatchDay ball icon with an editable name.
        </Step>
        <Step n={4} title='Tap "Add"'>
          Confirm in the top-right corner. MatchDay will appear on your home screen just like a native app.
        </Step>
        <Step n={5} title="Open from your home screen">
          Launch MatchDay from the icon — it opens full screen with no browser bar, exactly like the app.
        </Step>
      </div>
    </div>
  )
}

function AndroidGuide() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">🤖</span>
        <span className="font-extrabold text-textp">Android (Chrome)</span>
      </div>
      <div className="space-y-5">
        <Step n={1} title="Open MatchDay in Chrome">
          Use Google Chrome on your Android device.
        </Step>
        <Step n={2} title="Look for the install banner">
          Chrome may automatically show a banner at the bottom saying <strong className="text-textp">&ldquo;Add MatchDay to Home screen&rdquo;</strong> — tap it to install instantly.
        </Step>
        <Step n={3} title="Or install from the menu">
          If no banner appears, tap the <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border text-[11px] font-bold text-textp">⋮</span> menu (three dots, top-right), then tap <strong className="text-textp">Add to Home screen</strong>.
        </Step>
        <Step n={4} title="Confirm the install">
          Tap <strong className="text-textp">Add</strong> in the dialog. The MatchDay icon will appear on your home screen and app drawer.
        </Step>
        <Step n={5} title="Launch and enjoy">
          Open MatchDay from your home screen — it runs in its own window, no browser chrome.
        </Step>
      </div>
    </div>
  )
}

function DesktopChromeGuide() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">💻</span>
        <span className="font-extrabold text-textp">Desktop (Chrome / Edge)</span>
      </div>
      <div className="space-y-5">
        <Step n={1} title="Look for the install icon">
          In the Chrome or Edge address bar, look for a small <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border text-[11px] font-bold text-textp">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg> Install
          </span> icon on the right side.
        </Step>
        <Step n={2} title="Click Install MatchDay">
          Click the install icon and then click <strong className="text-textp">Install</strong> in the dialog that appears.
        </Step>
        <Step n={3} title="MatchDay opens as its own window">
          It will launch in a standalone app window — pin it to your taskbar or dock for quick access.
        </Step>
      </div>
    </div>
  )
}

/* ── Benefits card ───────────────────────────────────────────── */
function BenefitsCard() {
  const benefits = [
    { icon: '⚡', title: 'Instant launch', desc: 'Opens straight to your league — no browser, no address bar.' },
    { icon: '📱', title: 'Full-screen experience', desc: 'Uses the whole screen like a native app on every device.' },
    { icon: '🔖', title: 'Always one tap away', desc: 'Lives on your home screen alongside your other apps.' },
    { icon: '🌙', title: 'Matches your theme', desc: 'Dark status bar and splash screen match the MatchDay design.' },
  ]
  return (
    <Card className="p-5">
      <SectionHeader title="Why install?" sub="What you get over using it in a browser tab" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        {benefits.map((b) => (
          <div key={b.title} className="flex gap-3 p-3 rounded-xl bg-surface border border-border/60">
            <span className="text-xl shrink-0">{b.icon}</span>
            <div>
              <p className="text-[13px] font-bold text-textp">{b.title}</p>
              <p className="text-[12px] text-texts mt-0.5">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ── Main page ───────────────────────────────────────────────── */
export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>('unknown')
  const [installed, setInstalled] = useState(false)
  const [activeTab, setActiveTab] = useState<Platform>('ios')

  useEffect(() => {
    const p = detectPlatform()
    setPlatform(p)
    setInstalled(isStandalone())
    // Default the tab to the user's detected platform
    if (p === 'ios') setActiveTab('ios')
    else if (p === 'android') setActiveTab('android')
    else setActiveTab('desktop-chrome')
  }, [])

  const tabs: { key: Platform; label: string; emoji: string }[] = [
    { key: 'ios',            label: 'iPhone / iPad', emoji: '' },
    { key: 'android',        label: 'Android',       emoji: '🤖' },
    { key: 'desktop-chrome', label: 'Desktop',       emoji: '💻' },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Get the app"
        title="Install MatchDay"
        sub="Add MatchDay to your home screen for a native app experience — no App Store needed."
      />

      {installed ? (
        <Card className="p-5 border-primary/30 bg-primary/[0.05]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-extrabold text-textp">Already installed</p>
              <p className="text-[13px] text-texts mt-0.5">You&apos;re running MatchDay as a standalone app. You&apos;re all set.</p>
            </div>
          </div>
        </Card>
      ) : platform !== 'unknown' && (
        <Card className="p-4 border-gold/30 bg-gold/[0.05]">
          <div className="flex items-center gap-3">
            <span className="text-xl">👇</span>
            <p className="text-[13px] font-semibold text-textp">
              {platform === 'ios' && 'You\'re on iOS — follow the Safari steps below.'}
              {platform === 'android' && 'You\'re on Android — Chrome will offer to install automatically.'}
              {(platform === 'desktop-chrome' || platform === 'desktop-other') && 'You\'re on desktop — look for the install icon in your address bar.'}
            </p>
          </div>
        </Card>
      )}

      <BenefitsCard />

      {/* Platform tabs */}
      <Card className="p-5">
        <SectionHeader title="Step-by-step guide" sub="Select your device type" />

        <div className="flex gap-2 mt-3 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[13px] font-bold transition-all ${
                activeTab === t.key
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'border-border text-texts hover:text-textp hover:border-texts/40'
              }`}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              {platform === t.key && !installed && (
                <span className="text-[9px] font-extrabold px-1 py-0.5 rounded bg-gold/20 text-gold ml-1">YOUR DEVICE</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'ios' && <IOSGuide />}
        {activeTab === 'android' && <AndroidGuide />}
        {(activeTab === 'desktop-chrome' || activeTab === 'desktop-other') && <DesktopChromeGuide />}
      </Card>

      {/* FAQ */}
      <Card className="p-5">
        <SectionHeader title="Common questions" />
        <div className="space-y-4 mt-3">
          {[
            {
              q: 'Is this an app from the App Store or Play Store?',
              a: 'No — MatchDay is a Progressive Web App (PWA). You install it directly from your browser with no app store involved. It stays up to date automatically.',
            },
            {
              q: 'Does it work offline?',
              a: 'MatchDay needs a connection to load your predictions and league data. You can open it offline but content won\'t refresh until you\'re back online.',
            },
            {
              q: 'Will it use my storage?',
              a: 'Barely any. PWAs store a small amount of cached data (a few MB at most) — nothing like a native app download.',
            },
            {
              q: 'How do I remove it?',
              a: 'Same as any app icon — long press on iOS/Android and tap Remove, or uninstall from your device settings.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
              <p className="text-[13px] font-bold text-textp">{q}</p>
              <p className="text-[12px] text-texts mt-1 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
