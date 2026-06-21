import withPWAInit from '@ducanh2912/next-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null

const withPWA = withPWAInit({
  dest: 'public',
  customWorkerSrc: 'worker',
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: { disableDevLogs: true },
  fallbacks: {
    document: '/offline',
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
  images: {
    remotePatterns: [
      ...(supabaseHost ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }] : []),
      {
        // Player headshots back-filled from Wikidata → Wikimedia Commons.
        protocol: 'https',
        hostname: 'commons.wikimedia.org',
        pathname: '/wiki/Special:FilePath/**',
      },
      {
        // Special:FilePath 302-redirects to the upload host where bytes live.
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/**',
      },
      {
        // Older Golden Boot cache entries may still use the Kickoffapi CDN.
        protocol: 'https',
        hostname: 'cdn.kickoffapi.com',
        pathname: '/**',
      },
      {
        // FIFA's published Golden Boot table supplies its player headshots here.
        protocol: 'https',
        hostname: 'digitalhub.fifa.com',
        pathname: '/transform/**',
      },
      {
        // FIFA GameDay team logos served from their S3-backed CDN.
        protocol: 'https',
        hostname: '*.s3.eu-west-1.amazonaws.com',
        pathname: '/**',
      },
      {
        // FIFA GameDay player/team media (alternate CDN path).
        protocol: 'https',
        hostname: 'cxm-api.fifa.com',
        pathname: '/**',
      },
      {
        // FIFA public picture API — national team flags/crests by 3-letter code.
        protocol: 'https',
        hostname: 'api.fifa.com',
        pathname: '/**',
      },
    ],
  },
}

export default withPWA(nextConfig)
