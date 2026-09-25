# Riso Shader assets

Ray-traced spheres, printed in three inks. Raw WebGL2, no libraries, no images. It runs in
the browser as a 15 s loop (30 beats at 120 BPM). The same file renders to MP4 through the
video pipeline.

| File | What it is |
|------|------------|
| `riso-reel.html` | A single self-contained reel. Holds the `CONFIG`, both shader passes, the choreography and the runtime |
| `riso-shader.glsl.ts` | `VERT`, `SCENE_FRAG`, `POST_FRAG` and `MAX_SPHERES` as exported strings. Same GLSL as the HTML |
| `riso-choreography.ts` | Typed port of the choreography: `createChoreography(seed).frame(B, …)` and `ACTS` |
| `riso-shader-canvas.tsx` | `"use client"` React background component. Reads the palette from `--reel-*` CSS vars |

The GLSL and choreography exist twice: once inline in the HTML and once in the TS modules.
The HTML keeps a copy so it stays a single file. **When you edit one copy, mirror the change
in the other.**

## Preview

```bash
open assets/shader/riso-reel.html                      # file:// works, no server needed
npx serve assets/shader  # then /riso-reel.html         # or any static server
```

Useful URL params:

- `?live` forces live mode (even under automation).
- `?q=low|med|high` picks a quality preset.
- `?frame=420` renders a single frame, deterministically.
- `?w=1280&h=720` sets the render size.
- `?seed=3` changes the sphere layout.
- `?spheres=60` sets the sphere count.
- `?scale=0.6` sets the scene resolution scale.

To pick colours, edit `CONFIG.palette`. Map the colours from
`node ~/.claude/skills/motion-reel/assets/palette/palette.mjs --preset <name> --format config`: bone → `paper`, ink → `ink`,
action → `spot`.

## Render to MP4 (video pipeline)

`riso-reel.html` follows the contract of `assets/video/reel-template/render.js`:

- It exposes `window.CONFIG` and a `window.REEL` beat table: `fps`, `totalFrames`, `cuts`,
  `scenes`, …
- It sets `window.READY`/`window.__ready`.
- It exposes `window.renderFrame(n, fps?)`. The call is synchronous and a pure function of
  `n`: the scene is drawn and `gl.finish()` has run when it returns. (`render.js` also
  accepts pages whose `renderFrame` returns a Promise.)
- It defaults to 30 fps (`CONFIG.fps`, or `?fps=` / `--fps`): 120 BPM gives 15 whole frames
  per beat (30 at 60 fps). 30 beats = 450 frames at 30 fps.
- It draws into `canvas#c`, created with `preserveDrawingBuffer`, so `toDataURL` works.
- Deterministic mode switches on automatically under puppeteer (`navigator.webdriver`), or
  with `?render`.

```bash
cp assets/shader/riso-reel.html <project>/reel/        # next to render.js
cd <project>/reel
node render.js --page riso-reel.html --out out/riso.mp4                         # 1920x1080@30
node render.js --page riso-reel.html --out out/riso60.mp4 --fps 60              # or 60 fps
node render.js --page "riso-reel.html?q=med" --out out/prev.mp4 --width 960 --height 540
node render.js --page riso-reel.html --stills 0,150,225,270,345,390 --out out/stills
python3 make_audio.py --timing out/riso.timing.json --out out/audio.wav         # beat-synced bed
```

`render.js` writes the beat table as `<out>.timing.json` (here `out/riso.timing.json`), so a
riso render never overwrites the Swiss reel's timing in the same folder. To cut riso footage
into a Swiss reel, add `--keep-frames` and use the template's `frames` scene
(`assets/video/reel-template/README.md` §2b).

The loop is seamless: frame `totalFrames` equals frame 0 (grain aside). A GIF or MP4 can
loop forever.

## Web background

```tsx
import RisoShaderCanvas from "@/components/reel/riso-shader-canvas"   // copy the 3 TS files together

<section className="relative h-[100svh] overflow-hidden">
  <RisoShaderCanvas startBeat={19} />            {/* e.g. start in the vortex */}
  <h1 className="relative z-10 text-reel-on-action">…</h1>
</section>
```

- The palette comes from `--reel-bone`, `--reel-ink` and `--reel-action`, written as RGB
  triplets (`tokens.css`). The `palette` prop overrides them with hex.
- The component is `aria-hidden` and ignores pointer events. The real content stays in the
  DOM.
- It pauses off-screen (IntersectionObserver) and when the tab is hidden. With
  `prefers-reduced-motion` it shows one still frame (`stillBeat`).
- DPR is capped at 1.5. Each mount gets a fresh canvas, and cleanup calls
  `WEBGL_lose_context`, so StrictMode and HMR are safe.
- Without WebGL2, the host shows a flat spot field (CSS background).

## Performance budget

Two passes run each frame:

1. **Scene pass.** Renders at `scale × canvas` into an R8 texture. Per pixel it does a primary
   ray, soft shadows (a loop over all spheres) and 1–2 reflection bounces, each looping over
   all spheres.
2. **Print pass.** Runs at full resolution.

Cost grows with pixels × spheres × (bounces + shadow loops).

| Preset | Spheres | Bounces | Scale | Target |
|--------|---------|---------|-------|--------|
| high | 150 | 2 (+ shadows in reflections) | 1.0 | desktop dGPU / Apple silicon |
| med | 90 | 1 | 0.8 | laptops, integrated GPUs |
| low | 40 | 1 | 0.6 | phones (default on coarse pointers) |

Measured GPU time per frame (M5 Pro, Metal, median):

| Render | Worst act (rain) | Other acts |
|--------|------------------|------------|
| high @1920×1080 | 9.2 ms | 1–5 ms |
| high @1280×720 | 4.6 ms | — |
| low @780×1688 (phone-sized) | 1.0 ms | — |

- SwiftShader (CPU) takes about 145 ms per frame at 640×360. That is fine for CI renders and
  useless for live playback.
- In live mode, quality steps down once frames average above `CONFIG.frameBudgetMs` (20 ms).
- Spheres with radius 0, or sunk below the plane, are compacted out on the CPU each frame. A
  frame only pays for the spheres on screen.
- The rain act is the worst case, since every sphere is live and reflected. Budget for it.
