export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg/96 backdrop-blur-md">
      {/* Outer pulse ring */}
      <span className="absolute inline-flex h-28 w-28 sm:h-32 sm:w-32 rounded-full bg-primary/8 animate-ping" />
      {/* Slower secondary ring */}
      <span
        className="absolute inline-flex h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-primary/12 animate-ping"
        style={{ animationDelay: '0.35s', animationDuration: '1.6s' }}
      />
      {/* Icon */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.svg"
        alt="MatchDay"
        className="relative w-16 h-16 sm:w-20 sm:h-20 animate-pulse"
        style={{ borderRadius: 18, animationDuration: '1.8s' }}
      />
      <div className="relative text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Loading</p>
        <p className="mt-1 text-sm font-semibold text-texts">Getting MatchDay ready</p>
      </div>
    </div>
  )
}
