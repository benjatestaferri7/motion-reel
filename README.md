# motion-reel

An agent skill that builds **spectacular, motion-designer-grade websites and code-rendered videos**: hard cuts between full-bleed color fields, ultra-heavy kinetic type, HUD corners, particles, shape morphs, and 3D riso-print shaders. Every motion is timed to a beat. It works with any brand and palette.

> [Leer en español](README.es.md)

## Quick path

1. Install the skill:
   ```bash
   git clone https://github.com/benjatestaferri7/motion-reel ~/.claude/skills/motion-reel
   ```
2. Open any project in Claude Code and ask:
   > Use motion-reel to redesign this landing page.
3. Answer two questions, one at a time:
   - **Style:** Swiss Kinetic, Riso Shader, Hybrid, or Surprise me.
   - **Palette:** your brand color, a preset, or Surprise me.
4. The agent builds the result, then checks it with headless screenshots or a video contact sheet before reporting back.

To use it in a single project only, clone it into `<project>/.claude/skills/motion-reel` instead.

## What it can make

| Output | Examples |
|--------|----------|
| Website | Landing redesigns in any stack (React/Next templates included; the patterns port to Vue, Svelte, Astro, or plain HTML) |
| Video | 15–45 s showreels, launch clips, social promos in 16:9, 4:5 and 9:16, with synthesized audio |
| Both | The video works as the storyboard, and the site reuses the same scenes |

## Styles

| Style | Look | Best for |
|-------|------|----------|
| **Swiss Kinetic** | Flat color cuts, giant wide caps, outline echoes, width-axis stretch, scramble text, graph-editor UI, perspective tunnels | Studios, SaaS, launches, portfolios |
| **Riso Shader** | Raw WebGL2 ray-traced spheres, 3-ink halftone print, plate misregistration, paper grain | Brands that want tactile, poster-like 3D with no dependencies |
| **Hybrid** | Shader fields behind kinetic type | Hero sections and premium campaigns |

## Palettes

Palettes are built from four **roles** (`ink`, `bone`, `action`, `machine`), never from fixed hex values. Text color for each field is chosen by WCAG contrast.

```bash
node assets/palette/palette.mjs --list                                  # 15 curated presets
node assets/palette/palette.mjs --brand "#1DB954" --format css          # derive from your brand
node assets/palette/palette.mjs --surprise --mood "wellness calm" --seed 3
```

Output formats: `css` (custom properties), `tailwind`, `config` (for the video template), `json` (includes a contrast matrix).

## Requirements

| Tool | Needed for |
|------|------------|
| An agent that supports `SKILL.md` skills (built for Claude Code) | Everything |
| Node.js 18+ | Palette tool, video render, QA screenshots |
| Chrome, Brave, or Chromium | Headless video render and QA (found automatically) |
| ffmpeg | Video encoding |
| Python 3 (numpy optional) | Synthesized soundtrack |

**Platforms:** macOS and Linux work out of the box. On Windows, the Node scripts run in PowerShell, but `contact-sheet.sh` needs WSL or Git Bash. If the browser isn't found, set `BROWSER_PATH`. In Docker or CI running as root, sandbox flags are added automatically (or set `NO_SANDBOX=1`).

## Layout

```
motion-reel/
├── SKILL.md                  # Runtime contract the agent follows
├── references/               # Design system, palettes, web, video, shader rules
└── assets/
    ├── palette/              # palette.mjs + presets.json (zero dependencies)
    ├── web/                  # React/TS components: HUD, particles, morphs, tunnel, glitch cuts…
    ├── video/reel-template/  # Deterministic canvas reel → headless browser → ffmpeg
    ├── shader/               # Riso Shader (WebGL2) standalone + React wrapper
    └── qa/                   # Screenshot and contact-sheet QA scripts
```

## Principles the skill enforces

- One signature move per scene, with loud and quiet scenes alternating.
- Everything lands on a beat grid, and every key pose holds for at least one beat.
- Honors `prefers-reduced-motion`, keeps canvases paused off-screen, and avoids horizontal overflow on mobile.
- Never invents testimonials, metrics, or clients.
- Avoids common AI design clichés: purple gradients, glassmorphism, rows of three icon cards, and similar.

## Credits

This skill grew out of the September 2026 "Opus 5.5 motion designer showreel" posts by [@shneural](https://x.com/shneural/status/2103151003272962130), [@aiehon_aya](https://x.com/aiehon_aya/status/2103403361022419005), [@Fujin_Metaverse](https://x.com/Fujin_Metaverse/status/2103325252415860767) and [@akiy_8](https://x.com/akiy_8/status/2103434383218872503). Their prompts and breakdowns showed what the pipeline could do.

## License

[Apache-2.0](LICENSE)
