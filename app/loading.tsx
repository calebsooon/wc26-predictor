export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0c14]">
      {/* Outer pulse ring */}
      <span className="absolute inline-flex h-28 w-28 sm:h-32 sm:w-32 rounded-full bg-white/[0.04] animate-ping" />
      {/* Slower secondary ring */}
      <span
        className="absolute inline-flex h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-white/[0.06] animate-ping"
        style={{ animationDelay: '0.35s', animationDuration: '1.6s' }}
      />
      {/* Icon */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.svg"
        alt="MatchDay"
        className="relative w-16 h-16 sm:w-20 sm:h-20 animate-pulse"
        style={{ borderRadius: 18, animationDuration: '1.8s' }}
        aria-hidden="true"
      />
    </div>
  )
}
