// ──────────────────────────────────────────────────────────────────────────
// tailwind-preset (optional, Tailwind v3) — maps the role tokens from
// tokens.css into Tailwind utilities. Values stay in CSS variables, so a
// palette swap never touches this file.
//
//   // tailwind.config.ts
//   import reel from "./motion-reel/tailwind-preset"
//   export default { presets: [reel], content: [...] }
//
// Gives you: bg-reel-action, text-reel-on-action/80, border-reel-ink/20,
// font-display / font-sans / font-mono, ease-expo, ease-snap,
// radius 0 everywhere (full kept for dots), no shadows.
// Tailwind v4: declare the same vars under @theme instead
// (--color-reel-action: rgb(var(--reel-action)); …).
// ──────────────────────────────────────────────────────────────────────────

import type { Config } from "tailwindcss"

const token = (name: string) => `rgb(var(--reel-${name}) / <alpha-value>)`

// Same shape as `palette.mjs --format tailwind` (colors.reel.*).
const roles = ["ink", "bone", "action", "machine"] as const
const reel: Record<string, string> = {}
for (const r of roles) {
  reel[r] = token(r)
  reel[`on-${r}`] = token(`on-${r}`)
  reel[`hud-on-${r}`] = token(`hud-on-${r}`)
}

const preset = {
  content: [],
  theme: {
    extend: {
      colors: { reel },
      fontFamily: {
        display: ["var(--reel-font-display)"],
        sans: ["var(--reel-font-sans)"],
        mono: ["var(--reel-font-mono)"],
      },
      transitionTimingFunction: {
        expo: "cubic-bezier(0.16, 1, 0.3, 1)",
        snap: "cubic-bezier(0.7, 0, 0.2, 1)",
      },
    },
    borderRadius: { none: "0", full: "9999px" },
    boxShadow: { none: "none" },
  },
  plugins: [],
} satisfies Config

export default preset
