# Riso Shader — print-style WebGL2 scenes

Raw WebGL2 ray-traces analytic spheres and a glossy plane into ONE tone channel. A print pass
turns that tone into three inks with halftone screens, misregistration and grain.
Assets: `assets/shader/`. The README there has the run, render and embed commands.

## Choose the style

| Pick | When |
|------|------|
| **Swiss Kinetic** | Message-first: claims, lists, CTAs. Type is the hero |
| **Riso Shader** | Mood-first: poster/print, tactile 3D, teaser, loopable background |
| **Hybrid** | Shader field as the scene background, kinetic type on top |

Hybrid rules:
- Type sits only on flat areas: the spot field (acts 1–2 and 6) or the paper sky (act 3).
  Never over the vortex, the liquid, or any screened gradient.
- Text uses the field's `on-*` token (`on-action` on spot, `on-bone` on paper).
- Cut type on `window.REEL.cuts`. The shader owns the motion; type does at most ONE move.
- Copy that must survive every frame goes on a solid `bone` or `ink` plate.

## The 3-ink rule

| Plate | Role | Screen |
|-------|------|--------|
| paper | `bone` | none |
| ink | `ink` | 45° |
| spot | `action` | 15° |
| optional 4th | `machine` | 75° |

- The template ships 3 plates. Add `machine` only if it clears contrast against both paper
  and spot, and never if a `forbiddenPairs` entry involves it.
- Tone maps to plates: 0 = ink, 0.5 = spot, 1 = paper.
  - Ink coverage = `1 − 2t`. Spot coverage = `2 − 2t`, so spot also prints under the ink.
  - That underprint is why misregistration shows a spot fringe on paper.
- Flat fields stay flat: dead zones at both coverage ends stop stray dots.
- Gradients exist ONLY as dot screens. Never blend inks continuously.

## Print parameters (1080p units, scaled with canvas height)

| Param | Default | Look |
|-------|---------|------|
| `halftone.cellPx` | 8 | 5–7 reads as fine offset; 10–14 as coarse riso. Floor: 4 CSS px |
| angles | 15/45/75° | 30° apart avoids moiré |
| `misregistrationPx` | 3 | 1–2 subtle; 4–6 zine; >8 reads as a bug |
| `grain` | 0.6 | Speckle, ink mottle, ragged dots; re-seeded per frame |
| `vignette` | 0.16 | Keep it under 0.25 |

## Acts on the beat grid

120 BPM × 30 beats = a 15 s loop. Acts are authored on a 30-beat master grid and rescale
with `durationBeats`.

| Beats | Act | Picture |
|-------|-----|---------|
| 0–4 | origin | One black sphere on flat spot, top-down; a paper "sun" drifts past |
| 4–9 | mitosis | Spheres double each beat (1→32), lift, cast soft screened shadows |
| 9–15 | rain | Camera swoops low. Spheres rain onto a glossy plane under a paper sky, with reflections and ripples |
| 15–19 | liquid | The plane becomes ink/paper liquid swirls; spheres sink |
| 19–25 | vortex | Spiral arms around a rising hero sphere; orbiters are sucked in |
| 25–30 | collapse | The spiral becomes rings that collapse outside-in; ONE sphere returns home. Frame 30 = frame 0 |

## Performance budgets

| Target | Spheres | Bounces | Scene scale |
|--------|---------|---------|-------------|
| Desktop | 150 | 2 | 1.0 |
| Laptop / iGPU | 90 | 1 | 0.8 |
| Mobile | ~40 | 1 | 0.6 |

- The print pass runs at full resolution, so dots stay crisp at a low scene scale.
- DPR cap is 1.5. The rain act is the worst case.
- Live mode steps down after sustained frames over 20 ms, and pauses when hidden or
  off-screen.
- Reduced motion renders one still (`stillBeat`) and never loops.

## Determinism rules

- Time comes only from `renderFrame(n, fps)`: `t = n / fps`. Scene logic never calls
  `Date.now`, `performance.now` or `Math.random`.
- Randomness comes from a seeded PRNG (`CONFIG.seed`). Ripples are derived from landing
  times, not stored state.
- The grain seed is the frame number, so re-rendering frame n is bit-identical.
- `renderFrame` is synchronous and calls `gl.finish()`. The canvas uses
  `preserveDrawingBuffer`, so `toDataURL` is safe.
- Check the loop: frames 0 and `totalFrames − 1` must match, apart from grain.

## Anti-patterns

- More than 3 inks (4 with machine), or inks tinted with opacity instead of screens.
- Muddy gradients with no screen.
- Moiré: screens closer than 30°, or the dominant ink at 0°/90°. Use 15/45/75.
- A halftone cell under about 4 CSS px on mobile: grey mush and shimmer.
- Misregistration that changes per frame. Plates drift per print; only grain crawls.
- Type over the vortex or liquid acts, or body copy on a screened area.
- A full-res scene pass on phones, or 150 spheres at DPR 3.
- Using the shader for a message-first page. That is Swiss Kinetic's job.
