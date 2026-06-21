import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['web_vital', 'route_error'])

export async function POST(request: Request) {
  try {
    const body = await request.json() as { type?: string; name?: string; value?: unknown; path?: unknown; detail?: unknown }
    if (!body.type || !ALLOWED.has(body.type) || typeof body.name !== 'string') return NextResponse.json({ error: 'Invalid telemetry payload' }, { status: 400 })
    const value = typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : undefined
    const path = typeof body.path === 'string' ? body.path.slice(0, 160) : undefined
    const detail = typeof body.detail === 'string' ? body.detail.slice(0, 300) : undefined
    // Structured server logs work with Vercel log drains and avoid a high-cardinality
    // database table for anonymous performance telemetry.
    console.info(JSON.stringify({ source: 'matchday.telemetry', type: body.type, name: body.name.slice(0, 80), value, path, detail }))
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Invalid telemetry payload' }, { status: 400 })
  }
}
