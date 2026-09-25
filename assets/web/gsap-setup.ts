"use client"

// ──────────────────────────────────────────────────────────────────────────
// gsap-setup — the ONE place GSAP plugins are registered.
// Every motion island imports gsap / ScrollTrigger / MQ from here so plugin
// registration happens once and media queries stay consistent with CSS.
//
// Rules of thumb
// - Wrap every island's setup in `gsap.matchMedia()` and return `mm.revert()`
//   from the effect cleanup: it kills tweens, ScrollTriggers AND inline styles
//   (StrictMode double-mount safe).
// - Pins / horizontal reels only under MQ.pinnable (≥1024px + motion allowed).
// - Keep MQ in sync with `.only-motion-desktop` in tokens.css.
// ──────────────────────────────────────────────────────────────────────────

import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger)
}

export { gsap, ScrollTrigger }

/** Breakpoint + preference queries shared with gsap.matchMedia(). */
export const MQ = {
  motion: "(prefers-reduced-motion: no-preference)",
  reduce: "(prefers-reduced-motion: reduce)",
  desktop: "(min-width: 1024px)",
  mobile: "(max-width: 767px)",
  /** Pins and horizontal scrubs exist only here. */
  pinnable: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
} as const

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MQ.reduce).matches
}

/** Easing vocabulary: slide in, pop, drop. Everything else is linear scrub. */
export const EASE = {
  slide: "expo.out",
  pop: "back.out(1.7)",
  drop: "bounce.out",
  cut: "expo.inOut",
} as const

/** Beat math for scroll-timed HUDs (reel is "played" by scrolling). */
const BPM = 128
const BEATS = 64
export const BEAT = {
  bpm: BPM,
  beats: BEATS,
  /** 64 beats at 128 BPM = 30s; the HUD maps scroll progress onto this. */
  seconds: (BEATS * 60) / BPM,
} as const
