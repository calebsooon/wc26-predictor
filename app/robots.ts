import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/privacy', '/terms'],
      disallow: ['/admin', '/api', '/dashboard', '/predictions', '/groups', '/bracket', '/leaderboard', '/h2h', '/profile', '/squads', '/golden-boot', '/join'],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/sitemap.xml`,
  }
}
