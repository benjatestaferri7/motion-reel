"use client"

// ──────────────────────────────────────────────────────────────────────────
// RisoShaderCanvas — the Riso Shader reel as a hero / section background.
// Raw WebGL2 (no three.js): ray-traced spheres + glossy plane, printed with
// three inks (paper / ink / spot), halftone screens and misregistration.
//
// Mount inside a positioned host; the canvas fills it (absolute inset 0):
//   <section className="relative h-[100svh] overflow-hidden">
//     <RisoShaderCanvas />
//     <div className="relative z-10 ...">{/* type sits on flat areas */}</div>
//   </section>
//
// Palette comes from CSS custom properties on the host (RGB triplets, e.g.
// "237 234 227", as written by palette.mjs --format css):
//   --reel-bone -> paper   --reel-ink -> ink   --reel-action -> spot
// Pass `palette` to override (hex strings).
//
// Props
//   quality        'auto' | 'low' | 'med' | 'high'   (auto: low on touch, else high)
//   sphereCount    max spheres (<= 160)                 default 150
//   bpm            beat grid tempo                      default 120
//   durationBeats  loop length in beats (30 = 15 s)     default 30
//   startBeat      master beat to start from (0..30)    default 0
//   speed          playback rate                        default 1
//   interactive    pointer nudges the camera            default false
//   stillBeat      reduced-motion frame (master beat)   default 12
//   halftoneCellPx dot pitch at 1080p                   default 8
//   misregistrationPx plate offset at 1080p            default 3
//   grain, vignette 0..1                                default 0.6 / 0.16
//   dprCap         device pixel ratio cap               default 1.5
//   seed           layout seed                          default 7
//
// Behaviour
// - rAF runs only while in view (IntersectionObserver), tab visible and motion
//   allowed. prefers-reduced-motion renders one still frame (re-rendered on resize).
// - Adaptive quality: steps high -> med -> low when frames exceed 20 ms.
// - Cleanup deletes GL objects and calls WEBGL_lose_context.
// - No WebGL2: the host shows a flat spot field (CSS background) and nothing else.
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react"
import { MAX_SPHERES, POST_FRAG, SCENE_FRAG, VERT } from "./riso-shader.glsl"
import { clamp, createChoreography, type Ripple } from "./riso-choreography"

type QualityName = "low" | "med" | "high"
const QUALITY: Record<QualityName, { spheres: number; bounces: number; scale: number; reflShadows: boolean }> = {
  low: { spheres: 40, bounces: 1, scale: 0.6, reflShadows: false },
  med: { spheres: 90, bounces: 1, scale: 0.8, reflShadows: false },
  high: { spheres: 150, bounces: 2, scale: 1.0, reflShadows: true },
}
const LEVELS: QualityName[] = ["low", "med", "high"]

export interface RisoShaderCanvasProps {
  className?: string
  quality?: "auto" | QualityName
  sphereCount?: number
  bpm?: number
  durationBeats?: number
  startBeat?: number
  speed?: number
  interactive?: boolean
  stillBeat?: number
  halftoneCellPx?: number
  misregistrationPx?: number
  grain?: number
  vignette?: number
  dprCap?: number
  seed?: number
  palette?: { paper?: string; ink?: string; spot?: string }
}

const DEFAULTS = { paper: [237, 234, 227], ink: [11, 11, 13], spot: [255, 59, 31] }

