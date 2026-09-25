"use client"

// ──────────────────────────────────────────────────────────────────────────
// GraphEditor — an animation-curve UI (After Effects graph editor vibes).
// A bezier curve with flat keyframe handles draws itself on scroll, an
// action-colored dot rides it, a playhead tracks it with a frame counter,
// and the step panel swaps as the dot crosses each keyframe.
//
// Props
//   steps     { label: string; title: string; meta?: string; body: string }[]
//             (2–6 steps; keyframes are spaced evenly)
//   frames    frame count shown on the playhead (default 720)
//   title     panel title (default "Graph editor — curve.ease")
//   children  optional heading rendered above the graph
//
// Behavior
// - ≥1024px + motion: section is pinned for 300% and scrubbed (MQ.pinnable).
// - Mobile + motion: the curve draws while scrolling past, no pin.
// - Reduced motion: final frame, all steps visible in the server list.
//
// A11y: the graph and swapping panel are aria-hidden; ALWAYS render the full
// step list as real, static markup next to this island (e.g. an <ol> that is
// visible on mobile and `.sr-only` on motion desktop).
// Colors: currentColor (the field's --reel-on-<field>) + --reel-action.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, MQ, EASE } from "./gsap-setup"

export type GraphStep = { label: string; title: string; meta?: string; body: string }

const VW = 1000
const VH = 560
const START = { x: 40, y: 510 }
const END = { x: 980, y: 50 }
const ACTION = "rgb(var(--reel-action))"
const ON_ACTION = "rgb(var(--reel-on-action))"
const dim = (pct: number) => `color-mix(in srgb, currentColor ${pct}%, transparent)`

