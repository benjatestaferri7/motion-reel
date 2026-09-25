"use client"

// ──────────────────────────────────────────────────────────────────────────
// SmoothScroll — Lenis momentum scroll driven by GSAP's ticker, so
// ScrollTrigger pins/scrubs stay frame-locked with the scroll position.
//
// Props
//   children   page content (the provider renders no wrapper element)
//   routeKey   pass your router's pathname so hash landing re-runs per route
//              (Next: usePathname(); React Router: useLocation().pathname)
//
// Exports
//   getLenis()           current instance or null (null under reduced motion)
//   scrollToId(id, opt)  anchor jump that works with AND without Lenis
//
// Notes
// - Reduced motion → Lenis is never created; native scroll everywhere.
//   Anything that calls lenis.stop() MUST also handle the null case
//   (see use-scroll-lock.ts).
// - No hacks: no scroll-behavior overrides, no wheel listeners, no
//   `html { height: auto }` tricks. Lenis owns wheel/touch, the browser owns
//   keyboard + assistive tech scrolling.
// - Hash landing waits for document.fonts.ready + one ScrollTrigger.refresh
//   so pins have inserted their spacers before we measure the target.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect } from "react"
import Lenis from "lenis"
import { gsap, ScrollTrigger, prefersReducedMotion } from "./gsap-setup"

let lenisInstance: Lenis | null = null

export function getLenis(): Lenis | null {
  return lenisInstance
}

/** Scroll to a section id (or to the top when id is empty). */
export function scrollToId(id: string | null, opts: { immediate?: boolean } = {}) {
  const lenis = lenisInstance
  if (!id) {
    if (lenis) lenis.scrollTo(0, { immediate: opts.immediate })
    else window.scrollTo({ top: 0, behavior: "auto" })
    return
  }
  const target = document.getElementById(id)
  if (!target) return
  if (lenis) {
    lenis.resize() // pins may have changed the document height since init
    lenis.scrollTo(target, { immediate: opts.immediate, force: true })
  } else {
    target.scrollIntoView({ block: "start" })
  }
}

export function SmoothScroll({ children, routeKey }: { children: React.ReactNode; routeKey?: string }) {
  useEffect(() => {
    if (prefersReducedMotion()) return

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    })
    lenisInstance = lenis
    lenis.on("scroll", ScrollTrigger.update)

    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
      lenisInstance = null
    }
  }, [])

  // Hash landing (/#section on hard load or client navigation).
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    let cancelled = false
    let raf = 0
    const ready = document.fonts?.ready ?? Promise.resolve()
    ready.then(() => {
      if (cancelled) return
      raf = requestAnimationFrame(() => {
        ScrollTrigger.refresh()
        if (hash) scrollToId(decodeURIComponent(hash), { immediate: true })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [routeKey])

  return <>{children}</>
}
