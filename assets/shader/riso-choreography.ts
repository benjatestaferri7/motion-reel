// ──────────────────────────────────────────────────────────────────────────
// Riso Shader choreography: pure functions of time (no Date.now, no Math.random).
// Typed port of the CHOREOGRAPHY block in riso-reel.html. Keep both in sync.
//
// Authored on a 30-beat "master" grid (B in 0..30). Convert real time with
//   B = (seconds / secondsPerBeat) * (30 / durationBeats)
//
// frame(B, secPerMasterBeat, count, buf, ripples) fills `buf` for the
// "Spheres" uniform block and returns camera + scene uniforms for that instant.
// ──────────────────────────────────────────────────────────────────────────

import { MAX_SPHERES } from "./riso-shader.glsl"

export type Vec3 = [number, number, number]
export type Ripple = [x: number, z: number, ageSec: number, amp: number]
export type ActType = "origin" | "mitosis" | "rain" | "liquid" | "vortex" | "collapse"

export interface SceneUniforms {
  gloss: number; fog: number; swirl: number; swirlRot: number
  vortex: number; twist: number; spin: number; arms: number
  rings: number; ringPhase: number; collapse: number; sunSize: number
}
export interface CameraPose { p: Vec3; pitch: number; yaw: number; fov: number }
export interface FrameState { count: number; u: SceneUniforms; cam: CameraPose; light: Vec3; vc: [number, number] }

export const ACTS: ReadonlyArray<{ type: ActType; b0: number; b1: number }> = [
  { type: "origin", b0: 0, b1: 4 },     // one black sphere on the spot field, paper "sun" passes
  { type: "mitosis", b0: 4, b1: 9 },    // spheres split on every beat, lift, cast soft shadows
  { type: "rain", b0: 9, b1: 15 },      // camera drops low; spheres rain onto a glossy plane
  { type: "liquid", b0: 15, b1: 19 },   // surface turns to liquid swirls, spheres sink
  { type: "vortex", b0: 19, b1: 25 },   // top-down whirlpool of ink / paper bands
  { type: "collapse", b0: 25, b1: 30 }, // bands become rings, collapse to ONE sphere
]

const TAU = Math.PI * 2
const MAXS = MAX_SPHERES
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const prog = (x: number, a: number, b: number) => clamp((x - a) / (b - a))
const ease = {
  inOut: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x: number) => 1 - Math.pow(1 - x, 3),
  in: (x: number) => x * x * x,
  expoOut: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
}
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Seed { a: number; dy: number; bob: number; rt: number; rx: number; rz: number; ry: number; rr: number; sink: number; kind: number; oa: number; orr: number; os: number }
interface Key { b: number; p: Vec3; pitch: number; yaw: number; fov: number; e?: "lin" }

