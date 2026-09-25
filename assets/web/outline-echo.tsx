"use client"

// ──────────────────────────────────────────────────────────────────────────
// OutlineEcho — a solid headline with stacked OUTLINE copies that fan out
// above it and fold back below as you scroll (the "MOVE" echo), while the
// solid line squeezes along the wdth axis (118 → 72).
//
// Props
//   lines     headline lines (each rendered as one nowrap block)
//   copies    number of outline echoes (default 5)
//   className applied to the wrapper (put `.display` + size on the parent h2)
//
// Usage: <h2 className="display" style={{fontSize:"18vw"}}><OutlineEcho lines={["YOUR", "HEADLINE."]} /></h2>
//
// A11y: the solid copy is the accessible text; echoes are aria-hidden.
// Perf: transforms + one custom property on a scrubbed timeline. Echo
// strokes use currentColor (the field's --reel-on-<field> token).
// Mobile gotcha: 18vw nowrap lines can overflow at 375px — measure with the
// QA script (horizontal overflow check) and lower the vw or line length.
// Reduced motion: static solid text, echoes stay hidden.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, MQ } from "./gsap-setup"

export function OutlineEcho({ lines, copies = 5, className = "" }: { lines: string[]; copies?: number; className?: string }) {
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const mm = gsap.matchMedia()
    mm.add(MQ.motion, () => {
      const echoes = gsap.utils.toArray<HTMLElement>("[data-echo]", el)
      const solid = el.querySelector<HTMLElement>("[data-solid]")
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 95%", end: "bottom 5%", scrub: 0.6 } })
      tl.fromTo(
        echoes,
        { yPercent: 0, autoAlpha: 0 },
        { yPercent: (i: number) => -(i + 1) * 13, autoAlpha: 1, ease: "power2.out", duration: 1 },
      ).to(echoes, { yPercent: (i: number) => (i + 1) * 13, ease: "power2.inOut", duration: 1 }, 1)
      if (solid) tl.fromTo(solid, { "--wdth": 118 }, { "--wdth": 72, ease: "none", duration: 2 }, 0)
    })
    return () => mm.revert()
  }, [])

  const text = lines.map((line, i) => (
    <span key={i} style={{ display: "block", whiteSpace: "nowrap" }}>
      {line}
    </span>
  ))

  return (
    <span ref={root} className={className} style={{ position: "relative", display: "block" }}>
      {Array.from({ length: copies }).map((_, i) => (
        <span
          key={i}
          data-echo
          aria-hidden="true"
          className="text-outline wdth-var"
          style={{
            position: "absolute",
            inset: 0,
            visibility: "hidden",
            pointerEvents: "none",
            userSelect: "none",
            ["--wdth" as string]: 100 - (i + 1) * 6,
          }}
        >
          {text}
        </span>
      ))}
      <span data-solid className="wdth-var" style={{ position: "relative", display: "block" }}>
        {text}
      </span>
    </span>
  )
}
