import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MatchDay — World Cup 2026 Prediction League'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', padding: '64px', color: '#f8fafc', background: 'linear-gradient(135deg, #07130d 0%, #0b1f15 52%, #102b20 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#23c76a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#062111' }}>M</div>
          MATCHDAY
        </div>
        <div style={{ display: 'flex', marginTop: 74, fontSize: 82, lineHeight: 1, fontWeight: 900, letterSpacing: -5, maxWidth: 920 }}>Predict every match.<br />Own the group chat.</div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 30, color: '#b7c6bd' }}>World Cup 2026 · Private leagues · Live scoring</div>
        <div style={{ display: 'flex', marginTop: 'auto', gap: 18 }}>
          {['104 fixtures', '48 squads', 'Live leaderboard'].map((item) => <div key={item} style={{ display: 'flex', padding: '12px 18px', border: '1px solid #385447', borderRadius: 999, fontSize: 22, color: '#d9e8df' }}>{item}</div>)}
        </div>
      </div>
    ),
    size,
  )
}
