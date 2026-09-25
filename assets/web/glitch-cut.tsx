"use client"

// ──────────────────────────────────────────────────────────────────────────
// GlitchCut — the hard-cut flash: 3 steps × ~55ms of randomized RGB-split
// slices (difference blend) whenever a [data-cut] section crosses the middle
// of the viewport, in either direction. Mount once per page. CSS: glitch-cut.css.
//
// Props
//   colors   slice colors (default: action, machine, bone palette tokens)
//   selector which elements are cuts (default "[data-cut]")
//   cooldown ms between flashes (default 350) so fast scrolls don't strobe
//
// A11y / safety
// - aria-hidden, pointer-events none, reduced motion → never mounted logic
//   (and CSS hides it). ≤3 flashes/second by construction (cooldown) — stays
//   under the WCAG 2.3.1 three-flashes threshold. Don't lower the cooldown.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, ScrollTrigger, MQ } from "./gsap-setup"

const DEFAULT_COLORS = [
  "rgb(var(--reel-action))",
  "rgb(var(--reel-machine))",
  "rgb(var(--reel-bone))",
  "rgb(var(--reel-action))",
  "rgb(var(--reel-machine))",
  "rgb(var(--reel-bone))",
  "rgb(var(--reel-machine))",
]

export function GlitchCut({
  colors = DEFAULT_COLORS,
  selector = "[data-cut]",
  cooldown = 350,
}: {
  colors?: string[]
  selector?: string
  cooldown?: number
}) {
  const flashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add(MQ.motion, () => {
      const flash = flashRef.current
      if (!flash) return
      const slices = Array.from(flash.children) as HTMLElement[]
      let last = 0

      const play = () => {
        const now = performance.now()
        if (now - last < cooldown) return
        last = now
        const tl = gsap.timeline()
        tl.set(flash, { visibility: "visible" })
        for (let step = 0; step < 3; step++) {
          tl.call(() => {
            slices.forEach((s) =>
              gsap.set(s, {
                top: `${gsap.utils.random(0, 94)}%`,
                height: `${gsap.utils.random(1, 9)}%`,
                xPercent: gsap.utils.random(-6, 6),
                opacity: gsap.utils.random(0.35, 0.9),
              }),
            )
          })
          tl.to({}, { duration: 0.055 })
        }
        tl.set(flash, { visibility: "hidden" })
      }

      const triggers = gsap.utils
        .toArray<HTMLElement>(selector)
        .map((el) => ScrollTrigger.create({ trigger: el, start: "top 50%", onEnter: play, onLeaveBack: play }))
      return () => triggers.forEach((t) => t.kill())
    })
    return () => mm.revert()
  }, [selector, cooldown])

  return (
    <div ref={flashRef} className="cut-flash" aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </div>
  )
}
