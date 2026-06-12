import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0C14' }}>
        {/* Ball mark: radial white sphere + pitch equator + centre circle + spot */}
        <div style={{ display: 'flex', position: 'relative', width: 48, height: 48 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 38% 35%, #ffffff 0%, #E2E5F4 100%)' }} />
          <div style={{ position: 'absolute', top: 22, left: 0, right: 0, height: 3, background: '#0B0C14' }} />
          <div style={{ position: 'absolute', top: 13, left: 13, width: 22, height: 22, borderRadius: '50%', border: '3px solid #0B0C14' }} />
          <div style={{ position: 'absolute', top: 21, left: 21, width: 6, height: 6, borderRadius: '50%', background: '#0B0C14' }} />
        </div>
      </div>
    ),
    size,
  )
}
