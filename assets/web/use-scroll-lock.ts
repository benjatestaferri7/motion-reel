"use client"

// ──────────────────────────────────────────────────────────────────────────
// useScrollLock — lock page scroll while a mobile menu / modal is open.
//
// Lenis is ABSENT under reduced motion (see smooth-scroll.tsx), so stopping
// Lenis alone leaves native scroll unlocked for exactly the users who most
// need a stable page. Always pair lenis.stop() with a body overflow fallback.
//
// Also: when a menu link closes the menu AND scrolls to an anchor, close
// first, then scroll on a deferred tick (~180ms). Scrolling in the same
// handler as the close re-render gets cancelled by lenis.start()/layout.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect } from "react"
import { getLenis } from "./smooth-scroll"

export function useScrollLock(locked: boolean) {
  useEffect(() => {
    const lenis = getLenis()
    if (locked) lenis?.stop()
    else lenis?.start()
    const prev = document.body.style.overflow
    if (locked) document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
      if (locked) lenis?.start()
    }
  }, [locked])
}

/** Close a menu, then scroll once the close render has settled. */
export function closeThenScroll(close: () => void, scroll: () => void, delay = 180) {
  close()
  window.setTimeout(scroll, delay)
}