export function createChoreography(seed: number) {
  const R0 = 0.9, H0: [number, number] = [-2.0, 0.1], VC: [number, number] = [0, 4], G = 18
  const lightAt = (B: number): Vec3 => {
    const k = ease.inOut(prog(B, 0.5, 4)) * (1 - ease.inOut(prog(B, 27, 29.2)))
    const v: Vec3 = [lerp(-0.1, -0.55, k), 1.0, lerp(0.08, 0.5, k)]
    const l = Math.hypot(...v)
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  const rnd = mulberry32(seed)
  const S: Seed[] = []
  for (let i = 0; i < MAXS; i++) {
    S.push({ a: rnd() * TAU, dy: rnd() - 0.5, bob: rnd() * TAU, rt: rnd(), rx: rnd(), rz: rnd(), ry: rnd(), rr: rnd(), sink: rnd(), kind: rnd(), oa: rnd() * TAU, orr: rnd(), os: rnd() })
  }
  S[0].sink = 0.15

  const CAM: Key[] = [
    { b: 0, p: [0, 10, 0], pitch: -90, yaw: 0, fov: 30 },
    { b: 1, p: [0, 10, 0], pitch: -90, yaw: 0, fov: 30 },
    { b: 4, p: [0.2, 11, 0.2], pitch: -90, yaw: 0, fov: 30 },
    { b: 9.2, p: [1.0, 16, 1.0], pitch: -90, yaw: 0, fov: 30 },
    { b: 10.8, p: [0, 1.3, -9], pitch: -5, yaw: 0, fov: 55, e: "lin" },
    { b: 15, p: [0, 1.05, -6.5], pitch: -7, yaw: 5, fov: 55, e: "lin" },
    { b: 18.6, p: [0.4, 0.9, -4], pitch: -11, yaw: -4, fov: 58 },
    { b: 21, p: [0, 9, 4], pitch: -90, yaw: -50, fov: 42, e: "lin" },
    { b: 25, p: [0, 7.5, 4], pitch: -90, yaw: -15, fov: 42 },
    { b: 27.2, p: [0, 7.2, 4], pitch: -90, yaw: -8, fov: 40 },
    { b: 29.2, p: [0, 10, 0], pitch: -90, yaw: 0, fov: 30 },
    { b: 30, p: [0, 10, 0], pitch: -90, yaw: 0, fov: 30 },
  ]

  const gen = (i: number) => 31 - Math.clz32(i)
  const clusterR = (i: number) => (i === 0 ? R0 : R0 * Math.pow(0.88, gen(i) + 1))
  function heroPath(B: number): Vec3 {
    const a = ease.inOut(prog(B, 1, 4)), b = ease.inOut(prog(B, 4, 9.4))
    const x = lerp(lerp(H0[0], 0.2, a), 1.1, b), z = lerp(lerp(H0[1], 0.3, a), 1.0, b)
    const y = R0 + 0.9 * a + 1.4 * b + 0.12 * prog(B, 1, 2) * Math.sin(B * Math.PI * 0.5)
    return [x, y, z]
  }
  function clusterPos(i: number, B: number): Vec3 {
    if (i === 0) return heroPath(B)
    const g = gen(i), p = clusterPos(i - (1 << g), B), s = S[i]
    const e = ease.expoOut(prog(B, 4 + g, 4.9 + g))
    const d = R0 * 2.0 * Math.pow(0.78, g) * e
    return [p[0] + Math.cos(s.a) * d, p[1] + s.dy * 0.6 * d + 0.1 * e * Math.sin(B * Math.PI * 0.5 + s.bob), p[2] + Math.sin(s.a) * d]
  }
  // Rain params are time-independent: precompute once.
  const RAIN = S.map((s, i) => {
    let t0: number, start: Vec3, r: number
    if (i < 32) { t0 = 9.4 + (i / 32) * 1.4; start = clusterPos(i, t0); r = clusterR(i) }
    else {
      const z = lerp(-3.5, 18, Math.pow(s.rz, 1.3)), d = z + 9
      t0 = 9.8 + s.rt * 4.4; start = [(s.rx - 0.5) * 2 * d * 0.8, 3.3 + d * 0.45 + s.ry * 5, z]; r = 0.16 + 0.5 * s.rr * s.rr
    }
    return { t0, start, r, landSec: Math.sqrt((2 * Math.max(start[1] - r, 0)) / G) }
  })
  function bounceY(y0: number, r: number, tau: number) {
    const h = y0 - r
    if (h <= 0) return y0
    const t1 = Math.sqrt((2 * h) / G)
    if (tau < t1) return y0 - 0.5 * G * tau * tau
    let v = G * t1 * 0.38, tt = tau - t1
    for (let k = 0; k < 3; k++) {
      const d = (2 * v) / G
      if (tt < d) return r + v * tt - 0.5 * G * tt * tt
      tt -= d; v *= 0.38
    }
    return r
  }

  const U = (B: number): SceneUniforms => ({
    gloss: lerp(lerp(0.85 * ease.inOut(prog(B, 9.4, 10.8)), 0.3, ease.inOut(prog(B, 18.6, 21))), 0, ease.inOut(prog(B, 25, 28.4))),
    fog: 0.05 * ease.inOut(prog(B, 9.4, 10.8)) * (1 - ease.inOut(prog(B, 18.6, 20.5))),
    swirl: ease.inOut(prog(B, 14.8, 17.5)) * (1 - 0.65 * ease.inOut(prog(B, 20, 23))) * (1 - ease.inOut(prog(B, 24.5, 27))),
    swirlRot: 0.55 * Math.max(0, B - 14.8),
    vortex: ease.inOut(prog(B, 19.3, 21.5)) * (1 - ease.inOut(prog(B, 27.3, 27.8))),
    twist: 3.2,
    spin: -0.35 * (B - 19),
    rings: ease.inOut(prog(B, 24.4, 25.4)),
    ringPhase: 0.9 * (B - 24) + 3 * ease.in(prog(B, 25.4, 27.6)),
    collapse: prog(B, 25.4, 27.6),
    arms: 6,
    sunSize: lerp(0.12, 0.2, prog(B, 3, 6)) - 0.06 * prog(B, 9.4, 10.8),
  })

  function camera(B: number): CameraPose {
    let k = 0
    while (k < CAM.length - 2 && B >= CAM[k + 1].b) k++
    const a = CAM[k], b = CAM[k + 1]
    const u = prog(B, a.b, b.b), e = b.e === "lin" && a.e === "lin" ? u : ease.inOut(u)
    return { p: [lerp(a.p[0], b.p[0], e), lerp(a.p[1], b.p[1], e), lerp(a.p[2], b.p[2], e)], pitch: lerp(a.pitch, b.pitch, e), yaw: lerp(a.yaw, b.yaw, e), fov: lerp(a.fov, b.fov, e) }
  }

  /** Fills `buf` (Float32Array(MAXS*8): MAXS vec4 pos/radius, then MAXS vec4 material). */
  function frame(B: number, sec: number, count: number, buf: Float32Array, rip: Ripple[]): FrameState {
    let n = 0
    const push = (x: number, y: number, z: number, r: number, tone: number, spec: number, refl: number, nocast = false) => {
      if (r < 0.005 || n >= MAXS || y < -r - 0.05) return
      const o = n * 4, m = MAXS * 4 + n * 4
      buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = r
      buf[m] = tone; buf[m + 1] = spec; buf[m + 2] = refl; buf[m + 3] = nocast ? 1 : 0
      n++
    }
    const u = U(B)
    // paper "sun" sphere, acts 1-2
    if (B > 0.4 && B < 6.2) { const k = prog(B, 0.4, 6.2); push(lerp(6.5, -6.5, k), 4.2, lerp(2.4, 1.6, k), 0.4, 0.97, 0, 0, true) }
    const flow = (x: number, z: number): [number, number] => {
      const dx = x - VC[0], dz = z - VC[1], a = u.swirlRot / (1 + (dx * dx + dz * dz) / 9), c = Math.cos(a), s = Math.sin(a)
      return [VC[0] + dx * c - dz * s, VC[1] + dx * s + dz * c]
    }
    for (let i = 0; i < count; i++) {
      const s = S[i], rp = RAIN[i]
      const black = i < 32 || s.kind > 0.12
      const tone = black ? 0.02 : 0.5, spec = black ? 1 : 0.8, refl = black ? 0.4 : 0.3
      if (B >= 19.5 && i <= 16) {
        if (i === 0) { // hero: rises in the vortex, returns home
          const rise = ease.out(prog(B, 19.5, 21.2)), back = ease.inOut(prog(B, 27.2, 29.2))
          const r = lerp(1.25, R0, back)
          push(lerp(VC[0], H0[0], back), lerp(lerp(-1.4, 0.25, rise), R0, back), lerp(VC[1], H0[1], back), r, 0.02, 1 - prog(B, 27.6, 29.2), 0.4)
        } else { // orbiters sucked into the vortex
          const ap = ease.out(prog(B, 20 + s.os * 0.8, 21.2 + s.os * 0.8)), suck = ease.in(prog(B, 21.5, 25))
          const R = lerp(2 + 3.2 * s.orr, 0.6, suck), ang = s.oa + (TAU * u.spin) / u.arms
          const r = (0.22 + 0.25 * s.os) * ap * (1 - suck)
          push(VC[0] + Math.cos(ang) * R, lerp(-r - 0.2, r * 0.6, ap), VC[1] + Math.sin(ang) * R, r, tone, spec, refl)
        }
        continue
      }
      if (B < rp.t0) { // acts 1-2: mitosis cluster
        if (i < 32 && (i === 0 || B >= 4 + gen(i))) { const p = clusterPos(i, B); push(p[0], p[1], p[2], clusterR(i), tone, i === 0 ? prog(B, 0.8, 2) : spec, refl) }
        continue
      }
      let y = bounceY(rp.start[1], rp.r, (B - rp.t0) * sec) // acts 3-4: rain, bounce, sink
      const sb = 15 + s.sink * 3.0
      y -= (rp.r * 2 + 0.15) * ease.in(prog(B, sb, sb + 1.6))
      const [x, z] = flow(rp.start[0], rp.start[2])
      push(x, y, z, rp.r, tone, spec, refl)
      const age = (B - rp.t0) * sec - rp.landSec // ripple from the first impact
      if (age >= 0 && age < 2.5 && B < 19) rip.push([rp.start[0], rp.start[2], age, rp.r * 1.2])
    }
    rip.sort((a, b) => a[2] - b[2])
    if (rip.length > 12) rip.length = 12
    return { count: n, u, cam: camera(B), light: lightAt(B), vc: VC }
  }
  return { frame, acts: ACTS }
}
