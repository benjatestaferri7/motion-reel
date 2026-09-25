"use client"

// ──────────────────────────────────────────────────────────────────────────
// countUp — animates the numeric part of a stat string while prefix/suffix
// stay fixed: "−70%", "+18h", "2.4×", "12+", "4-6 wk", "$1.2M".
//
// Contract
// - The SERVER renders the final value (SEO, no-JS, screen readers, reduced
//   motion all see the truth). Put it in `data-count` or the text content.
// - On play, the number runs from 0 → target with expo.out and snaps to the
//   exact original string on complete (no float drift like "69.99%").
// - Decimals are preserved from the source ("2.4" animates with 1 decimal).
//
// Usage (via reel-motion.tsx): <dd data-count="−70%">−70%</dd>
// Or directly: countUp(el, 1.6)
// QA gotcha: mid-animation screenshots show "0%" — wait before capturing.
// ──────────────────────────────────────────────────────────────────────────

import { gsap } from "./gsap-setup"

const NUM_RE = /^([^\d]*)(\d+(?:\.\d+)?)(.*)$/

export function countUp(el: HTMLElement, duration = 1.6): gsap.core.Tween | null {
  const final = el.dataset.count ?? el.textContent ?? ""
  const match = final.match(NUM_RE)
  if (!match) return null
  const [, prefix, num, suffix] = match
  const decimals = num.includes(".") ? num.split(".")[1].length : 0
  const target = parseFloat(num)
  const state = { v: 0 }
  return gsap.to(state, {
    v: target,
    duration,
    ease: "expo.out",
    onUpdate: () => {
      el.textContent = `${prefix}${state.v.toFixed(decimals)}${suffix}`
    },
    onComplete: () => {
      el.textContent = final
    },
  })
}