function readTriplet(style: CSSStyleDeclaration, name: string, fallback: number[]): [number, number, number] {
  const parts = style.getPropertyValue(name).trim().split(/[\s,/]+/).map(Number).filter(n => !Number.isNaN(n))
  const v = parts.length >= 3 ? parts : fallback
  return [v[0] / 255, v[1] / 255, v[2] / 255]
}
function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export default function RisoShaderCanvas({
  className,
  quality = "auto",
  sphereCount = 150,
  bpm = 120,
  durationBeats = 30,
  startBeat = 0,
  speed = 1,
  interactive = false,
  stillBeat = 12,
  halftoneCellPx = 8,
  misregistrationPx = 3,
  grain = 0.6,
  vignette = 0.16,
  dprCap = 1.5,
  seed = 7,
  palette,
}: RisoShaderCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // A fresh canvas per mount: a context lost in cleanup (StrictMode, HMR) can't be reused.
    const canvas = document.createElement("canvas")
    canvas.style.cssText = "display:block;width:100%;height:100%"
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" })
    if (!gl) return
    host.appendChild(canvas)

    // ---------------------------------------------------------------- program setup
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("[riso] shader: " + gl.getShaderInfoLog(s))
      return s
    }
    const shaders: WebGLShader[] = []
    const program = (fs: string) => {
      const p = gl.createProgram()!
      const v = compile(gl.VERTEX_SHADER, VERT), f = compile(gl.FRAGMENT_SHADER, fs)
      shaders.push(v, f)
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("[riso] link: " + gl.getProgramInfoLog(p))
      const loc: Record<string, WebGLUniformLocation | null> = {}
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i)!; loc[u.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, u.name) }
      return { p, loc }
    }
    let P1: ReturnType<typeof program>, P2: ReturnType<typeof program>
    try { P1 = program(SCENE_FRAG); P2 = program(POST_FRAG) } catch (e) { console.error(e); canvas.remove(); return }

    gl.uniformBlockBinding(P1.p, gl.getUniformBlockIndex(P1.p, "Spheres"), 0)
    const BUF = new Float32Array(MAX_SPHERES * 8)
    const RIP = new Float32Array(12 * 4)
    const ubo = gl.createBuffer()
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
    gl.bufferData(gl.UNIFORM_BUFFER, BUF.byteLength, gl.DYNAMIC_DRAW)
    const vao = gl.createVertexArray()
    const fbo = gl.createFramebuffer()
    let tex: WebGLTexture | null = null, texW = 0, texH = 0
    const ensureTarget = (w: number, h: number) => {
      if (tex && w === texW && h === texH) return
      if (tex) gl.deleteTexture(tex)
      tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      texW = w; texH = h
    }

    // ---------------------------------------------------------------- state
    const choreo = createChoreography(seed)
    const SPB = 60 / bpm, MB = 30 / durationBeats, DURATION = durationBeats * SPB
    const coarse = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 600
    let level = quality === "auto" ? (coarse ? 0 : 2) : LEVELS.indexOf(quality)
    const css = getComputedStyle(host)
    const pal = {
      paper: palette?.paper ? hexToRgb(palette.paper) : readTriplet(css, "--reel-bone", DEFAULTS.paper),
      ink: palette?.ink ? hexToRgb(palette.ink) : readTriplet(css, "--reel-ink", DEFAULTS.ink),
      spot: palette?.spot ? hexToRgb(palette.spot) : readTriplet(css, "--reel-action", DEFAULTS.spot),
    }
    let dpr = 1
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, dprCap)
      const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    }

    const draw = (t: number, frameNo: number) => {
      const q = QUALITY[LEVELS[level]]
      const B = ((((t / SPB) * MB) % 30) + 30) % 30
      const rip: Ripple[] = []
      const st = choreo.frame(B, SPB / MB, Math.min(MAX_SPHERES, sphereCount, q.spheres), BUF, rip)
      const W = canvas.width, H = canvas.height
      const sw = Math.max(2, Math.round(W * q.scale)), sh = Math.max(2, Math.round(H * q.scale))
      ensureTarget(sw, sh)

      const c = st.cam
      let pitch = c.pitch, yaw = c.yaw
      const cp = [...c.p]
      if (interactive) {
        pointer.sx += (pointer.x - pointer.sx) * 0.06; pointer.sy += (pointer.y - pointer.sy) * 0.06
        yaw += pointer.sx * 4; pitch = clamp(pitch - pointer.sy * 3, -90, 10)
        cp[0] += pointer.sx * 0.35; cp[2] -= pointer.sy * 0.35
      }
      const pr = (pitch * Math.PI) / 180, yr = (yaw * Math.PI) / 180
      const fwd = [Math.cos(pr) * Math.sin(yr), Math.sin(pr), Math.cos(pr) * Math.cos(yr)]
      const right = [Math.cos(yr), 0, -Math.sin(yr)]
      const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]]

      // pass 1: scene -> tone
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.viewport(0, 0, sw, sh)
      gl.useProgram(P1.p)
      gl.bindBuffer(gl.UNIFORM_BUFFER, ubo)
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, BUF)
      gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)
      const L = P1.loc, u = st.u
      gl.uniform1i(L.uCount, st.count)
      gl.uniform2f(L.uRes, sw, sh)
      gl.uniform3fv(L.uCamPos, cp); gl.uniform3fv(L.uCamFwd, fwd); gl.uniform3fv(L.uCamRight, right); gl.uniform3fv(L.uCamUp, up)
      gl.uniform1f(L.uTanHalf, Math.tan((c.fov * Math.PI) / 360))
      gl.uniform3fv(L.uLight, st.light)
      gl.uniform1f(L.uSunSize, u.sunSize)
      gl.uniform1f(L.uTime, t)
      gl.uniform1f(L.uGloss, u.gloss); gl.uniform1f(L.uFog, u.fog)
      gl.uniform1f(L.uSwirl, u.swirl); gl.uniform1f(L.uSwirlRot, u.swirlRot)
      gl.uniform1f(L.uVortex, u.vortex); gl.uniform1f(L.uTwist, u.twist); gl.uniform1f(L.uSpin, u.spin); gl.uniform1f(L.uArms, u.arms)
      gl.uniform1f(L.uRings, u.rings); gl.uniform1f(L.uRingPhase, u.ringPhase); gl.uniform1f(L.uCollapse, u.collapse)
      gl.uniform2fv(L.uVC, st.vc)
      RIP.fill(0); rip.forEach((r, i) => RIP.set(r, i * 4))
      if (L.uRip) gl.uniform4fv(L.uRip, RIP)
      gl.uniform1i(L.uRipCount, rip.length)
      gl.uniform1i(L.uBounces, q.bounces)
      gl.uniform1i(L.uReflShadows, q.reflShadows ? 1 : 0)
      gl.bindVertexArray(vao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // pass 2: print
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, W, H)
      gl.useProgram(P2.p)
      const M = P2.loc, unit = H / 1080
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(M.uScene, 0)
      gl.uniform2f(M.uRes, W, H)
      gl.uniform3fv(M.uPaper, pal.paper); gl.uniform3fv(M.uInk, pal.ink); gl.uniform3fv(M.uSpot, pal.spot)
      gl.uniform1f(M.uCell, Math.max(halftoneCellPx * unit, 4 * dpr, 3))
      gl.uniform1f(M.uAngInk, (45 * Math.PI) / 180)
      gl.uniform1f(M.uAngSpot, (15 * Math.PI) / 180)
      const mis = misregistrationPx * Math.max(unit, dpr * 0.5)
      gl.uniform2f(M.uMisInk, mis * 0.8, -mis * 0.45)
      gl.uniform2f(M.uMisSpot, -mis * 0.55, mis * 0.6)
      gl.uniform1f(M.uGrain, grain)
      gl.uniform1f(M.uVig, vignette)
      gl.uniform1f(M.uSeed, (frameNo % 1024) + 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    // ---------------------------------------------------------------- loop
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    let raf = 0, last = 0, clock = (startBeat / MB) * SPB, ema = 16, slow = 0, warm = 0, inView = true
    const still = () => { resize(); draw((stillBeat / MB) * SPB, 0) }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      clock = (clock + dt * speed) % DURATION
      if (dt > 0 && ++warm > 30) {
        ema = ema * 0.9 + dt * 1000 * 0.1
        slow = ema > 20 ? slow + 1 : Math.max(0, slow - 1)
        if (slow > 45 && level > 0) { level--; slow = 0; warm = 0; ema = 16 }
      }
      draw(clock, Math.floor(clock * 60))
    }
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0 }
    const sync = () => {
      if (reduced.matches) { stop(); still(); return }
      if (inView && !document.hidden) { if (!raf) { last = 0; raf = requestAnimationFrame(tick) } } else stop()
    }

    resize()
    const ro = new ResizeObserver(() => { resize(); if (reduced.matches) still() })
    ro.observe(host)
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync() }, { rootMargin: "80px" })
    io.observe(host)
    const onVis = () => sync()
    const onMotion = () => sync()
    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
      pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1)
    }
    document.addEventListener("visibilitychange", onVis)
    reduced.addEventListener("change", onMotion)
    if (interactive) window.addEventListener("pointermove", onPointer, { passive: true })
    const onLost = (e: Event) => { e.preventDefault(); stop() }
    canvas.addEventListener("webglcontextlost", onLost)
    sync()

    return () => {
      stop()
      ro.disconnect(); io.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      reduced.removeEventListener("change", onMotion)
      window.removeEventListener("pointermove", onPointer)
      canvas.removeEventListener("webglcontextlost", onLost)
      if (tex) gl.deleteTexture(tex)
      gl.deleteFramebuffer(fbo); gl.deleteBuffer(ubo); gl.deleteVertexArray(vao)
      shaders.forEach(s => gl.deleteShader(s))
      gl.deleteProgram(P1.p); gl.deleteProgram(P2.p)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
      canvas.remove()
    }
  }, [quality, sphereCount, bpm, durationBeats, startBeat, speed, interactive, stillBeat, halftoneCellPx, misregistrationPx, grain, vignette, dprCap, seed, palette?.paper, palette?.ink, palette?.spot])

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", background: "rgb(var(--reel-action, 255 59 31))" }}
    />
  )
}
