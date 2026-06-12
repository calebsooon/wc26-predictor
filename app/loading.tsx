export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0C14]">
      {/* Outer pulse ring */}
      <span className="absolute inline-flex h-28 w-28 rounded-full bg-white/5 animate-ping" />
      {/* Ball mark */}
      <svg
        width="72"
        height="72"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className="relative animate-pulse"
        aria-hidden="true"
      >
        {/* Radial gradient sphere */}
        <defs>
          <radialGradient id="ballGrad" cx="38%" cy="35%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="60%" stopColor="#d0d0d0" stopOpacity="1" />
            <stop offset="100%" stopColor="#888888" stopOpacity="1" />
          </radialGradient>
          <clipPath id="ballClip">
            <circle cx="50" cy="50" r="38" />
          </clipPath>
        </defs>
        {/* Sphere fill */}
        <circle cx="50" cy="50" r="38" fill="url(#ballGrad)" />
        {/* Equator line */}
        <line
          x1="12"
          y1="50"
          x2="88"
          y2="50"
          stroke="#0B0C14"
          strokeWidth="2.5"
          clipPath="url(#ballClip)"
          strokeOpacity="0.55"
        />
        {/* Centre circle */}
        <circle
          cx="50"
          cy="50"
          r="12"
          fill="none"
          stroke="#0B0C14"
          strokeWidth="2.5"
          strokeOpacity="0.55"
          clipPath="url(#ballClip)"
        />
        {/* Centre spot */}
        <circle cx="50" cy="50" r="2.5" fill="#0B0C14" fillOpacity="0.6" />
      </svg>
    </div>
  )
}
