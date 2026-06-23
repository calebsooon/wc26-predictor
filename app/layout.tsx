import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import Telemetry from "@/components/Telemetry";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MatchDay — World Cup 2026 Prediction League",
  description: "Your road to glory starts here.",
  metadataBase: new URL(siteUrl),
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'MatchDay',
    title: 'MatchDay — World Cup 2026 Prediction League',
    description: 'Private World Cup prediction leagues with live scoring, squads, brackets, and real-time rivalry.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'MatchDay World Cup 2026 prediction league' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatchDay — World Cup 2026 Prediction League',
    description: 'Predict every match. Your road to glory.',
    images: ['/opengraph-image'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MatchDay',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B0C14',
  // Lets the safe-area padding in AppShell protect the bottom navigation on
  // notched devices when the app is installed in standalone mode.
  viewportFit: 'cover',
};

// Set the theme class before paint to avoid a flash of the wrong theme.
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* manifest is declared via metadata.manifest above — no duplicate link tag needed */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MatchDay" />
      </head>
      <body className={`${hankenGrotesk.variable} ${schibstedGrotesk.variable} antialiased min-h-screen bg-bg text-textp`}>
        <Telemetry />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
