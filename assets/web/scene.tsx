// ──────────────────────────────────────────────────────────────────────────
// Scene — every section of the page is a full-bleed color FIELD with a scene
// index. Server component (no "use client"): zero JS shipped.
//
//   <Scene meta={{ index: 2, name: "WORK", tone: "machine" }} sceneCount={8} id="work" labelledBy="work-title">
//     <Slate meta={…} sceneCount={8} />
//     <h2 id="work-title" className="display">…</h2>
//   </Scene>
//
// Data attributes consumed by islands:
//   data-scene / data-scene-name   → Hud (live scene label)
//   data-tone                      → Hud (per-field HUD color token)
//   data-cut                       → GlitchCut (flash when it crosses mid-screen)
//
// Tone → text color: each field uses ITS OWN text token (--reel-on-<field>),
// via the .tone-* classes in tokens.css. Never pick text color by intuition
// ("white on blue", "black on red"): the palette generator decides per brand
// and guarantees contrast. Hot-accent (action) fields usually need DARK body
// text — light text on saturated red/orange routinely fails WCAG AA.
// ──────────────────────────────────────────────────────────────────────────

import type React from "react"

export type SceneTone = "ink" | "bone" | "action" | "machine"
export type SceneMeta = {
  index: number
  name: string
  tone: SceneTone
  /** Decorative timecode where the scene "starts" on the reel. */
  tc?: string
}

export const toneClass: Record<SceneTone, string> = {
  ink: "tone-ink",
  bone: "tone-bone",
  action: "tone-action",
  machine: "tone-machine",
}

export const pad2 = (n: number) => String(n).padStart(2, "0")

export function Scene({
  meta,
  sceneCount,
  id,
  cut = true,
  labelledBy,
  className = "",
  children,
}: {
  meta: SceneMeta
  sceneCount?: number
  id?: string
  /** Fire the glitch flash on entry (false for the first scene). */
  cut?: boolean
  labelledBy?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      data-scene={meta.index}
      data-scene-name={meta.name}
      data-scene-count={sceneCount}
      data-tone={meta.tone}
      {...(cut ? { "data-cut": "" } : {})}
      aria-labelledby={labelledBy}
      className={`${toneClass[meta.tone]} ${className}`}
      style={{ position: "relative" }}
    >
      {children}
    </section>
  )
}

/** Clapperboard-style slate row that opens each scene. Decorative parts are aria-hidden. */
export function Slate({ meta, sceneCount, label, className = "" }: { meta: SceneMeta; sceneCount: number; label?: string; className?: string }) {
  return (
    <div
      className={`hud border-soft ${className}`}
      style={{ display: "flex", justifyContent: "space-between", gap: "1rem", paddingBottom: "0.75rem", borderBottomWidth: 1, borderBottomStyle: "solid" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, background: "currentColor" }} />
        <span>
          SC {pad2(meta.index)}/{pad2(sceneCount)} — {label ?? meta.name}
        </span>
      </span>
      {meta.tc && (
        <span aria-hidden="true" style={{ opacity: 0.7 }}>
          TAKE 01 · TC {meta.tc}
        </span>
      )}
    </div>
  )
}

/** Small mono eyebrow with a leading tick. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`hud ${className}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span aria-hidden="true" style={{ width: 24, height: 1, background: "currentColor" }} />
      {children}
    </p>
  )
}
