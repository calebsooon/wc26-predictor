'use client'

// Root error boundary — replaces the root layout, so it can't rely on global CSS.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0B1220', color: '#E2E8F0', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ maxWidth: 360 }}>
            <div style={{ fontSize: 48 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: '12px 0 6px' }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 16px' }}>{error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={reset}
              style={{ background: '#22C55E', color: '#04210F', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
