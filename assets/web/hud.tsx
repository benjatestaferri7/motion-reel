"use client"

// ──────────────────────────────────────────────────────────────────────────
// Hud — fixed viewfinder overlay: crop marks in the four corners, live scene
// label, format label, timecode and BEAT NN/64 derived from scroll progress,
// plus a scrubber with one tick per scene. The page is "played" by scrolling.
//
// Props
//   sceneCount   total number of scenes (for "SCENE 03/10")
//   seconds      reel length the scroll maps onto (default 30 = 64 beats @128)
//   fps          timecode frame rate (default 60)
//   beats        beat count (default 64)
//   format       top-right label (default "1920×1080 · 60FPS · 16:9")
//   mode         "field" (default): HUD color follows the field under the
//                viewport middle via --reel-hud-on-<field> tokens
//                "difference": mix-blend-mode difference (decorative only)
//
// Reads scenes from the DOM:
//   <section data-scene="3" data-scene-name="WORK" data-tone="machine">
// (use <Scene> from scene.tsx). CSS lives in tokens.css (.reel-hud*).
//
// Perf / a11y
// - aria-hidden: purely decorative. All updates are direct DOM writes from a
//   single ScrollTrigger; React never re-renders on scroll.
// - Scene offsets are cached and re-measured on every ScrollTrigger refresh
//   (pins move sections), not per scroll event.
// - Why "field" mode: difference blend over a saturated field inverts to an
//   unpredictable hue (a hot red field turns the HUD cyan) and thin mono text
//   gets muddy. Per-field tokens are palette-checked. Keep the NAV solid too.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, ScrollTrigger } from "./gsap-setup"

const p2 = (n: number) => String(Math.floor(n)).padStart(2, "0")

function timecode(progress: number, seconds: number, fps: number) {
  const t = progress * seconds
  return `00:${p2(t / 60)}:${p2(t % 60)}:${p2((t % 1) * fps)}`
}

export type HudProps = {
  sceneCount: number
  seconds?: number
  fps?: number
  beats?: number
  format?: string
  mode?: "field" | "difference"
}

export function Hud({
  sceneCount,
  seconds = 30,
  fps = 60,
  beats = 64,
  format = "1920×1080 · 60FPS · 16:9",
  mode = "field",
}: HudProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLSpanElement>(null)
  const tcRef = useRef<HTMLSpanElement>(null)
  const beatRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const headRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const sections = gsap.utils.toArray<HTMLElement>("[data-scene]")
    let starts: number[] = []
    let current = ""
    let lastBeat = 0

    const measure = () => {
      starts = sections.map((el) => el.getBoundingClientRect().top + window.scrollY)
    }
    const updateScene = () => {
      const probe = window.scrollY + window.innerHeight * 0.5
      let i = 0
      for (let k = 0; k < starts.length; k++) if (starts[k] <= probe) i = k
      const el = sections[i]
      const field = el?.dataset.tone ?? "ink"
      if (rootRef.current && rootRef.current.dataset.field !== field) rootRef.current.dataset.field = field
      const label = el
        ? `SCENE ${p2(Number(el.dataset.scene ?? i + 1))}/${p2(sceneCount)} — ${el.dataset.sceneName ?? ""}`
        : `SCENE 01/${p2(sceneCount)}`
      if (label !== current && sceneRef.current) {
        current = label
        sceneRef.current.textContent = label
      }
    }

    ScrollTrigger.addEventListener("refresh", measure)
    measure()

    const st = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        const p = self.progress
        if (tcRef.current) tcRef.current.textContent = `TC ${timecode(p, seconds, fps)}`
        const beat = Math.min(beats, Math.floor(p * beats) + 1)
        if (beat !== lastBeat) {
          lastBeat = beat
          if (beatRef.current) beatRef.current.textContent = `BEAT ${p2(beat)}/${beats}`
          dotRef.current?.animate([{ opacity: 1 }, { opacity: 0.15 }], { duration: 260 })
        }
        if (headRef.current) headRef.current.style.transform = `scaleX(${p})`
        updateScene()
      },
    })
    updateScene()

    return () => {
      ScrollTrigger.removeEventListener("refresh", measure)
      st.kill()
    }
  }, [sceneCount, seconds, fps, beats])

  const inset = "clamp(0.75rem, 2vw, 1.5rem)"
  const labelInset = "clamp(2.25rem, 3.5vw, 3rem)"
  const corner = (pos: React.CSSProperties, edges: React.CSSProperties) => (
    <span className="reel-hud__corner" style={{ ...pos, ...edges }} />
  )
  const b = "1px"

  return (
    <div ref={rootRef} aria-hidden="true" data-field="ink" className={`reel-hud${mode === "difference" ? " reel-hud--difference" : ""}`}>
      {corner({ left: inset, top: inset }, { borderLeftWidth: b, borderTopWidth: b })}
      {corner({ right: inset, top: inset }, { borderRightWidth: b, borderTopWidth: b })}
      {corner({ left: inset, bottom: inset }, { borderLeftWidth: b, borderBottomWidth: b })}
      {corner({ right: inset, bottom: inset }, { borderRightWidth: b, borderBottomWidth: b })}

      <span className="reel-hud__label hud" style={{ left: labelInset, top: inset }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, background: "currentColor" }} />
        <span ref={sceneRef}>SCENE 01/{p2(sceneCount)}</span>
      </span>
      <span className="reel-hud__label hud" style={{ right: labelInset, top: inset }}>
        {format}
      </span>
      <span
        ref={tcRef}
        className="reel-hud__label hud"
        style={{ left: labelInset, bottom: inset, fontVariantNumeric: "tabular-nums" }}
      >
        TC 00:00:00:00
      </span>
      <span
        className="reel-hud__label hud"
        style={{ right: labelInset, bottom: inset, fontVariantNumeric: "tabular-nums" }}
      >
        <span ref={dotRef} style={{ width: 6, height: 6, background: "currentColor" }} />
        <span ref={beatRef}>BEAT 01/{beats}</span>
      </span>

      {/* Scrubber: the only HUD element on phones (a hairline progress bar). */}
      <span className="reel-hud__bar">
        <span
          ref={headRef}
          style={{
            position: "absolute",
            inset: 0,
            background: "currentColor",
            transformOrigin: "left",
            transform: "scaleX(0)",
          }}
        />
      </span>
    </div>
  )
}
