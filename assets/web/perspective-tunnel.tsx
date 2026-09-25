"use client"

// ──────────────────────────────────────────────────────────────────────────
// PerspectiveTunnel — faux-3D tunnel: nested rotating squares projected with
// a hand-rolled pinhole camera (screen = f / z), plus optional "plates"
// (labels and/or logo images) flying through toward the viewer. Scroll
// velocity (Lenis) boosts flight speed; the pointer nudges the vanishing point.
//
// Mount inside a positioned host (canvas fills it), usually a full-bleed
// ink field with the heading layered on top:
//   <section className="tone-ink" style={{position:"relative", minHeight:"100svh"}}>
//     <PerspectiveTunnel items={[{ label: "TYPESCRIPT" }, { label: "POSTGRES", logo: "/logos/pg.svg" }]} />
//     <h2 className="display" style={{position:"relative"}}>THE STACK</h2>
//   </section>
//
// Props
//   items    plates: { label: string; logo?: string } (logo = same-origin URL)
//   depth    world depth in units (default 24)
//   dprCap   devicePixelRatio cap (default 1.5)
//
// Colors: lines use the host's computed `color` (→ --reel-on-<field>), every
// 7th square and the vanishing point use --reel-action, plates use
// --reel-bone with --reel-on-bone text. No hardcoded hex.
//
// Perf: lazy — images load and the loop starts only when the host is near
// the viewport (IO rootMargin 200px); loop stops offscreen / hidden tab.
// Painter's sort by z each frame (≤ ~40 items: trivial).
// A11y: aria-hidden decorative canvas; list the items as real text nearby.
// Reduced motion: a single still frame.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { prefersReducedMotion } from "./gsap-setup"
import { getLenis } from "./smooth-scroll"

type Item = { label: string; logo?: string }
type Plate = { label: string; img: HTMLImageElement | null; aspect: number; angle: number; z: number }

