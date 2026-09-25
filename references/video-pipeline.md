# Video pipeline: code-rendered motion reels

`index.html` (canvas) → `render.js` (N headless browsers) → frames → ffmpeg → MP4, plus
`make_audio.py`, which synthesizes a WAV from the same beat table. The template lives in
`assets/video/reel-template/`.

## End to end

1. **Storyboard in beats.** Set `CONFIG.scenes` with `beats`, `field` and copy. At 120 BPM,
   60 beats is 30.0 s. Cuts land on beats, so scene starts are cuts and `cuts: [...]` adds
   internal ones. Scene timings scale with `beats`; below a type's minimum the page logs a
   `[reel] WARN`.
2. **Iterate on stills.** Run `render.js --stills …` at the frames that matter (mid-scene, just
   after each cut, the final hit), then make a contact sheet. It's cheap and catches layout
   bugs before a full render.
3. **Preview video** at half resolution with `--blur 1` to check timing and rhythm.
4. **Master render** at full resolution with blur subframes. `render.js` writes
   `<out>.timing.json` next to the video (`out/reel.mp4` → `out/reel.timing.json`).
5. **Audio:** `make_audio.py --timing out/reel.timing.json`.
6. **Mux, then export** the social, web, 4:5 and 9:16 variants (re-render, don't crop).
7. **Verify** with ffprobe (codec, size, fps, frame count, duration), a contact sheet, a cut
   sheet, and the loudness and waveform of the audio.

## Determinism rules (non-negotiable)

`renderFrame(n)` must be a **pure function of n**. Workers render interleaved frames in
separate browsers, out of order. It may be sync or return a Promise; `render.js` awaits it.
Do async work (fetching pre-rendered frames, decoding images) before drawing, then draw
synchronously; the template's `frames` scene does this in `prepare()`.

- **No `Date.now()`, `performance.now()`, `Math.random()` or `requestAnimationFrame`** in any
  draw path. Time is `n / fps`, and randomness is `mulberry32(seed)` or `hash(frame, i)`.
- **No state carried between frames.** Physics simulations, like the web particle springs,
  are not allowed. Use closed-form motion instead: the particle chaos is Lissajous in time
  and the convergence is `lerp(chaos(t), target, ease(progress))`.
- **Per-frame noise** (film scratches, grain offset, glitch slices) is seeded by the frame number.
- Precompute everything at boot (particle targets, resampled shapes, arc-length curve,
  grain tiles), then set `window.READY = true`. The renderer waits for it.
- The `?play=1` preview uses rAF on purpose and is never used for output.

## Beat math

```
SPB = 60 / BPM                 seconds per beat
FPB = SPB * fps                frames per beat   (120 BPM @ 30 fps = 15; 128 BPM = 14.0625)
frame(beat) = round(beat * 60 / BPM * fps)       cut frames
localBeat = t / FPB − scene.b0                   what scenes animate on (float, subframe-accurate)
```

- Prefer a whole FPB (120 BPM at 30 or 60 fps). The template and `riso-reel.html` both
  default to 30 fps and log a warning otherwise. If FPB is fractional, **round only the cut
  frames** and animate on the continuous local beat.
- **Final hit** is on the last downbeat (`totalBeats − 1`). The template leaves about 0.1 s of
  empty field before it, with matching silence in the audio, then shows one inverted frame
  with a shockwave on the hit.
- **The HUD's BEAT NN/60 and timecode** derive from `n`, so they match the audio by construction.

## Motion blur (subframes)

- Each output frame averages `blur` subframes spread over `shutter × 1 frame`, accumulated in a
  `Float32Array` via `getImageData`.
- **Clamp subframe times inside the current cut segment.** Otherwise a blurred frame
  double-exposes both sides of a hard cut.
- Cost is linear in subframes and pixels. 1080p with 12–16 subframes took about 170 ms per
  frame per worker. Use `--blur 1` for previews, and set a per-scene `blur` (e.g. `1`) on
  static scenes.

## Fonts in canvas

- Canvas can't set `font-variation-settings`. The trick is to **register the same variable
  font file once per integer wdth value**, each `FontFace` pinned to a single
  `stretch: 'N%'` descriptor, with family names `RD62…RD125`. The browser clamps the axis to
  that value, so `ctx.font = '900 200px RD80'` means wdth 80.
- The Google Fonts CSS2 response is fetched to find the `latin` and `latin-ext` woff2 URLs.
  Self-hosted files work too (`fonts.display.files`).
- **Await `document.fonts.load(...)` for every face and weight you draw, then
  `document.fonts.ready`,** before measuring anything. Measure cap height from
  `actualBoundingBoxAscent` of "H".
- Faces without a `wdth` axis (`wdth: null`, common in presets) are registered once and
  width moves stretch them with `scaleX` over `simWdth`. The same happens when loading fails
  (offline, CSP) with the system fallback, so the reel still renders.
- A scene can switch display face with `font: 'key'` (any extra entry in `CONFIG.fonts`).

## Parallelism and I/O

- `render.js` probes `window.REEL` once (frame count, fps, beat table) and then splits frames
  **by stride** (`i % workers`). Heavy and light scenes spread evenly across workers.
- Launch flags: `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`,
  `--force-device-scale-factor=1`, `--font-render-hinting=none`.
- Frames travel as `canvas.toDataURL('image/jpeg', 0.95)` to disk and are encoded with
  `libx264 -crf 16`, converted to **limited (TV) range BT.709 `yuv420p`** via
  `-vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p -color_range tv`. JPEG
  input otherwise yields full-range `yuvj420p`, which many players show with wrong levels.
  Use PNG for stills and QA.
- `--page` URLs are built with the URL API, so a page with its own query string works.
- The number of workers is limited by CPU cores and memory (each browser plus a 1080p
  Float32 accumulator is roughly 100+ MB). `cpus − 2`, capped at 8, is the default.

## Verification

```bash
ffprobe -v error -show_entries stream=codec_name,pix_fmt,color_range,width,height,r_frame_rate,nb_frames,duration -of compact out/reel.mp4
assets/qa/contact-sheet.sh video out/reel.mp4 6 5      # whole reel in one image
assets/qa/contact-sheet.sh cuts  out/reel.mp4          # first frame after each cut
```

Check `pix_fmt=yuv420p` and `color_range=tv`, that `nb_frames` equals `totalFrames`, that the duration matches `totalBeats × 60 / BPM`,
and that the audio duration is at least the video duration (the `-shortest` flag trims it).

## Audio caveat: you can't listen

The agent can't hear the result, so verify it by other means:

- **Loudness:** `ffmpeg -af ebur128=peak=true:framelog=quiet` should give about −14 LUFS
  integrated with peaks at or below −1 dBFS. `make_audio.py` normalizes to this with a
  BS.1770-style K-weighted, gated measure and a soft clipper, so expect about ±0.5 LU.
- **Waveform** (`contact-sheet.sh audio`): look for transients on every beat, a gap in the
  breakdown (printed as `breakdown=a-b`: the 2–4 beats before the last scene; override with
  `--breakdown a-b` or `none`), and a flat line in the ~0.1 s before the final spike.
- **Timing:** the script prints cut times in seconds. Compare them with the cut frames divided by fps.
- Tell the user the audio hasn't been listened to and suggest they check it on headphones and speakers.
- The synth works without numpy (pure Python at 22.05 kHz, fewer pad voices). With numpy it
  runs at 48 kHz with FFT filters. Both use the same arrangement.
