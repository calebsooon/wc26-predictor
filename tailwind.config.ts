import type { Config } from "tailwindcss";

// FIFA World Cup 2026 official brand colour palette
const fifa = {
  black:       '#000000',
  white:       '#ffffff',
  // Reds
  'red':       '#E8192C',
  'red-dark':  '#8B1A1A',
  // Purples
  'purple':    '#7C1FA0',
  'purple-dark':'#3D0D6E',
  // Blues
  'blue':      '#1A3BC1',
  'blue-dark': '#0A1E6E',
  // Teals
  'teal':      '#006D77',
  'teal-dark': '#003D44',
  // Accents
  'orange':    '#E85D04',
  'lime':      '#A3C720',
  'cyan':      '#06B6D4',
  'lavender':  '#A855F7',
  'green':     '#166534',
  'pink':      '#BE185D',
  'amber':     '#B45309',
  'indigo':    '#3730A3',
}

// Per-group accent colours (A–L, each distinct)
const groupColors: Record<string, string> = {
  A: fifa['red'],
  B: fifa['purple'],
  C: fifa['blue'],
  D: fifa['teal'],
  E: fifa['green'],
  F: fifa['orange'],
  G: fifa['lavender'],
  H: fifa['cyan'],
  I: fifa['lime'],
  J: fifa['pink'],
  K: fifa['amber'],
  L: fifa['indigo'],
}

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        fifa,
        group: groupColors,
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
  safelist: [
    // Ensure group colour classes are not purged
    ...['A','B','C','D','E','F','G','H','I','J','K','L'].flatMap(g => [
      `bg-group-${g}`, `text-group-${g}`, `border-group-${g}`,
      `ring-group-${g}`,
    ]),
  ],
};
export default config;
