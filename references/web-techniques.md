# Web techniques: patterns and gotchas

These are field notes from shipping a reel-style site: GSAP with ScrollTrigger, Lenis,
React server components with client islands, and canvas effects. The assets live in
`assets/web/`. This file explains **why** they are built the way they are.
Install the runtime deps first: `npm i gsap lenis` (React 18+; Tailwind optional via `tailwind-preset.ts`).

## Architecture

- **Scenes are server components, and motion lives in client islands.** Each `<Scene>` renders
  final-state markup (SEO, no-JS, reduced motion). Behavior comes from a few islands
  that read `data-*` hooks. `ReelMotion` handles `[data-reveal|wipe|count|words]`, `Hud`
  handles `[data-scene]`, `GlitchCut` handles `[data-cut]`, and the heavy components are
  `ParticleText`, `PerspectiveTunnel`, `GraphEditor` and `ShapeMorph`.
- **One GSAP registration point** is `gsap-setup.ts`. It also exports `MQ` so that JS media
  queries and the CSS media queries (`.only-motion-desktop`) never drift apart.
- **Mount order matters.** Pinning islands first, `ReelMotion` last, then a single
  `ScrollTrigger.sort()` + `refresh()` on the next frame. Pins insert spacers; triggers
  measured before that point are wrong by the pin length.
- **Framework-agnostic.** Nothing depends on Next.js. `SmoothScroll` takes a `routeKey` prop
  instead of importing a router, and plain React/Vite/Remix apps work the same way.

## GSAP

- **Always use `gsap.matchMedia()` and return `mm.revert()`** from the effect cleanup. It
  kills tweens and ScrollTriggers, restores inline styles, and survives React StrictMode's
  double mount. Don't use bare `gsap.to` in effects without a context.
- **Pin only at ≥1024px with motion allowed** (`MQ.pinnable`). On mobile, pins fight the URL bar
  resize, jump on orientation change, and make long pages feel stuck. Mobile gets the
  stacked layout, with scrub-without-pin or simple reveals.
- **Pin your own wrapper, never the `<section>`.** Anchors and `scroll-margin-top` keep
  working. `HorizontalReel` shows the pattern (`containerAnimation` for panel triggers).
- **Scrubbed proxies:** tween `{ p: 0 → 1 }` with `onUpdate: render(p)` and write to the DOM
  or SVG directly. React never re-renders on scroll.
- **CSS custom properties can be tweened** (`"--wdth": 62 → 125`) and consumed by
  `font-variation-settings: "wdth" var(--wdth)`. That's the whole kinetic width system.
  The font must be loaded **with the axis** (next/font `axes: ["wdth"]`, or a Google CSS2
  `wdth,wght@62..125,100..900` range).

## Lenis

- Drive Lenis from `gsap.ticker`, call `lenis.on("scroll", ScrollTrigger.update)`, and set
  `lagSmoothing(0)`. Pins then stay frame-locked. No `scrollerProxy` is needed in modern
  versions.
- **Skip Lenis entirely under reduced motion.** Every consumer must handle `getLenis() === null`.
- **Anchors:** use `scrollToId()`, which calls `lenis.resize()` then `scrollTo(target)`, and
  falls back to `scrollIntoView` without Lenis. For a hash on a hard load, wait for
  `document.fonts.ready`, then one `ScrollTrigger.refresh()`, then jump.
- **Mobile menu scroll lock:** `lenis.stop()` alone does nothing when Lenis is absent, and
  that's the reduced-motion user. Always pair it with `document.body.style.overflow = "hidden"`
  (see `use-scroll-lock.ts`). Close the menu **first**, then scroll on a deferred tick
  (about 180 ms). Scrolling in the same handler gets cancelled by the close re-render and
  `lenis.start()`.
- No hacks: don't set `html { scroll-behavior: smooth }`, don't add custom wheel listeners,
  and don't use `height: auto` tricks.

## Canvas islands (particles, tunnel)

