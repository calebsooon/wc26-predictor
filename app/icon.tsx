import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

// Branded "MD" app icon / favicon
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#22C55E', color: '#04210F', fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em',
        }}
      >
        MD
      </div>
    ),
    size,
  )
}
