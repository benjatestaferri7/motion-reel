# Reel template — canvas → headless browser → ffmpeg

A deterministic motion reel: `index.html` draws frame `n` as a pure function
(`window.renderFrame(n)`), `render.js` renders frames in parallel in headless
Chrome/Brave/Chromium and encodes them with ffmpeg, and `make_audio.py`
synthesizes a soundtrack from the same beat table.

## 0. Setup

```bash
cp -r ~/.claude/skills/motion-reel/assets/video/reel-template ./reel && cd reel
npm i                      # puppeteer-core only (uses your installed browser)
# needs: node ≥ 18, ffmpeg + ffprobe, python3 (numpy optional), Chrome/Brave/Chromium
```

Browser auto-detection covers Chrome, Chromium, Brave and Edge in the usual macOS, Linux and
Windows locations. Override it with `--browser PATH` or `BROWSER_PATH=…` (`CHROME_PATH` also
works). `node render.js --which-browser` prints what it found and exits.

### Platforms

- **macOS / Linux**: everything works natively.
- **Windows**: `render.js` and `qa/qa-screenshots.js` work in PowerShell with Node
  (`$env:BROWSER_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"` if detection
  misses). `qa/contact-sheet.sh` is bash, so run it from WSL or Git Bash.
- **Docker / CI**: containers usually run as root, where Chrome's sandbox can't start.
  `--no-sandbox --disable-dev-shm-usage` are added automatically for root on Linux, or force
  them with `NO_SANDBOX=1`.

## 1. Configure

Edit `CONFIG` at the top of `index.html`:

- **title**: HUD top-left corner text (default `BRAND / THE REEL`).
- **brand**: name, accent glyph, tagline, and end-card line.
- **palette**: the default palette. Paste the output of the palette tool. It uses the same keys:
  ```bash
  node ~/.claude/skills/motion-reel/assets/palette/palette.mjs --preset <name> --format config
  ```
  The template never hardcodes colors. Text uses `on*`, the HUD uses `hudOn*`, and accents
  fall back to the field's text color when the contrast is too low or the pair is in
  `forbiddenPairs`.
- **palettes** (optional): more named palettes with the same keys, e.g.
  `palettes: { acid: {…}, kiln: {…} }`. A scene picks one with `palette: 'acid'` and the HUD
  then shows `PALETTE: ACID`. Scenes without `palette` use `palette`.
- **fonts**: copy the preset's `fontPairing` (shown in the palette report). `display` ideally
  has a `wdth` axis (`wdth: [min, max]`, and `css2` must request `wdth`). Many preset faces
  don't: set `wdth: null` and width moves (widthType, title slams, reveals) stretch with
  `scaleX` over `simWdth` (default `[75, 125]`; `[100, 100]` turns them off). Use `css2`
  (Google Fonts) or `files` (self-hosted woff2). If loading fails, the template falls back
  to `fallback` and stretches the same way. Extra display faces go in `fonts` under any key
  and a scene picks one with `font: 'key'`.
- **bpm, fps, width, height, blur, seed**. Default 120 BPM at 30 fps = 15 whole frames per
  beat (30 at 60 fps). Other tempos log a `[reel] WARN` and round the cut frames.
- **scenes**: `{ type, beats, field, big?, cuts?, …copy }`. The available types are
  `leader, title, palette, widthType, particles, echo, morph, tunnel, graph, counters, frames, end`.
  The sum of beats is the reel length (60 beats at 120 BPM = 30.0 s).

Options on any scene:

| option | effect |
|---|---|
| `label` | HUD name (`SCENE 03 / 10 — Width Type`). Default: Title Case of `type` |
| `palette` | key of `CONFIG.palettes` |
| `font` | key of `CONFIG.fonts` (or an inline spec) for the display face |
| `blur` | max motion-blur subframes for this scene (e.g. `1` for static scenes) |
| `post: false` | skip vignette and grain (e.g. over pre-rendered frames) |

Scene-specific options worth knowing:

- `title`: `tl`, `tr`, `bl` replace the corner copy (`FOR — BRAND`, `meta`, `NO. 01`).
- `particles`: `text` (default `brand.name`) and `accent` (default `brand.accentChar`, `''` for none).
- `end`: `text` / `accent` override the wordmark.
- `morph`: `chapter` is the list heading (default `CHAPTER`). Older configs set this with
  `label`; `label` is now the HUD scene name on every scene, so rename it to `chapter`.
- `counters`: `title`, `items: [{ value, decimals?, prefix?, suffix?, label }]`. Numbers count
  up one per beat in the display face; labels are mono; colors are `on-*` tokens. Real numbers only.
- `frames`: `src` (folder of `00000.jpg…`), `offset`, `ext`, `text`, `sub`. See §2b.

**Timings scale with `beats`.** Particles, echo, title, graph and the end card derive their
internal timings from the scene length (tuned at the default lengths). Each type has a
minimum (particles 3, echo 2, end 3, graph 3, leader 4, palette 5, title ≈ words × 0.35 + 2);
below it the render still works but logs `[reel] WARN … below its minimum`.

Live preview: serve the folder (e.g. `npx serve .`) and open `index.html?play=1`.
You can also open `index.html?frame=300`. The URL can override `w`, `h`, `fps`, `blur` and `seed`.

