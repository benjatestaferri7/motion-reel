"use client"

// ──────────────────────────────────────────────────────────────────────────
// ScrambleText — letters cycle through random glyphs, then lock left-to-right
// into the real text when the element scrolls into view (decrypt effect).
//
// Props
//   text      the real string
//   as        wrapper tag (default "span"; use inside your h2/h3)
//   start     ScrollTrigger start (default "top 85%")
//   duration  ms (default 1100)
//
// A11y (IMPORTANT): screen readers get ONE stable copy in an .sr-only span;
// the animated copy is aria-hidden. Without this split, assistive tech may
// read garbage glyphs, or re-announce on every textContent write.
// SEO/no-JS: the server renders the final text in both spans.
// Reduced motion: never scrambles.
// QA gotcha: a screenshot taken mid-scramble looks broken ("K#7/ZQ…").
// Wait ≥ duration after scrolling before capturing (qa-screenshots.js does).
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, type ElementType } from "react"
import { gsap, ScrollTrigger, prefersReducedMotion } from "./gsap-setup"

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*/{}<>[]"

export function ScrambleText({
  text,
  as: Tag = "span",
  className,
  start = "top 85%",
  duration = 1100,
}: {
  text: string
  as?: ElementType
  className?: string
  start?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const chars = Array.from(text)
    const ease = gsap.parseEase("power2.out")
    let raf = 0

    const run = () => {
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration)
        const revealed = Math.floor(ease(p) * chars.length) // early letters lock fast, tail lingers
        let out = ""
        for (let i = 0; i < chars.length; i++) {
          if (chars[i] === " ") out += " "
          else if (i < revealed) out += chars[i]
          else out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
        }
        el.textContent = out
        if (p < 1) raf = requestAnimationFrame(step)
        else el.textContent = text
      }
      raf = requestAnimationFrame(step)
    }

    const st = ScrollTrigger.create({ trigger: el, start, once: true, onEnter: run })
    return () => {
      cancelAnimationFrame(raf)
      st.kill()
      el.textContent = text
    }
  }, [text, start, duration])

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
    </Tag>
  )
}
