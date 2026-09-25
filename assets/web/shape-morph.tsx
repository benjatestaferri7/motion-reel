"use client"

// ──────────────────────────────────────────────────────────────────────────
// ShapeMorph — sticky SVG shape that morphs through `shapes` as a list
// scrolls by (one shape per list item), with two outline echoes trailing
// behind (onion-skinning, like a motion editor). Flags the active item with
// [data-active] so CSS can highlight it (e.g. `group-data-[active]:…`).
//
// Props
//   shapes       ShapeName[] — one per item (≥ 2)
//   listId       id of the element containing the items
//   itemSelector items inside the list (default "[data-morph-item]")
//   fill/stroke  CSS colors (default --reel-action fill, currentColor stroke —
//                i.e. the field's --reel-on-<field> text color)
//
// Put it in a sticky column (desktop), e.g.
//   <div style={{position:"sticky", top:"var(--nav-h)", height:"calc(100svh - var(--nav-h))"}}>
//     <ShapeMorph shapes={[...]} listId="services" />
//   </div>
// On mobile render static icons with shapePoints()/toPath() instead.
//
// Perf: SVG path `d` string rebuilt per scrub update from preallocated
// Float32Arrays (144 pts) — cheap. Reduced motion: instant swaps per item,
// no tweening.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { gsap, ScrollTrigger, MQ } from "./gsap-setup"
import { MORPH_POINTS, lerpPts, shapePoints, toPath, type Pts, type ShapeName } from "./shapes"

const SIZE = 400
const C = SIZE / 2
const R = 132

/** Hold each shape, then morph through the middle of the gap. */
const holdThenMorph = (t: number) => {
  const x = Math.min(1, Math.max(0, (t - 0.28) / 0.44))
  return x * x * (3 - 2 * x)
}

export function ShapeMorph({
  shapes,
  listId,
  itemSelector = "[data-morph-item]",
  fill = "rgb(var(--reel-action))",
  stroke = "currentColor",
}: {
  shapes: ShapeName[]
  listId: string
  itemSelector?: string
  fill?: string
  stroke?: string
}) {
  const mainRef = useRef<SVGPathElement>(null)
  const echo1Ref = useRef<SVGPathElement>(null)
  const echo2Ref = useRef<SVGPathElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const indexRef = useRef<HTMLSpanElement>(null)
  const key = shapes.join(",")

  useEffect(() => {
    const list = document.getElementById(listId)
    if (!list || shapes.length < 2) return
    const items = Array.from(list.querySelectorAll<HTMLElement>(itemSelector))
    const geo = shapes.map((s) => shapePoints(s))
    const count = geo.length
    const scratch: Pts[] = [0, 1, 2].map(() => new Float32Array(MORPH_POINTS * 2))
    let active = -1

    const at = (p: number, out: Pts) => {
      const raw = Math.min(count - 1, Math.max(0, p * (count - 1)))
      const i = Math.min(count - 2, Math.floor(raw))
      return lerpPts(geo[i], geo[i + 1], holdThenMorph(raw - i), out)
    }
    const setActive = (idx: number) => {
      if (idx === active) return
      active = idx
      items.forEach((el, k) => el.toggleAttribute("data-active", k === idx))
      if (nameRef.current) nameRef.current.textContent = shapes[idx].toUpperCase()
      if (indexRef.current) indexRef.current.textContent = `${String(idx + 1).padStart(2, "0")}/${String(count).padStart(2, "0")}`
    }
    const render = (p: number) => {
      mainRef.current?.setAttribute("d", toPath(at(p, scratch[0]), C, R))
      echo1Ref.current?.setAttribute("d", toPath(at(Math.max(0, p - 0.025), scratch[1]), C, R * 1.1))
      echo2Ref.current?.setAttribute("d", toPath(at(Math.max(0, p - 0.05), scratch[2]), C, R * 1.22))
      groupRef.current?.setAttribute("transform", `rotate(${(p * 180).toFixed(2)} ${C} ${C})`)
      setActive(Math.round(p * (count - 1)))
    }

    render(0)
    const mm = gsap.matchMedia()
    mm.add({ motion: MQ.motion, reduce: MQ.reduce }, (ctx) => {
      const { motion } = ctx.conditions as { motion: boolean }
      if (motion) {
        const proxy = { p: 0 }
        gsap.to(proxy, {
          p: 1,
          ease: "none",
          onUpdate: () => render(proxy.p),
          scrollTrigger: { trigger: list, start: "top 55%", end: "bottom 55%", scrub: 0.5 },
        })
      } else {
        items.forEach((el, k) =>
          ScrollTrigger.create({
            trigger: el,
            start: "top 55%",
            end: "bottom 55%",
            onToggle: (self) => self.isActive && render(k / (count - 1)),
          }),
        )
      }
    })
    return () => mm.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, listId, itemSelector])

  const initial = toPath(shapePoints(shapes[0]), C, R)
  const faint = "color-mix(in srgb, currentColor 10%, transparent)"

  return (
    <figure aria-hidden="true" style={{ position: "relative", width: "100%", maxWidth: 520, margin: 0 }}>
      <div className="hud" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, opacity: 0.7 }}>
        <span>
          Shape <span ref={indexRef}>01/{String(shapes.length).padStart(2, "0")}</span>
        </span>
        <span>
          <span ref={nameRef}>{shapes[0].toUpperCase()}</span> · VTX {MORPH_POINTS}
        </span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block", width: "100%", height: "auto", border: `1px solid ${faint}` }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <g key={i} style={{ stroke: faint }}>
            <line x1={(i + 1) * 40} y1={0} x2={(i + 1) * 40} y2={SIZE} />
            <line x1={0} y1={(i + 1) * 40} x2={SIZE} y2={(i + 1) * 40} />
          </g>
        ))}
        <g ref={groupRef}>
          <path ref={echo2Ref} d={initial} style={{ fill: "none", stroke, strokeOpacity: 0.25, strokeWidth: 1 }} />
          <path ref={echo1Ref} d={initial} style={{ fill: "none", stroke, strokeOpacity: 0.5, strokeWidth: 1.5 }} />
          <path ref={mainRef} d={initial} style={{ fill, stroke, strokeWidth: 2 }} />
        </g>
        <circle cx={C} cy={C} r={4} style={{ fill: stroke }} />
      </svg>
      <div className="hud" style={{ display: "flex", justifyContent: "space-between", marginTop: 12, opacity: 0.7 }}>
        <span>Morph · perimeter resample</span>
        <span>Scrub · 0.5</span>
      </div>
    </figure>
  )
}
