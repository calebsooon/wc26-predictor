'use client'

export default function OfflinePage() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-[#0B0C14] px-6 text-center">
      {/* Ball mark */}
      <svg
        width="72"
        height="72"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-60"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="og" cx="38%" cy="35%" r="55%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#d0d0d0" />
            <stop offset="100%" stopColor="#888888" />
          </radialGradient>
          <clipPath id="oc">
            <circle cx="50" cy="50" r="38" />
          </clipPath>
        </defs>
        <circle cx="50" cy="50" r="38" fill="url(#og)" />
        <line x1="12" y1="50" x2="88" y2="50" stroke="#0B0C14" strokeWidth="2.5" clipPath="url(#oc)" strokeOpacity="0.55" />
        <circle cx="50" cy="50" r="12" fill="none" stroke="#0B0C14" strokeWidth="2.5" strokeOpacity="0.55" clipPath="url(#oc)" />
        <circle cx="50" cy="50" r="2.5" fill="#0B0C14" fillOpacity="0.6" />
      </svg>

      <div className="space-y-2">
        <h1 className="text-xl font-extrabold text-white tracking-tight">You&apos;re offline</h1>
        <p className="text-[14px] text-white/50 max-w-xs leading-relaxed">
          MatchDay needs a connection to load your league data. Check your network and try again.
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="mt-2 h-10 px-6 rounded-xl bg-white/10 border border-white/15 text-[13px] font-bold text-white hover:bg-white/15 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