## 2. Render

```bash
# fast preview: 4 s, half-res, no motion blur
node render.js --out out/preview.mp4 --duration 4 --width 960 --height 540 --blur 1

# QA stills (PNG) at chosen frames → look at them before a full render
node render.js --stills 0,60,150,240,330,420,510,600,690,780,870 --out out/stills --blur 4

# full master (1920×1080, CONFIG blur); also writes out/reel.timing.json
node render.js --out out/reel.mp4 --workers 6
```

The beat table is written next to the output and named after it (`out/reel.mp4` →
`out/reel.timing.json`, `out/riso.mp4` → `out/riso.timing.json`), so rendering another page
into the same folder never overwrites it. `render.js` encodes limited-range (TV) BT.709
`yuv420p`; check with `ffprobe -show_entries stream=pix_fmt,color_range`.

`--page` renders another page and keeps its own query string:
`node render.js --page "riso-reel.html?q=med" --out out/riso.mp4`. The `--width`, `--height`,
`--fps`, `--blur` and `--seed` flags override matching page params.

### 2b. Shader + kinetic in one reel (`frames` scene)

`renderFrame(n)` may return a Promise; `render.js` awaits it (sync pages still work). The
`frames` scene uses that to fetch pre-rendered images before drawing:

```bash
cp ~/.claude/skills/motion-reel/assets/shader/riso-reel.html .
node render.js --page riso-reel.html --out out/riso.mp4 --keep-frames      # → out/riso_frames/
# CONFIG.scenes: { type: 'frames', beats: 8, field: 'action', src: 'out/riso_frames/', offset: 0, text: 'RISO' }
node render.js --out out/reel.mp4
```

Render both pages at the same fps and size. Set `field` to the image's dominant role so the
HUD stays legible. `text`/`sub` sit on a solid ink plate, never on the screened image.

Cost scales with `pixels × blur subframes`. For reference, 1080p30 with 12–16 subframes
took about 170 ms per frame per worker, so a 900-frame reel on 6 workers took about 30 s on an M-series Mac.

## 3. Audio + mux

```bash
python3 make_audio.py --timing out/reel.timing.json --out out/audio.wav     # same beat table as the picture
ffmpeg -y -i out/reel.mp4 -i out/audio.wav -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart out/reel-final.mp4
# or in one go:
node render.js --out out/reel-final.mp4 --audio out/audio.wav
```

The arrangement follows the timing: leader ticks only when the first scene is a `leader`,
drums stop at the last scene, and the **breakdown** (no kick, snare roll) is the 2–4 beats
right before the last scene (kept inside the scene before it), so the roll lands on the end
card. It prints `breakdown=a-b`. Override with `--breakdown 20-24` (or `none`), `--intro`,
`--outro`.

**You can't listen to it.** Check it these ways instead:

```bash
ffmpeg -hide_banner -nostats -i out/audio.wav -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | grep -A14 Summary
~/.claude/skills/motion-reel/assets/qa/contact-sheet.sh audio out/audio.wav # waveform PNG: hits on beats, gap before final hit
```

The target is about −14 LUFS integrated with peaks at or below −1 dBFS.

## 4. Exports

```bash
# Social (< 30 MB, broad compatibility): CRF with a maxrate cap
ffmpeg -y -i out/reel-final.mp4 -c:v libx264 -preset slow -crf 22 -maxrate 6M -bufsize 12M \
  -pix_fmt yuv420p -profile:v high -level 4.1 -c:a aac -b:a 192k -movflags +faststart out/reel-social.mp4
ls -lh out/reel-social.mp4            # 30 s @ 6 Mbps ≈ 23 MB; lower -maxrate if over

# Web hero (muted autoplay loop, small): drop audio, 720p
ffmpeg -y -i out/reel.mp4 -vf scale=1280:-2 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -an -movflags +faststart out/reel-web.mp4

# Vertical / portrait: re-RENDER at the target size (layouts adapt), don't crop
node render.js --out out/reel-4x5.mp4  --width 1080 --height 1350 --audio out/audio.wav   # feed 4:5
node render.js --out out/reel-9x16.mp4 --width 1080 --height 1920 --audio out/audio.wav   # stories/reels/shorts

# Verify every deliverable
ffprobe -v error -show_entries stream=codec_name,pix_fmt,color_range,width,height,r_frame_rate,nb_frames,duration -of compact out/reel-final.mp4
~/.claude/skills/motion-reel/assets/qa/contact-sheet.sh video out/reel-final.mp4 6 5
~/.claude/skills/motion-reel/assets/qa/contact-sheet.sh cuts  out/reel-final.mp4
```

## Files

| file | purpose |
|---|---|
| `index.html` | CONFIG, beat table, easing, PRNG, type system, 12 scene types, post (blur, glitch, vignette, grain, HUD) |
| `render.js` | Parallel headless renderer + ffmpeg encode/mux, writes `<out>.timing.json` |
| `make_audio.py` | Beat-locked synth that works with or without numpy and loudness-normalizes |
| `package.json` | `puppeteer-core` + npm script shortcuts |

The determinism rules and gotchas are in `references/video-pipeline.md`.
