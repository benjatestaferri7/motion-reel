"use client"

// ──────────────────────────────────────────────────────────────────────────
// Leader — 3·2·1 film-leader countdown (≤1.1s), once per browser session.
//
// Non-blocking by design:
// - Timed entirely in CSS (leader.css), so it plays before hydration.
// - pointer-events: none on the overlay → the page is scrollable underneath.
// - Any wheel / touch / key / pointer input skips it immediately.
// - Hidden before first paint for reduced motion and repeat visits by the
//   inline boot script below (no flash of the leader on navigation).
//
// Usage
//   <head><script dangerouslySetInnerHTML={{ __html: leaderBootScript() }} /></head>
//   <body><Leader title="BRAND · THE REEL" /> …</body>
// Other islands can wait for it: isLeaderPlaying() + LEADER_END_EVENT.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react"

export const LEADER_END_EVENT = "reel:leader-end"
const DEFAULT_KEY = "reel-leader"

/**
 * Inline <head> script. Adds `.reel-js` when motion is allowed (gates
 * [data-intro] reveals, see tokens.css) and `.reel-leader-seen` for reduced
 * motion or a repeat visit this session.
 */
export function leaderBootScript(storageKey = DEFAULT_KEY) {
  const k = JSON.stringify(storageKey)
  return `(function(){try{var d=document.documentElement;var r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(!r)d.classList.add('reel-js');if(r||sessionStorage.getItem(${k}))d.classList.add('reel-leader-seen')}catch(e){}})();`
}

export function isLeaderPlaying() {
  if (typeof document === "undefined") return false
  const el = document.querySelector(".leader")
  return !!el && !document.documentElement.classList.contains("reel-leader-seen")
}

export function Leader({
  title = "BRAND · THE REEL",
  storageKey = DEFAULT_KEY,
  durationMs = 1080,
}: {
  title?: string
  storageKey?: string
  durationMs?: number
}) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (root.classList.contains("reel-leader-seen")) {
      setDone(true)
      return
    }
    try {
      sessionStorage.setItem(storageKey, "1")
    } catch {}

    let finished = false
    const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const
    const remove = () => {
      window.clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, finish))
    }
    const finish = () => {
      if (finished) return
      finished = true
      root.classList.add("reel-leader-seen")
      setDone(true)
      window.dispatchEvent(new Event(LEADER_END_EVENT))
      remove()
    }
    const timer = window.setTimeout(finish, durationMs)
    events.forEach((ev) => window.addEventListener(ev, finish, { passive: true }))
    return remove
  }, [storageKey, durationMs])

  if (done) return null

  return (
    <div className="leader" role="presentation">
      <div className="leader__dial" aria-hidden="true">
        <span className="leader__sweep" />
        <span className="leader__cross leader__cross--h" />
        <span className="leader__cross leader__cross--v" />
        <span className="leader__hand" />
        <span className="leader__nums display">
          <span className="leader__num">3</span>
          <span className="leader__num">2</span>
          <span className="leader__num">1</span>
        </span>
      </div>
      <span aria-hidden="true" className="hud leader__meta leader__meta--tl">
        {title}
      </span>
      <span aria-hidden="true" className="hud leader__meta leader__meta--bl">
        Leader · 00:00:00:00
      </span>
      {/* Keyboard users get a real control; any key also skips. */}
      <button
        type="button"
        className="hud leader__skip"
        onClick={() => window.dispatchEvent(new Event("pointerdown"))}
      >
        Skip intro →
      </button>
    </div>
  )
}
