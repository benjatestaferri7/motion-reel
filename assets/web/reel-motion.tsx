"use client"

// ──────────────────────────────────────────────────────────────────────────
// ReelMotion — ONE client island that animates declarative hooks rendered by
// server-component scenes, so the scenes themselves ship zero JS:
//
//   [data-reveal]         slide up (expo.out)  ="pop" back.out · ="drop" bounce.out
//   [data-wipe]           clip-path wipe reveal (left → right)
//   [data-count]          count-up of a stat string (see count-up.ts)
//   [data-words]          per-word opacity scrub; children marked [data-word]
//
// Mount it LAST in the page (after every pinning island) so pins have
// inserted their spacers before these triggers measure; it also calls
// ScrollTrigger.sort() + refresh() once on the next frame.
//
// Elements inside a horizontal reel ([data-hpin]) are skipped on pinnable
// viewports — HorizontalReel animates those with containerAnimation.
// Reduced motion: nothing runs; server markup is already the final state
// (never hide content in CSS that only JS can reveal, except [data-intro]
// which has a CSS failsafe).
// ──────────────────────────────────────────────────────────────────────────

import { useEffect } from "react"
import { gsap, ScrollTrigger, MQ, EASE } from "./gsap-setup"
import { countUp } from "./count-up"

const FROM: Record<string, gsap.TweenVars> = {
  up: { y: 56, autoAlpha: 0 },
  pop: { scale: 0.6, autoAlpha: 0 },
  drop: { y: -90, autoAlpha: 0 },
}
const EASE_FOR: Record<string, string> = { up: EASE.slide, pop: EASE.pop, drop: EASE.drop }

export function ReelMotion() {
  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add({ motion: MQ.motion, pinnable: MQ.pinnable }, (ctx) => {
      const { motion, pinnable } = ctx.conditions as { motion: boolean; pinnable: boolean }
      if (!motion) return
      const owned = (el: Element) => pinnable && !!el.closest("[data-hpin]")

      for (const kind of ["up", "pop", "drop"] as const) {
        const selector = kind === "up" ? '[data-reveal=""], [data-reveal="up"]' : `[data-reveal="${kind}"]`
        const els = gsap.utils.toArray<HTMLElement>(selector).filter((el) => !owned(el))
        if (!els.length) continue
        gsap.set(els, FROM[kind])
        ScrollTrigger.batch(els, {
          start: "top 90%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              y: 0,
              scale: 1,
              autoAlpha: 1,
              duration: kind === "drop" ? 1.2 : 1.1,
              ease: EASE_FOR[kind],
              stagger: 0.08,
              overwrite: true,
            }),
        })
      }

      gsap.utils.toArray<HTMLElement>("[data-wipe]").forEach((el) => {
        if (owned(el)) return
        gsap.fromTo(
          el,
          { clipPath: "inset(0 100% 0 0)" },
          { clipPath: "inset(0 0% 0 0)", duration: 1.2, ease: EASE.cut, scrollTrigger: { trigger: el, start: "top 85%", once: true } },
        )
      })

      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        if (owned(el)) return
        ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => countUp(el) })
      })

      gsap.utils.toArray<HTMLElement>("[data-words]").forEach((el) => {
        const words = el.querySelectorAll<HTMLElement>("[data-word]")
        gsap.fromTo(
          words,
          { opacity: 0.14 },
          { opacity: 1, ease: "none", stagger: 0.1, scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 50%", scrub: true } },
        )
      })
    })

    const raf = requestAnimationFrame(() => {
      ScrollTrigger.sort()
      ScrollTrigger.refresh()
    })
    return () => {
      cancelAnimationFrame(raf)
      mm.revert()
    }
  }, [])

  return null
}
