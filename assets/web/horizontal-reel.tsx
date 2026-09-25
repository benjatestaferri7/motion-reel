"use client"

// ──────────────────────────────────────────────────────────────────────────
// HorizontalReel — pins ITS OWN wrapper (never the <section>, so anchors and
// scroll-margin keep working) and scrubs a [data-track] sideways. Only on
// ≥1024px with motion allowed (MQ.pinnable); everywhere else the stacked
// layout is the CSS fallback (.hreel-track / .hreel-panel in tokens.css only
// apply inside the same media query).
//
//   <HorizontalReel>
//     <div data-track className="hreel-track">
//       <article data-panel className="hreel-panel">…<span data-count="−70%">−70%</span></article>
//     </div>
//   </HorizontalReel>
//
// Inside panels: [data-panel-wipe] wipes in, [data-reveal] slides up and
// [data-count] counts up as each panel enters, using the horizontal tween as
// `containerAnimation`. Panel 0 is on screen at pin start, so it's skipped.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, ScrollTrigger, MQ, EASE } from "./gsap-setup"
import { countUp } from "./count-up"

export function HorizontalReel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    const track = el?.querySelector<HTMLElement>("[data-track]")
    if (!el || !track) return

    const mm = gsap.matchMedia()
    mm.add(MQ.pinnable, () => {
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth)
      const scroll = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })

      gsap.utils.toArray<HTMLElement>("[data-panel]", el).forEach((panel, i) => {
        if (i === 0) return
        const wipe = panel.querySelector<HTMLElement>("[data-panel-wipe]")
        const reveals = panel.querySelectorAll<HTMLElement>("[data-reveal]")
        if (wipe) {
          gsap.fromTo(
            wipe,
            { clipPath: "inset(0 0 0 100%)" },
            {
              clipPath: "inset(0 0 0 0%)",
              ease: "none",
              scrollTrigger: { trigger: panel, containerAnimation: scroll, start: "left 100%", end: "left 35%", scrub: true },
            },
          )
        }
        if (reveals.length) {
          gsap.set(reveals, { autoAlpha: 0, y: 40 })
          gsap.to(reveals, {
            autoAlpha: 1,
            y: 0,
            duration: 1,
            ease: EASE.slide,
            stagger: 0.07,
            scrollTrigger: { trigger: panel, containerAnimation: scroll, start: "left 60%", once: true },
          })
        }
        panel.querySelectorAll<HTMLElement>("[data-count]").forEach((c) =>
          ScrollTrigger.create({ trigger: panel, containerAnimation: scroll, start: "left 55%", once: true, onEnter: () => countUp(c) }),
        )
      })
    })
    return () => mm.revert()
  }, [])

  return (
    <div ref={root} data-hpin className={className}>
      {children}
    </div>
  )
}
