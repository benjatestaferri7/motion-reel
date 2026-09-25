// ──────────────────────────────────────────────────────────────────────────
// shapes — morph geometry. Every shape is resampled to the SAME number of
// points, evenly spaced along its perimeter, starting at top-center (12
// o'clock) and running clockwise. Any two shapes can then be linearly
// interpolated point-by-point without twisting or popping.
//
// Pure math (no DOM): safe in server components, e.g. to render static
// shape icons on mobile where the sticky morph isn't shown.
//
// Add a shape: list its vertices clockwise, FIRST vertex at top-center
// (x = 0, y < 0) — that is what keeps morphs from rotating mid-tween.
// ──────────────────────────────────────────────────────────────────────────

export const MORPH_POINTS = 144
/** Flat [x0, y0, x1, y1, …] in unit space (about -1.2..1.2). */
export type Pts = Float32Array

export type ShapeName = "circle" | "square" | "triangle" | "hexagon" | "star" | "cross"

const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a) * r, Math.sin(a) * r]
}

const VERTICES: Record<Exclude<ShapeName, "circle">, [number, number][]> = {
  square: [[0, -0.92], [0.92, -0.92], [0.92, 0.92], [-0.92, 0.92], [-0.92, -0.92]],
  triangle: [polar(-90, 1.18), polar(30, 1.18), polar(150, 1.18)],
  hexagon: [0, 1, 2, 3, 4, 5].map((k) => polar(-90 + k * 60, 1.06)),
  star: Array.from({ length: 10 }, (_, k) => polar(-90 + k * 36, k % 2 ? 0.5 : 1.14)),
  cross: [
    [0, -1], [0.34, -1], [0.34, -0.34], [1, -0.34], [1, 0.34], [0.34, 0.34], [0.34, 1],
    [-0.34, 1], [-0.34, 0.34], [-1, 0.34], [-1, -0.34], [-0.34, -0.34], [-0.34, -1],
  ],
}

/** Closed polygon → n points equally spaced along the perimeter. */
export function resample(vertices: [number, number][], n: number): Pts {
  const closed = [...vertices, vertices[0]]
  const seg: number[] = []
  let total = 0
  for (let i = 0; i < closed.length - 1; i++) {
    const d = Math.hypot(closed[i + 1][0] - closed[i][0], closed[i + 1][1] - closed[i][1])
    seg.push(d)
    total += d
  }
  const out = new Float32Array(n * 2)
  let s = 0
  let acc = 0
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total
    while (s < seg.length - 1 && acc + seg[s] < target) {
      acc += seg[s]
      s++
    }
    const t = seg[s] ? (target - acc) / seg[s] : 0
    out[k * 2] = closed[s][0] + (closed[s + 1][0] - closed[s][0]) * t
    out[k * 2 + 1] = closed[s][1] + (closed[s + 1][1] - closed[s][1]) * t
  }
  return out
}

export function shapePoints(name: ShapeName, n = MORPH_POINTS): Pts {
  if (name === "circle") {
    const out = new Float32Array(n * 2)
    for (let k = 0; k < n; k++) {
      const [x, y] = polar(-90 + (k / n) * 360, 1)
      out[k * 2] = x
      out[k * 2 + 1] = y
    }
    return out
  }
  return resample(VERTICES[name], n)
}

export function lerpPts(a: Pts, b: Pts, t: number, out: Pts = new Float32Array(a.length)): Pts {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}

/** Unit points → SVG path `d`, centered at (c, c) with radius r. */
export function toPath(p: Pts, c: number, r: number): string {
  let d = ""
  for (let i = 0; i < p.length; i += 2) {
    d += `${i ? "L" : "M"}${(c + p[i] * r).toFixed(1)} ${(c + p[i + 1] * r).toFixed(1)}`
  }
  return d + "Z"
}
