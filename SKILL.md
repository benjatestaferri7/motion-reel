---
name: motion-reel
description: "Trigger: motion reel, showreel, kinetic type, Swiss motion, riso/halftone shader, spectacular landing redesign, motion graphics from code. Build reel-style sites and videos."
license: Apache-2.0
metadata:
  author: "benjatestaferri7"
  version: "1.1"
---

## Activation Contract

Use for websites/landings (any stack) or code-rendered videos (showreel, promo, launch clip) in the motion-designer showreel language: full-bleed flat color cuts, ultra-heavy wide caps, mono HUD corners, beat-timed kinetic motion, or 3D riso-print shaders. Not for dashboards, docs sites, or forms-first apps.

## Hard Rules

- All paths below are relative to this skill's folder (`SKILL_DIR`); run tools as `node "$SKILL_DIR/assets/palette/palette.mjs" …`.
- Reply in the user's language; write site/video copy in the project's language.
- Finish intake BEFORE design or code. Never hardcode hex: color comes from `palette.mjs` role tokens (`ink`, `bone`, `action`, `machine`, `on-*`, `hud-on-*`).
- Text on a field uses `on-<field>`; never render a `forbiddenPairs` combo as text/background.
- One signature move per scene; alternate loud/quiet; never 3 same-role fields in a row; key poses hold ≥1 beat; one easing family.
- Web: animate transform/opacity; honor `prefers-reduced-motion` (static end states, no loops, no pins); pause off-screen canvases; pin only ≥1024px; no overflow at 375px.
- Never invent testimonials, metrics, or clients; keep existing content.
- Reject the anti-slop list (`references/design-system.md` §8).

## Decision Gates

| Situation | Action |
|-----------|--------|
| Type-driven, flat color cuts | **Swiss Kinetic**: `design-system.md`, `assets/web`, `assets/video` |
| 3D, tactile, poster/print | **Riso Shader**: `shader-print.md`, `assets/shader/` |
| Both | **Hybrid**: shader field behind kinetic type on flat areas (`on-*` tokens) |
| Brand color known | `palette.mjs --brand "#HEX" --format css\|config\|tailwind` |
| Preset | `--list` (show name, tags, swatches) → `--preset <name>` |
| Surprise me | Infer industry/mood from README, copy, CSS, user words → `--surprise --mood "<tags>" --seed <n>`; state why; one re-roll via `--exclude <name>` |
| Website | `references/web-techniques.md`; adapt `assets/web/*` to the stack |
| Video | Copy `assets/video/reel-template/`; `references/video-pipeline.md` |
| Site + video | Video first as storyboard, then site from the same scenes |

## Execution Steps

1. Detect output (site/video/both) and stack; read existing content and brand assets.
2. Intake, ONE question per turn: style (Swiss Kinetic / Riso Shader / Hybrid / Surprise me), then palette (Brand color / Preset / Surprise me).
3. Fonts from preset `fontPairing` or `design-system.md` §2. BPM: prefer 120 (whole frames per beat at 30 and 60fps; 144/150 at 60fps); other tempos round beats to frames.
4. Write a scene table `# | scene | field role | signature move | beats` using the canonical rhythm (§7).
5. Build from the matching assets.
6. QA: web → `assets/qa/qa-screenshots.js` (1440 + 390, overflow, console), judge only after animations settle; video → test frames, full render, `ffprobe`, contact sheet.
7. Report results and what could not be verified (e.g. audio is never listened to).

## Output Contract

Return: palette (+ surprise reason) and contrast summary, scene table, files created/changed, QA evidence paths, known limitations.

## References

- `references/design-system.md` — roles, type, timing, easing, moves, rhythm, anti-slop.
- `references/palettes.md` — intake, presets, token formats.
- `references/web-techniques.md` — GSAP/Lenis/canvas, a11y, performance.
- `references/video-pipeline.md` — deterministic canvas → headless browser → ffmpeg, audio.
- `references/shader-print.md` — WebGL2 ray tracing, 3-ink halftone, misregistration.