/** "rgb(1, 2, 3)" | "1 2 3" → "1 2 3" (space-separated channels for CSS Color 4 rgb()). */
function channels(color: string, fallback = "255 255 255") {
  const m = color.match(/[\d.]+/g)
  return m && m.length >= 3 ? `${m[0]} ${m[1]} ${m[2]}` : fallback
}
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function PerspectiveTunnel({ items = [], depth = 24, dprCap = 1.5 }: { items?: Item[]; depth?: number; dprCap?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const key = items.map((i) => i.label + (i.logo ?? "")).join("|")

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext("2d")
    if (!canvas || !host || !ctx) return
    const reduce = prefersReducedMotion()

    const LINE = channels(getComputedStyle(host).color)
    const ACTION = channels(cssVar("--reel-action"), "255 0 0")
    const PLATE = channels(cssVar("--reel-bone"), "255 255 255")
    const ON_PLATE = channels(cssVar("--reel-on-bone"), "0 0 0")
    const MONO = cssVar("--reel-font-mono") || "monospace"

    let W = 0, H = 0, dpr = 1, squares = 0, travel = 0, last = 0, raf = 0
    let running = false, inView = false, initialized = false, destroyed = false
    let plates: Plate[] = []
    const vp = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }

    const resize = () => {
      const r = host.getBoundingClientRect()
      W = r.width
      H = r.height
      dpr = Math.min(dprCap, window.devicePixelRatio || 1)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      squares = W < 768 ? 14 : 22
    }

    const init = () => {
      if (initialized) return
      initialized = true
      resize()
      plates = items.map((it, i) => {
        const plate: Plate = { label: it.label, img: null, aspect: 2.6, angle: i * 2.39996, z: (i / Math.max(1, items.length)) * depth }
        if (it.logo) {
          const img = new Image()
          img.decoding = "async"
          img.src = encodeURI(it.logo)
          img.onload = () => {
            if (img.naturalWidth && img.naturalHeight) plate.aspect = img.naturalWidth / img.naturalHeight
            if (reduce) frame(0)
          }
          plate.img = img
        }
        return plate
      })
    }

    const frame = (dt: number) => {
      const lenis = getLenis()
      const boost = lenis ? Math.min(12, Math.abs(lenis.velocity)) : 0
      travel = (travel + dt * (0.0011 + boost * 0.0009)) % depth
      vp.x += (vp.tx - vp.x) * 0.05
      vp.y += (vp.ty - vp.y) * 0.05

      const f = Math.min(W, H) * 0.62
      const cx = W * (0.5 + (vp.x - 0.5) * 0.12)
      const cy = H * (0.5 + (vp.y - 0.5) * 0.12)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const queue: { z: number; draw: () => void }[] = []
      const gap = depth / squares
      for (let k = 0; k < squares; k++) {
        const z = (((k * gap - travel) % depth) + depth) % depth
        if (z < 0.35) continue
        const half = 1.35 * (f / z)
        const rot = z * 0.16 + travel * 0.05
        const fade = Math.min(1, (depth - z) / (depth * 0.55)) * Math.min(1, (z - 0.35) * 1.5)
        const accent = k % 7 === 0
        queue.push({
          z,
          draw: () => {
            ctx.save()
            ctx.translate(cx, cy)
            ctx.rotate(rot)
            ctx.strokeStyle = accent ? `rgb(${ACTION} / ${fade})` : `rgb(${LINE} / ${fade * 0.42})`
            ctx.lineWidth = accent ? 2 : 1
            ctx.strokeRect(-half, -half, half * 2, half * 2)
            ctx.restore()
          },
        })
      }
      for (const p of plates) {
        const z = (((p.z - travel) % depth) + depth) % depth
        if (z < 0.5) continue
        const scale = f / z
        const ang = p.angle + z * 0.16
        const x = cx + Math.cos(ang) * 0.82 * scale
        const y = cy + Math.sin(ang) * 0.82 * scale
        const w = 0.5 * scale
        const h = w * 0.46
        const fade = Math.min(1, (depth - z) / (depth * 0.5)) * Math.min(1, (z - 0.5) * 1.2)
        queue.push({
          z,
          draw: () => {
            ctx.globalAlpha = fade
            ctx.fillStyle = `rgb(${PLATE})`
            ctx.fillRect(x - w / 2, y - h / 2, w, h)
            const pad = h * 0.2
            if (p.img?.complete && p.img.naturalWidth) {
              let iw = w - pad * 2
              let ih = iw / p.aspect
              if (ih > h - pad * 2) {
                ih = h - pad * 2
                iw = ih * p.aspect
              }
              ctx.drawImage(p.img, x - iw / 2, y - ih / 2, iw, ih)
            } else {
              ctx.fillStyle = `rgb(${ON_PLATE})`
              ctx.font = `700 ${Math.max(6, h * 0.28)}px ${MONO}`
              ctx.textAlign = "center"
              ctx.textBaseline = "middle"
              ctx.fillText(p.label, x, y, w - pad * 2)
            }
            ctx.globalAlpha = 1
          },
        })
      }
      queue.sort((a, b) => b.z - a.z)
      for (const q of queue) q.draw()
      ctx.fillStyle = `rgb(${ACTION})` // vanishing point
      ctx.fillRect(cx - 3, cy - 3, 6, 6)
    }

    const loop = (t: number) => {
      if (!running) return
      const dt = last ? Math.min(50, t - last) : 16
      last = t
      frame(dt)
      raf = requestAnimationFrame(loop)
    }
    const setRunning = () => {
      const should = inView && !document.hidden && !reduce && !destroyed
      if (should && !running) {
        running = true
        last = 0
        raf = requestAnimationFrame(loop)
      } else if (!should && running) {
        running = false
        cancelAnimationFrame(raf)
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        if (inView) {
          init()
          if (reduce) frame(0)
        }
        setRunning()
      },
      { rootMargin: "200px 0px" },
    )
    io.observe(host)

    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      vp.tx = (e.clientX - r.left) / r.width
      vp.ty = (e.clientY - r.top) / r.height
    }
    const onVisibility = () => setRunning()
    const onResize = () => {
      if (!initialized) return
      resize()
      if (reduce) frame(0)
    }
    if (!reduce) host.addEventListener("pointermove", onPointer)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("resize", onResize)

    return () => {
      destroyed = true
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      host.removeEventListener("pointermove", onPointer)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("resize", onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, depth, dprCap])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  )
}
