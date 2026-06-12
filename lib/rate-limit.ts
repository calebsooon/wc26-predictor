// Simple in-memory token bucket. Resets per process restart (fine for server routes).
// Key is typically the admin user's ID so burst limits are per-user.

const buckets = new Map<string, { tokens: number; last: number }>()

const RATE = 10       // max requests
const WINDOW_MS = 60_000  // per minute

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const b = buckets.get(key) ?? { tokens: RATE, last: now }
  const elapsed = now - b.last
  const refill = Math.floor((elapsed / WINDOW_MS) * RATE)
  const tokens = Math.min(RATE, b.tokens + refill)
  if (tokens <= 0) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now % WINDOW_MS) }
  }
  buckets.set(key, { tokens: tokens - 1, last: now })
  return { allowed: true }
}
