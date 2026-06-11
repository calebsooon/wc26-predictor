import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MatchDay — World Cup 2026',
    short_name: 'MatchDay',
    description: 'Predict every match. Your road to glory.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0B1220',
    theme_color: '#0B1220',
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
    ],
  }
}
