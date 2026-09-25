"use client"

// ──────────────────────────────────────────────────────────────────────────
// StretchType — each line's wdth axis is scrubbed by scroll in alternating
// directions (narrow→wide, wide→narrow) with a small counter-drift, so the
// statement "breathes" as it passes. Requires a display font with a wdth
// axis (e.g. Archivo 62..125) loaded WITH that axis (next/font: axes:["wdth"];
// Google Fonts CSS2: family=Archivo:wdth,wght@62..125,100..900).
//
// Props
//   lines       statement lines
//   range       [narrow, wide] wdth values (default [62, 125])
//   accentLast  if the last line ends with ".", paint the period in
//               --reel-action (the "full stop" signature)
//
// A11y: plain text, nothing duplicated. Reduced motion: static at wdth 100.
// Mobile gotcha: wide wdth + nowrap can overflow narrow screens; the QA
// script's horizontal-overflow check catches it.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, MQ } from "./gsap-setup"

export function StretchType({
  lines,
  range = [62, 125],
  accentLast = true,
}: {
  lines: string[]
  range?: [number, number]
  accentLast?: boolean
}) {
  const root = useRef<HTMLSpanElement>(null)
  const [narrow, wide] = range

  useEffect(() => {
    const el = root.current
    if (!el) return
    const mm = gsap.matchMedia()
    mm.add(MQ.motion, () => {
      const rows = gsap.utils.toArray<HTMLElement>("[data-stretch]", el)
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 90%", end: "bottom 10%", scrub: 0.4 } })
      rows.forEach((row, i) => {
        const narrowFirst = i % 2 === 0
        tl.fromTo(
          row,
          { "--wdth": narrowFirst ? narrow : wide, xPercent: narrowFirst ? -4 : 4 },
          { "--wdth": narrowFirst ? wide : narrow, xPercent: narrowFirst ? 4 : -4, ease: "sine.inOut", duration: 1 },
          0,
        )
      })
    })
    return () => mm.revert()
  }, [narrow, wide])

  return (
    <span ref={root} style={{ display: "block" }}>
      {lines.map((line, i) => {
        const accent = accentLast && i === lines.length - 1 && line.endsWith(".")
        return (
          <span key={i} data-stretch className="wdth-var" style={{ display: "block", whiteSpace: "nowrap" }}>
            {accent ? (
              <>
                {line.slice(0, -1)}
                <span style={{ color: "rgb(var(--reel-action))" }}>.</span>
              </>
            ) : (
              line
            )}
          </span>
        )
      })}
    </span>
  )
}
