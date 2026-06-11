import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase-middleware'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createMiddlewareSupabaseClient(request, response)

  const { data: { session } } = await supabase.auth.getSession()

  const isLoginPage = request.nextUrl.pathname === '/login'

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/predictions', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Exclude Next internals, auth callback, and public metadata (manifest/icons)
    // so the PWA manifest and favicon load without an auth redirect.
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|manifest.webmanifest|icon|apple-icon|sitemap.xml|robots.txt).*)',
  ],
}
