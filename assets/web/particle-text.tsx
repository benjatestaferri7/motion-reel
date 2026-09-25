"use client"

// ──────────────────────────────────────────────────────────────────────────
// ParticleText — text → particles. Particles start as wrapping noise and
// converge into `text` (sampled from an offscreen canvas), the pointer repels
// them, and scrolling the host out of view disperses them.
//
// Mount inside a positioned host (the canvas fills it: absolute inset 0):
//   <div className="relative h-[70svh]">
//     <ParticleText text="BRAND." accentChars={1} />
//     <h1 className="sr-only">BRAND</h1>   ← real text lives in the DOM
//   </div>
//
// Props
//   text          word to form (keep it short: 3–10 glyphs)
//   accentChars   trailing chars drawn in the accent color (e.g. the period)
//   color/accent  CSS colors (default --reel-on-ink / --reel-action tokens)
//   counts        particle budget { desktop, mobile } (default 4200 / 1200)
//   dprCap        devicePixelRatio cap (default 1.5; 2+ quadruples fill cost)
//   slotSelector  optional element inside the host to fit the word into
//   afterLeader   if the film leader is still rolling, converge when it ends
//                 (LEADER_END_EVENT, 1.5s fallback); otherwise start now
//   onConverged   called once when the word has formed (> 60%)
//
// Perf
// - Typed arrays, fillRect per particle, one fillStyle switch (accent last).
// - rAF loop runs only when: built && in view (IntersectionObserver) &&
//   tab visible && motion allowed. Resize is debounced and ignores mobile
//   URL-bar height jitter (<90px).
// - Waits for document.fonts.ready before sampling (else you sample the
//   fallback font and the word "jumps" later).
// A11y: canvas is aria-hidden. Reduced motion draws ONE static final frame.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { ScrollTrigger, gsap, prefersReducedMotion } from "./gsap-setup"
import { LEADER_END_EVENT, isLeaderPlaying } from "./leader"

type Targets = { xs: Float32Array; ys: Float32Array; accent: Uint8Array; count: number }

function cssVarColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v})` : fallback
}

function sampleText(text: string, accentChars: number, w: number, h: number, budget: number): Targets {
  const empty = { xs: new Float32Array(0), ys: new Float32Array(0), accent: new Uint8Array(0), count: 0 }
  if (w < 20 || h < 20 || !text) return empty
  const off = document.createElement("canvas")
  off.width = Math.ceil(w)
  off.height = Math.ceil(h)
  const c = off.getContext("2d", { willReadFrequently: true })
  if (!c) return empty

  const family =
    getComputedStyle(document.documentElement).getPropertyValue("--reel-font-display").trim() ||
    "'Arial Black', sans-serif"
  const head = text.slice(0, text.length - accentChars)
  const tail = text.slice(text.length - accentChars)
  c.font = `900 100px ${family}`
  const fullAt100 = c.measureText(text).width
  // Fit width, and keep cap height (~0.72em) inside the slot.
  const size = Math.min(((w * 0.98) / fullAt100) * 100, (h * 0.92) / 0.72)
  c.font = `900 ${size}px ${family}`
  const headW = c.measureText(head).width
  const x0 = (w - c.measureText(text).width) / 2
  const baseline = h / 2 + size * 0.36
  c.fillStyle = "#fff"
  c.fillText(head, x0, baseline)
  c.fillStyle = "#f00" // accent marker: red channel only
  c.fillText(tail, x0 + headW, baseline)

  const data = c.getImageData(0, 0, off.width, off.height).data
  const W = off.width
  // Estimate filled area on a coarse grid, then choose the step that hits the budget.
  let filled = 0
  for (let y = 0; y < off.height; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 128) filled++
  const step = Math.max(1.5, Math.sqrt((filled * 4) / budget))

  const pts: [number, number, number][] = []
  for (let y = step / 2; y < off.height; y += step) {
    for (let x = step / 2; x < W; x += step) {
      const i = ((y | 0) * W + (x | 0)) * 4
      if (data[i + 3] > 128) {
        pts.push([x + (Math.random() - 0.5) * step * 0.5, y + (Math.random() - 0.5) * step * 0.5, data[i + 1] < 100 ? 1 : 0])
      }
    }
  }
  pts.sort((a, b) => a[2] - b[2]) // body first, accent last → one fillStyle switch per frame
  const n = pts.length
  const out = { xs: new Float32Array(n), ys: new Float32Array(n), accent: new Uint8Array(n), count: n }
  pts.forEach(([x, y, a], k) => {
    out.xs[k] = x
    out.ys[k] = y
    out.accent[k] = a
  })
  return out
}

export type ParticleTextProps = {
  text: string
  accentChars?: number
  color?: string
  accent?: string
  counts?: { desktop: number; mobile: number }
  dprCap?: number
  slotSelector?: string
  afterLeader?: boolean
  onConverged?: () => void
}

export function ParticleText({
  text,
  accentChars = 0,
  color,
  accent,
  counts = { desktop: 4200, mobile: 1200 },
  dprCap = 1.5,
  slotSelector,
  afterLeader = true,
  onConverged,
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const convergedRef = useRef(onConverged)
  convergedRef.current = onConverged

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext("2d")
    if (!canvas || !host || !ctx) return

    const reduce = prefersReducedMotion()
    const bodyColor = color ?? cssVarColor("--reel-on-ink", "white")
    const accentColor = accent ?? cssVarColor("--reel-action", "red")

    let W = 0, H = 0, dpr = 1, n = 0, accentStart = 0, size = 1.6
    let px = new Float32Array(0), py = new Float32Array(0)
    let vx = new Float32Array(0), vy = new Float32Array(0)
    let tx = new Float32Array(0), ty = new Float32Array(0)
    let ox = new Float32Array(0), oy = new Float32Array(0) // scatter directions
    const state = { conv: reduce ? 1 : 0, scatter: 0 }
    const pointer = { x: -1e4, y: -1e4 }
    let raf = 0, running = false, inView = true, destroyed = false, built = false, fired = false
    let lastW = 0, lastH = 0

    const build = () => {
      const r = host.getBoundingClientRect()
      W = lastW = r.width
      H = lastH = r.height
      dpr = Math.min(dprCap, window.devicePixelRatio || 1)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      const mobile = W < 768
      size = mobile ? 1.5 : 1.7
      const slot = slotSelector ? host.querySelector<HTMLElement>(slotSelector)?.getBoundingClientRect() : null
      const sx = slot ? slot.left - r.left : W * 0.05
      const sy = slot ? slot.top - r.top : H * 0.2
      const t = sampleText(text, accentChars, slot ? slot.width : W * 0.9, slot ? slot.height : H * 0.6, mobile ? counts.mobile : counts.desktop)

      const prevN = n, prevX = px, prevY = py
      n = t.count
      px = new Float32Array(n); py = new Float32Array(n)
      vx = new Float32Array(n); vy = new Float32Array(n)
      tx = new Float32Array(n); ty = new Float32Array(n)
      ox = new Float32Array(n); oy = new Float32Array(n)
      accentStart = n
      for (let i = 0; i < n; i++) {
        tx[i] = t.xs[i] + sx
        ty[i] = t.ys[i] + sy
        if (t.accent[i] && accentStart === n) accentStart = i
        const a = Math.random() * Math.PI * 2
        const d = (0.4 + Math.random()) * Math.max(W, H) * 0.6
        ox[i] = Math.cos(a) * d
        oy[i] = Math.sin(a) * d
        if (i < prevN) { px[i] = prevX[i]; py[i] = prevY[i] }
        else if (state.conv >= 1) { px[i] = tx[i]; py[i] = ty[i] }
        else { px[i] = Math.random() * W; py[i] = Math.random() * H }
      }
      built = true
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.globalAlpha = 1 - state.scatter * 0.85
      ctx.fillStyle = bodyColor
      for (let i = 0; i < n; i++) {
        if (i === accentStart) ctx.fillStyle = accentColor
        ctx.fillRect(px[i], py[i], size, size)
      }
    }

    const step = () => {
      const { conv, scatter } = state
      const spring = 0.004 + conv * 0.075
      const jitter = (1 - conv) * 1.4 + 0.035
      const R = W < 768 ? 70 : 120
      const R2 = R * R
      for (let i = 0; i < n; i++) {
        let ax = (tx[i] + ox[i] * scatter - px[i]) * spring + (Math.random() - 0.5) * jitter
        let ay = (ty[i] + oy[i] * scatter - py[i]) * spring + (Math.random() - 0.5) * jitter
        const dx = px[i] - pointer.x, dy = py[i] - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const f = (1 - d / R) * 3.2
          ax += (dx / d) * f
          ay += (dy / d) * f
        }
        vx[i] = (vx[i] + ax) * 0.84
        vy[i] = (vy[i] + ay) * 0.84
        px[i] += vx[i]
        py[i] += vy[i]
        if (conv < 0.05) { // chaos phase: wrap noise inside the frame
          if (px[i] < 0) px[i] += W; else if (px[i] > W) px[i] -= W
          if (py[i] < 0) py[i] += H; else if (py[i] > H) py[i] -= H
        }
      }
    }

    const loop = () => {
      if (!running) return
      step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    const setRunning = () => {
      const should = built && inView && !document.hidden && !reduce && !destroyed
      if (should && !running) { running = true; raf = requestAnimationFrame(loop) }
      else if (!should && running) { running = false; cancelAnimationFrame(raf) }
    }

    let tween: gsap.core.Tween | null = null
    const converge = () => {
      if (tween || destroyed) return
      tween = gsap.to(state, {
        conv: 1,
        duration: 2.4,
        ease: "expo.inOut",
        onUpdate: () => {
          if (!fired && state.conv > 0.6) { fired = true; convergedRef.current?.() }
        },
      })
    }

    const scrollST = reduce
      ? null
      : ScrollTrigger.create({
          trigger: host,
          start: "top top",
          end: "bottom top",
          onUpdate: (self) => { state.scatter = self.progress * self.progress },
        })

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
    }
    const onLeave = () => { pointer.x = -1e4; pointer.y = -1e4 }
    const onVisibility = () => setRunning()
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        const r = host.getBoundingClientRect()
        if (Math.abs(r.width - lastW) < 2 && Math.abs(r.height - lastH) < 90) return
        build()
        if (reduce) draw()
      }, 160)
    }
    const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; setRunning() }, { rootMargin: "80px" })

    const start = async () => {
      try { await document.fonts?.ready } catch {}
      if (destroyed) return
      build()
      draw() // first frame immediately, even if rAF is throttled
      if (reduce) { convergedRef.current?.(); return }
      host.addEventListener("pointermove", onPointer)
      host.addEventListener("pointerleave", onLeave)
      document.addEventListener("visibilitychange", onVisibility)
      setRunning()
    }

    io.observe(host)
    window.addEventListener("resize", onResize)
    start()

    let fallback = 0
    if (!reduce) {
      if (afterLeader && isLeaderPlaying()) {
        window.addEventListener(LEADER_END_EVENT, converge, { once: true })
        fallback = window.setTimeout(converge, 1500)
      } else {
        converge()
      }
    }

    return () => {
      destroyed = true
      running = false
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.clearTimeout(fallback)
      io.disconnect()
      scrollST?.kill()
      tween?.kill()
      window.removeEventListener("resize", onResize)
      window.removeEventListener(LEADER_END_EVENT, converge)
      host.removeEventListener("pointermove", onPointer)
      host.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [text, accentChars, color, accent, counts.desktop, counts.mobile, dprCap, slotSelector, afterLeader])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  )
}