function layout(n: number) {
  const kx = Array.from({ length: n }, (_, i) => 180 + (i * (880 - 180)) / Math.max(1, n - 1))
  const ky = kx.map((x) => START.y - ((x - START.x) / (END.x - START.x)) ** 1.35 * (START.y - END.y) * 0.9)
  const pts = [START, ...kx.map((x, i) => ({ x, y: ky[i] })), END]
  let d = `M${START.x} ${START.y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const h = (b.x - a.x) * 0.5 // flat handles: ease-in-out between every keyframe
    d += ` C${a.x + h} ${a.y} ${b.x - h} ${b.y} ${b.x} ${b.y}`
  }
  return { kx, ky, d }
}

export function GraphEditor({
  steps,
  frames = 720,
  title = "Graph editor — curve.ease",
  children,
}: {
  steps: GraphStep[]
  frames?: number
  title?: string
  children?: React.ReactNode
}) {
  const { kx, ky, d } = layout(steps.length)
  const root = useRef<HTMLDivElement>(null)
  const curveRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<SVGGElement>(null)
  const headRef = useRef<SVGGElement>(null)
  const frameRef = useRef<SVGTextElement>(null)
  const readRef = useRef<HTMLSpanElement>(null)
  const counterRef = useRef<HTMLSpanElement>(null)
  const panelsRef = useRef<(HTMLDivElement | null)[]>([])
  const key = steps.map((s) => s.label).join("|")

  useEffect(() => {
    const el = root.current
    const curve = curveRef.current
    if (!el || !curve) return
    const L = curve.getTotalLength()
    curve.style.strokeDasharray = `${L}`
    let active = -1
    const pad = (n: number, w: number) => String(n).padStart(w, "0")

    const setActive = (idx: number, animate: boolean) => {
      if (idx === active) return
      const prev = active
      active = idx
      if (counterRef.current) counterRef.current.textContent = `${pad(idx + 1, 2)} / ${pad(steps.length, 2)}`
      panelsRef.current.forEach((p, i) => {
        if (!p) return
        if (!animate) gsap.set(p, { autoAlpha: i === idx ? 1 : 0, y: 0 })
        else if (i === idx) gsap.fromTo(p, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: EASE.slide, overwrite: true })
        else if (i === prev) gsap.to(p, { autoAlpha: 0, y: -20, duration: 0.3, ease: "power2.in", overwrite: true })
        else gsap.set(p, { autoAlpha: 0 })
      })
    }

    const render = (p: number, animate = true) => {
      const len = L * p
      curve.style.strokeDashoffset = `${L - len}`
      const pt = curve.getPointAtLength(len)
      dotRef.current?.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`)
      headRef.current?.setAttribute("transform", `translate(${pt.x.toFixed(1)} 0)`)
      const f = Math.round(p * frames)
      if (frameRef.current) frameRef.current.textContent = pad(f, 4)
      const value = Math.round(((START.y - pt.y) / (START.y - END.y)) * 100)
      if (readRef.current) readRef.current.textContent = `Frame ${pad(f, 4)} · Value ${pad(value, 3)}%`
      setActive(Math.max(0, kx.filter((x) => pt.x >= x - 12).length - 1), animate)
    }

    const mm = gsap.matchMedia()
    mm.add({ pinnable: MQ.pinnable, motion: MQ.motion }, (ctx) => {
      const { pinnable, motion } = ctx.conditions as { pinnable: boolean; motion: boolean }
      if (!motion) {
        render(1, false)
        return
      }
      const proxy = { p: 0 }
      render(0, false)
      gsap.to(proxy, {
        p: 1,
        ease: "none",
        onUpdate: () => render(proxy.p),
        scrollTrigger: pinnable
          ? { trigger: el, start: "top top", end: "+=300%", pin: true, scrub: 0.6, anticipatePin: 1 }
          : { trigger: curve, start: "top 85%", end: "bottom 35%", scrub: 0.6 },
      })
    })
    return () => mm.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frames])

  return (
    <div ref={root} style={{ display: "flex", flexDirection: "column", minHeight: "100svh", padding: "calc(var(--nav-h) + 1.5rem) clamp(1rem, 3vw, 2.5rem) 2rem" }}>
      {children}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem", alignItems: "center", flex: 1 }}>
        <figure aria-hidden="true" style={{ margin: 0, minWidth: 0, flex: "2 1 min(100%, 36rem)", border: `1px solid ${dim(25)}` }}>
          <div className="hud" style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem", borderBottom: `1px solid ${dim(20)}`, opacity: 0.75 }}>
            <span>{title}</span>
            <span>◆ Key · ⌇ Bezier · ● Value</span>
          </div>
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{ display: "block", width: "100%", height: "auto", maxHeight: "48svh", fontFamily: "var(--reel-font-mono)" }}>
            {Array.from({ length: VW / 40 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={VH} style={{ stroke: dim(7) }} />
            ))}
            {Array.from({ length: VH / 40 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 40} x2={VW} y2={i * 40} style={{ stroke: dim(7) }} />
            ))}
            {Array.from({ length: 10 }).map((_, i) => (
              <text key={`r${i}`} x={START.x + i * 104} y={22} fontSize={13} style={{ fill: dim(55) }}>
                {Math.round((i * frames) / 9)}
              </text>
            ))}
            {kx.map((x, i) => (
              <g key={`c${i}`}>
                <line x1={x} y1={34} x2={x} y2={VH - 34} strokeDasharray="3 6" style={{ stroke: dim(18) }} />
                <text x={x} y={VH - 12} fontSize={16} textAnchor="middle" letterSpacing={2} style={{ fill: "currentColor" }}>
                  {steps[i]?.label.toUpperCase()}
                </text>
              </g>
            ))}
            <path d={d} fill="none" strokeWidth={3} strokeDasharray="2 8" style={{ stroke: dim(14) }} />
            <path ref={curveRef} d={d} fill="none" strokeWidth={4} style={{ stroke: "currentColor" }} />
            {kx.map((x, i) => (
              <g key={`k${i}`}>
                <line x1={x - 70} y1={ky[i]} x2={x + 70} y2={ky[i]} strokeWidth={1.5} style={{ stroke: dim(45) }} />
                <circle cx={x - 70} cy={ky[i]} r={6} strokeWidth={1.5} style={{ fill: "none", stroke: "currentColor" }} />
                <circle cx={x + 70} cy={ky[i]} r={6} strokeWidth={1.5} style={{ fill: "none", stroke: "currentColor" }} />
                <rect x={x - 8} y={ky[i] - 8} width={16} height={16} transform={`rotate(45 ${x} ${ky[i]})`} style={{ fill: "currentColor" }} />
              </g>
            ))}
            <g ref={headRef} transform={`translate(${END.x} 0)`}>
              <line x1={0} y1={30} x2={0} y2={VH - 34} strokeWidth={2} style={{ stroke: ACTION }} />
              <rect x={-26} y={4} width={52} height={24} style={{ fill: ACTION }} />
              <text ref={frameRef} x={0} y={21} fontSize={14} textAnchor="middle" style={{ fill: ON_ACTION }}>
                {String(frames).padStart(4, "0")}
              </text>
            </g>
            <g ref={dotRef} transform={`translate(${END.x} ${END.y})`}>
              <circle r={22} fill="none" strokeOpacity={0.5} strokeWidth={2} style={{ stroke: ACTION }} />
              <circle r={11} strokeWidth={2.5} style={{ fill: ACTION, stroke: "currentColor" }} />
            </g>
          </svg>
          <div className="hud" style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem", borderTop: `1px solid ${dim(20)}`, opacity: 0.75 }}>
            <span ref={readRef}>Frame {String(frames).padStart(4, "0")} · Value 100%</span>
            <span>60 FPS</span>
          </div>
        </figure>

        {/* Swapping panel: motion desktop only. The static list is YOUR server markup. */}
        <div aria-hidden="true" className="only-motion-desktop" style={{ flex: "1 1 18rem" }}>
          <div className="hud" style={{ display: "flex", justifyContent: "space-between", paddingBottom: "0.75rem", borderBottom: `1px solid ${dim(20)}` }}>
            <span>Keyframe</span>
            <span ref={counterRef}>01 / {String(steps.length).padStart(2, "0")}</span>
          </div>
          <div style={{ position: "relative", marginTop: "2rem", minHeight: 300 }}>
            {steps.map((st, i) => (
              <div
                key={st.label}
                ref={(node) => {
                  panelsRef.current[i] = node
                }}
                style={{ position: "absolute", inset: 0, visibility: i === 0 ? "visible" : "hidden" }}
              >
                {st.meta && <p className="hud" style={{ opacity: 0.75 }}>{st.meta}</p>}
                <p className="display" style={{ marginTop: "0.75rem", fontSize: "clamp(2rem, 3.4vw, 3.4rem)", lineHeight: 0.92 }}>
                  {st.title}
                </p>
                <p style={{ marginTop: "1.25rem", lineHeight: 1.6, opacity: 0.8 }}>{st.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
