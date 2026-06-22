'use client'

type TelemetryEvent = {
  type: 'web_vital' | 'route_error'
  name: string
  value?: number
  path?: string
  detail?: string
}

/**
 * Best-effort operational telemetry. It deliberately contains no user ID,
 * predictions, or league information; Vercel/server logs become the alerting
 * surface without consuming database rows or exposing private league data.
 */
export function reportTelemetry(event: TelemetryEvent) {
  if (process.env.NODE_ENV !== 'production') return
  try {
    const body = JSON.stringify({ ...event, at: new Date().toISOString() })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
  } catch { /* Never let diagnostics affect the player experience. */ }
}
