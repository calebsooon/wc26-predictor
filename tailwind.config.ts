import type { Config } from "tailwindcss";

/*
 * MatchDay — "Refined" design tokens.
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
        bg:       token("--bg"),
        surface:  token("--surface"),
        card:     token("--card"),
        surface2: token("--surface2"),
        surface3: token("--surface3"),
        border:   token("--border"),
        primary:  token("--primary"),
        accent:   token("--accent"),   // active league colour (falls back to primary)
        gold:     token("--gold"),
        blue:     token("--blue"),
        amber:    token("--amber"),
        coral:    token("--coral"),
        textp:    token("--textp"),
        texts:    token("--texts"),
        faint:    token("--faint"),
        error:    token("--error"),
        success:  token("--success"),
        bronze:   token("--bronze"),
        // legacy aliases
        background: token("--bg"),
        foreground: token("--textp"),
      },
      fontFamily: {
        sans:    ["var(--font-body)",    "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        chip: "11px",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        mcIn: {
          "from": { opacity: "0", transform: "translateY(10px) scale(0.985)" },
          "to":   { opacity: "1", transform: "none" },
        },
        lbPop: {
          "0%":   { opacity: "0", transform: "translateY(4px) scale(0.8)" },
          "60%":  { transform: "translateY(0) scale(1.12)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        "mc-in": "mcIn 0.22s cubic-bezier(.16,1,.3,1) forwards",
        "lb-pop": "lbPop 0.45s cubic-bezier(.16,1,.3,1) forwards",
      },
    },
  },
  plugins: [],
};
export default config;
