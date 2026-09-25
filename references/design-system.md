# Motion Reel — Design System

Normative rules for the look. Numbers are defaults; deviate only with a reason.

## 1. Palette (4 roles, flat fields only)

Brand-agnostic. Values ALWAYS come from `assets/palette/palette.mjs` (brand color, preset, or surprise) — see `palettes.md`. Never hardcode hex in components.

| Role | Token | Meaning | Constraint |
|------|-------|---------|------------|
| System | `--reel-ink` | Frame, depth, quiet scenes | Near-black, never pure `#000` |
| Human | `--reel-bone` | Editorial, capabilities | Off-white, never pure `#FFF` |
| Action | `--reel-action` | Statement / claim scenes | Brand's hottest hue, high chroma |
| Machine | `--reel-machine` | Proof / data scenes | Counter-hue to action |

Text on a field always uses `--reel-on-<field>` (chosen by WCAG contrast, ≥4.5:1 for body). Pairs under 3:1 (typically action on machine) are forbidden as text/background.

Worked example (preset `signal`: ink `#0B0B0D`, bone `#EDEAE3`, action `#FF3B1F`, machine `#2B35FF`): action takes ink text (5.52:1, bone only 2.96:1); machine takes bone text (5.72:1, ink only 2.86:1); action on machine is 1.93:1 → forbidden.

`mix-blend-mode: difference` over saturated fields produces off-palette colors (white over red → cyan, over blue → yellow). Use it only over ink/bone; otherwise color the HUD with `--reel-hud-on-<field>`.

## 2. Typography

- Display: ONE ultra-heavy wide grotesk, all caps, tracking −0.02 to −0.04em, line-height 0.85–0.95, allowed to bleed off-frame.
- Mono: HUD, labels, timecodes — 10–12px, uppercase, tracking 0.15–0.2em.
- Body: one neutral grotesk (not Inter by default).
- Show one family in many states (width, weight, outline, repetition) instead of adding families.

Verified variable options (width axis enables kinetic stretch):

| Font | Axes | Note |
|------|------|------|
| Anybody | wdth 50–150, wght 100–900 | Widest range, best fit |
| Archivo | wdth 62–125, wght 100–900 | Safe, great text rendering |
| Mona Sans / Hubot Sans | wdth 75–125, wght 200–900 | GitHub fonts |
| Roboto Flex | wdth 25–151, wght 100–1000 | Heavy file |
| Panchang (Fontshare) | wght 200–800, extended | Monument Extended stand-in, no wdth |

Mono: Space Mono, JetBrains Mono, Geist Mono, Martian Mono (wdth 75–112.5), IBM Plex Mono.

## 3. Timing (beat grid)

- Everything is keyed to BPM. `frame = round(beat * 60/BPM * fps)`.
- Clean frames-per-beat at 60fps: 120 BPM = 30f, 144 = 25f, 150 = 24f, 100 = 36f. 128 BPM (28.125f) needs rounding.
- Durations: hit/slam 0.25–0.5 beat · entrance 0.5–1 · morph/tunnel 2–4 · hold ≥1 on every key pose. Aim ~60% motion / 40% holds.
- Speed contrast: fast in → hold → fast out. One slow move (2–4 beats) per 8 beats.
- Stagger: chars 20–40ms, words 60–90ms, lines 120ms; total < 1 beat; prefer `from: "center" | "edges"`.
- Cuts land on the downbeat; the glitch/RGB-split lives 2–4 frames on the INCOMING shot.
- Web: map scroll progress to a virtual beat count (e.g. 64 beats per page) for the HUD.

## 4. Easing vocabulary (one family per piece)

| Use | GSAP | CSS |
|-----|------|-----|
| Arrivals / slides | `expo.out` | `cubic-bezier(0.16,1,0.3,1)` |
| Exits | `expo.in` | `cubic-bezier(0.7,0,0.84,0)` |
| A→B moves | `power4.inOut` | `cubic-bezier(0.7,0,0.3,1)` |
| Pops (large type) | `back.out(1.2–1.4)` | — |
| Pops (small UI) | `back.out(1.7–2.5)` | — |
| Drops | `bounce.out` (~3 bounces) | — |

## 5. Signature moves (pick ONE per scene)

1. Hard cut to a full-bleed field (the core move).
2. Title slam: word-by-word on beats, `back.out`.
3. Outline echo: stacked outline copies fanning from a solid line.
4. Width breathing: wdth axis 62↔125 on the kick.
5. Scramble/decrypt resolve.
6. Shape morph via N resampled perimeter points (240 typical).
7. Text-to-particles: sample text from offscreen canvas, chaos → form.
8. Perspective tunnel / wire cube (hand-rolled projection).
9. Graph-editor UI: bezier with handles, a dot riding the curve.
10. Grid sequence: dots/crosses/cells ripple on beats.
11. Count-up numbers / percent counters.

## 6. Frame furniture

- HUD in 4 corners on every scene: brand/title (TL), timecode `TC 00:00:SS:FF` (TR), `SCENE 03/10 — NAME` (BL), `1920×1080 · 60FPS · 128BPM · BEAT 12/64` (BR). Thin corner brackets.
- Finish: fine grain (per-frame offset), soft vignette, subframe motion blur (video only).
- Freeze-frame test: every frame must work as a poster.

## 7. Scene rhythm

- Alternate loud (saturated field, giant type) and quiet (ink/bone, small type, space) scenes. Never 3 same-color scenes in a row.
- Canonical order: leader/countdown → title → statement (brand color) → capabilities (bone, morph) → proof (machine color, counters) → process (graph editor) → depth/stack (ink, tunnel) → claim (brand color) → end card (ink, logo + dot).

## 8. Anti-slop (reject on sight)

Purple→cyan gradients · glassmorphism/glows · Inter everywhere · three icon cards in a row · hover-bounce on everything · every effect in every scene · no holds · uniform section rhythm · constant easing · off-beat timing · lorem ipsum · em-dash-heavy AI copy · decorative eyebrow rule-lines on every heading.