- **Cap DPR at 1.5.** Fill cost scales with the square of DPR, and at 3× a full-bleed
  canvas is 9× the pixels for no visible gain on grainy, flat art.
- **Particle budget:** about 4200 on desktop, about 1200 on mobile. Size the sampling grid step from the
  filled area (`step = sqrt(area / budget)`) so every word gets the same density.
- **Run the rAF loop only when needed:** built, in view (IntersectionObserver with rootMargin),
  the tab visible (`visibilitychange`), and motion allowed. Otherwise stop it.
- **Resize:** debounce it (about 160 ms) and ignore height changes under 90 px, which are the
  mobile URL bar.
- **Wait for `document.fonts.ready` before sampling text into particles.** Otherwise you sample
  the fallback font and the word jumps later.
- **Read colors from CSS variables** (`getComputedStyle`) and never hardcode hex. Canvas accepts
  `rgb(r g b / a)` built from the `--reel-*` triplets.
- **Reduced motion** draws one static final frame, with no loop.

## Color and legibility

- **Role tokens only** (`--reel-ink|bone|action|machine`, plus `--reel-on-*` and
  `--reel-hud-on-*`). Values come from `assets/palette/palette.mjs`. Never guess text color
  per field. Light text on a saturated red-orange field routinely fails AA, and the
  generator decides per brand.
- **The nav stays solid** (ink bar with on-ink text), not `mix-blend-mode: difference`. Over a
  saturated field, difference inverts to an unpredictable hue (a hot red field turns it cyan)
  and thin mono text gets muddy. Treat difference blend as decoration only.
- **The HUD colors itself per field.** `Hud` reads `data-tone` of the scene under the viewport
  middle and sets `data-field`, and CSS maps that to `--reel-hud-on-<field>`.
- **Glitch flash:** 3 steps of about 55 ms with a 350 ms cooldown, which stays at 3 or fewer
  flashes per second (WCAG 2.3.1). It's hidden entirely for reduced motion.

## Accessibility

- **ScrambleText:** use one stable `.sr-only` copy plus an `aria-hidden` animated copy.
  Without the split, screen readers read glyph garbage or re-announce on every write.
- **Canvas, HUD, echoes and swapping panels are `aria-hidden`.** The real content is rendered
  as static markup next to them (the graph editor's steps, the tunnel's items, the particle
  word as a real heading).
- **The leader never blocks.** It uses `pointer-events: none`, any input skips it, it's
  CSS-timed and self-removes at 1.05 s even without JS, runs once per session, and is hidden
  before first paint by the inline boot script.
- **Reduced-motion CSS failsafe:** `[data-intro]` content is hidden only under `.reel-js`
  (motion allowed) and is revealed by a 4 s CSS animation if JS never arrives.
- **Count-up:** the server renders the final value. The animation always ends by restoring
  the exact original string.

## Hydration pitfalls

- Don't read `window`, `matchMedia` or `sessionStorage` during render. Do it in effects, or
  in the inline boot script (which sets classes on `<html>` before paint).
  `suppressHydrationWarning` on `<html>` covers the boot-script classes.
- Don't render random values (particles, scramble glyphs) on the server. Start them in effects.
- Keep islands leaf-level. A client component high in the tree pulls whole scenes into the bundle.

## QA

- **Mid-animation screenshots lie.** Scramble shows `K#7/Z…`, count-up shows `0%`, and reveals
  are half-masked. Wait longer than the longest one-shot (`--settle 1400`) before capturing.
- **Built-in browser-pane screenshots are scaled**, which hides 1–2 px clipping and makes
  overflow hard to judge. Use `assets/qa/qa-screenshots.js`: real 1× pixels at 1440 and 390,
  a horizontal-overflow number with offenders, console and page errors, and HTTP 4xx/5xx.
- **Watch for overflow** from huge `vw` display type with `white-space: nowrap`, wide `wdth`
  values, and marquee tracks. `body { overflow-x: clip }` (not `hidden`, which breaks
  `position: sticky`) is the safety net, not the fix.
- Test with `--reduced` too. Every scene must read correctly as a static page.
