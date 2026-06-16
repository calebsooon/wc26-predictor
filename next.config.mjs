import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  customWorkerSrc: 'worker',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Cache Supabase REST reads for bracket/group/tournament data — StaleWhileRevalidate
        // so returning visitors see instant data even on flaky connections.
        urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(tournament_predictions|group_predictions|bracket_results)/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'supabase-game-data',
          expiration: { maxEntries: 64, maxAgeSeconds: 4 * 60 * 60 },
        },
      },
    ],
  },
  fallbacks: {
    document: '/offline',
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default withPWA(nextConfig)
