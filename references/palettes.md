# Palettes — 4 roles, any brand

Generator: `assets/palette/palette.mjs` (zero deps, Node ≥ 18). Presets: `assets/palette/presets.json`. Never invent hex values. Run the script and use its output.

## The role model

| Role | Field use | Rule |
|---|---|---|
| `ink` (system) | frame, quiet, night scenes | near-black, never `#000`, slight brand-hue tint |
| `bone` (human) | editorial, long copy | off-white, never `#FFF`, warm or cool tint |
| `action` (brand) | STATEMENT scenes | hottest, most saturated brand color |
| `machine` (counter) | PROOF / data scenes | counter hue (~150–210° rotation) or analogous-dark if moody |

Derived tokens (the script computes all of them):
- `on-<role>`: ink or bone, whichever contrasts more with the field. Always ≥ 4.5:1. If neither reaches 4.5 on action/machine, the script shifts the field's OKLCH lightness (keeping hue, and chroma where the gamut allows). ADJUSTMENTS in the report lists every shift.
- `hud-on-<role>`: solid color = `on-<role>` at 70% over the field. Alpha goes up until it reaches 4.5:1.
- Forbidden pairs: roles under 3:1. Never use them as text-on-background. The usual ones are `action × machine`, `ink × machine`, and `bone × action` for light actions.

## Intake flow (run at skill start)

Ask ONE question, then STOP:

> Palette: (1) I have a brand color · (2) Pick a preset · (3) Surprise me

1. **Brand color.** Ask for the hex(es). Run `node palette.mjs --brand "#HEX"`. To pin a secondary, pass `--machine` (or `--ink/--bone/--action`). Pinned roles are still contrast-checked.
2. **Preset.** Show `node palette.mjs --list` (name, 3 tags, 4 hexes). Then run `--preset <name>`.
3. **Surprise me.** Infer 3–6 mood/industry tags from the README, existing CSS, copy, package name and the user's words. Run `node palette.mjs --surprise --mood "tag, tag, tag" --seed 1`. Add `--brand` if a brand color exists. Show the palette and its `why:` lines. Offer ONE re-roll with the printed `--seed <n+1> --exclude <shown>`.

Show the ROLES and FORBIDDEN PAIRS sections before building.

### Behaviors to know
- Light-cusp hues stay light and take ink text: yellow, lime or aqua when the brand is already light (L ≥ 0.78). `#FFD400` stays `#FFD400`.
- Achromatic brands (`#000`, `#FFF`, greys) have no hue. The script warns and borrows the action hue from the best mood-matched preset (`signal` with no mood). Suggest `--action` to pick one.
- A mood with `--brand` sets three things. Machine: analogous-dark for moody/calm/luxury, complement for loud. Bone tint: cool for tech/clinical, warm for organic/editorial. Chroma: 85% for calm. Same inputs + seed give the same output.
- Exit code 1: bad input or an unfixable palette. Stop and ask.

## Applying the output

`--format css|tailwind|config|json` writes to stdout. The report goes to stderr (`--quiet` hides it).

**Web.** `--format css` prints `:root` vars as RGB triplets. They replace the EXAMPLE PALETTE block in `assets/web/tokens.css`.
```css
background: rgb(var(--reel-action));
color: rgb(var(--reel-on-action));
border-color: rgb(var(--reel-on-action) / 0.4);
```
Tailwind: `--format tailwind` prints a `colors: { reel: {...} }` snippet over the same vars (`bg-reel-action text-reel-on-action`).

**Video.** `--format config` prints `palette: { ink, bone, action, machine, onInk…onMachine, hudOnInk…hudOnMachine, forbiddenPairs }` as hex strings. It goes into `CONFIG.palette`.

**Fonts.** Presets suggest a Google Fonts pairing. A `wdth` range means the display font supports kinetic width. With `no wdth axis`, fall back to `scaleX` or swap to Anybody/Archivo.

## Rules

- Never hardcode hex in components. Use tokens only.
- Text on a field ALWAYS uses `on-<field>`. HUD uses `hud-on-<field>`. Never assume light-on-dark.
- No `mix-blend-mode: difference` for HUD over saturated fields. Over red it gives cyan, over blue it gives yellow: both off-palette. Use it over ink/bone only.
- Never use a forbidden pair as text/background, chips and buttons included.
- Never 3 same-role fields in a row. Alternate luminance so hard cuts land.
- action and machine are full-bleed statement/proof FIELDS. Never use them as small body text on ink/bone.
- Flat fields only: no gradients between roles (no purple→cyan clichés).
- After editing presets, run `node palette.mjs --validate`. Every preset must pass with zero adjustments.

## Presets

| name | tags | ink | bone | action | machine |
|---|---|---|---|---|---|
| signal | agency, studio, tech | #0B0B0D | #EDEAE3 | #FF3B1F | #2B35FF |
| acid | crypto, gaming, web3 | #0C0D0A | #F0EFE7 | #D4F53C | #2331D6 |
| cargo | logistics, industrial, engineering | #0D0E12 | #F2EEE4 | #FF9F1C | #1D4ED8 |
| kiln | editorial, publishing, architecture | #14110F | #F1EBE0 | #D9623B | #0F5E5C |
| flamingo | beauty, fashion, social | #0F0B0D | #F3ECEE | #FF3D8B | #006B6B |
| bloom | sustainability, climate, fintech | #0B0F0D | #EEF0EA | #19C37D | #5B2BD6 |
| arctic | sports, outdoor, automotive | #0A0D12 | #EDF1F3 | #F7372F | #115BB8 |
| obsidian | luxury, fashion, jewelry | #0E0D0C | #EFEBE4 | #C9A45C | #57534E |
| solar | energy, events, festival | #100C0A | #F4EEE3 | #FF6A13 | #4B1FB8 |
| orchard | food, restaurant, agriculture | #0D0F0C | #F1EDE3 | #F2442E | #1F5B3A |
| candy | kids, education, consumer | #0E0C14 | #F6F0F2 | #FF8FC7 | #1B2A6B |
| voltage | construction, security, hardware | #0B0B0A | #EFEDE6 | #FFE11A | #3B4150 |
| apothecary | wellness, skincare, spa | #120E0E | #F0ECE4 | #8C2335 | #7F9A7A |
| clinic | healthtech, medical, biotech | #0B0F10 | #EEF2F1 | #00C2A8 | #9E1B32 |
| ledger | fintech, banking, payments | #0A0C12 | #EEF0F2 | #3B78FF | #0E5A5A |

Polarity varies: apothecary's action is dark (bone text) and its machine is light (ink text). Read `on-*` from the output, never from this table.
