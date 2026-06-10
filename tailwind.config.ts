import type { Config } from "tailwindcss";

/*
 * BRACKET XI — "Dark Stadium Analytics" design tokens.
 *
 * Colours are driven by CSS variables (defined in globals.css) as
 * space-separated RGB channels, so Tailwind opacity modifiers like
 * `bg-primary/12` and `border-border` keep working — and the same class
 * names flip automatically between light and dark mode (`.dark` on <html>).
 */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: token("--bg"),
        surface: token("--surface"),
        card: token("--card"),
        border: token("--border"),
        primary: token("--primary"),
        gold: token("--gold"),
        blue: token("--blue"),
        textp: token("--textp"),
        texts: token("--texts"),
        error: token("--error"),
        success: token("--success"),
        // legacy aliases kept so any un-migrated markup still resolves
        background: token("--bg"),
        foreground: token("--textp"),
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "var(--font-archivo)", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
