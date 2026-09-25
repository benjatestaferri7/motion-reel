#!/usr/bin/env node
// motion-reel palette generator — zero dependencies, Node >= 18, ESM.
//
// Four roles, each a full-bleed scene field:
//   ink (system) · bone (human) · action (statement) · machine (proof/data)
// Derived: on-<role> text color (ink or bone, WCAG >= 4.5:1, field lightness
// auto-adjusted in OKLCH if needed), hud-on-<role>, forbidden pairs (< 3:1).
//
// CLI (see --help):
//   node palette.mjs --brand "#1DB954" [--machine "#..."] [--format css]
//   node palette.mjs --preset signal
//   node palette.mjs --surprise --mood "fintech, trustworthy, bold" [--seed 42]
//   node palette.mjs --list | --validate
//
// Import:
//   import { derivePalette, loadPreset, surprise, contrast, toCss } from "./palette.mjs"

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PRESETS_PATH = join(HERE, "presets.json");
export const ROLES = ["ink", "bone", "action", "machine"];

const MIN_TEXT = 4.5; // body text
const MIN_PAIR = 3.0; // below this a pair is forbidden as text/background
const HUD_ALPHA = 0.7;

// ───────────────────────── color math (sRGB ↔ OKLab ↔ OKLCH) ─────────────────────────

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const norm360 = (h) => ((h % 360) + 360) % 360;

export function parseHex(input) {
  if (typeof input !== "string") throw new Error(`Not a color: ${input}`);
  let s = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error(`Invalid hex color: "${input}" (use #RRGGBB)`);
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
}

export function toHex(rgb) {
  return (
    "#" +
    rgb
      .map((c) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055);

export function srgbToOklab(rgb) {
  const [r, g, b] = rgb.map(s2l);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToSrgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(l2s);
}

export function hexToOklch(hex) {
  const [L, a, b] = srgbToOklab(parseHex(hex));
  const c = Math.hypot(a, b);
  return { l: L, c, h: c < 1e-4 ? 0 : norm360((Math.atan2(b, a) * 180) / Math.PI) };
}

function oklchToRgbRaw({ l, c, h }) {
  const r = (h * Math.PI) / 180;
  return oklabToSrgb([l, c * Math.cos(r), c * Math.sin(r)]);
}

const inGamut = (rgb, eps = 1e-5) => rgb.every((v) => v >= -eps && v <= 1 + eps);

/** Largest chroma at (l, h) that stays inside sRGB. */
export function maxChroma(l, h) {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbRaw({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** OKLCH → hex with gamut clamp by chroma reduction (hue and lightness preserved). */
export function oklchToHex({ l, c, h }) {
  const cc = Math.min(c, maxChroma(l, h));
  return toHex(oklchToRgbRaw({ l, c: cc, h }));
}

/** Lightness at which a hue reaches its maximum in-gamut chroma. */
export function cuspL(h) {
  let best = { l: 0.5, c: 0 };
  for (let l = 0.3; l <= 0.985; l += 0.005) {
    const c = maxChroma(l, h);
    if (c > best.c) best = { l, c };
  }
  return best.l;
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(s2l);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two hex colors. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function grade(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "large-only";
  return "FAIL";
}

function deltaE(hexA, hexB) {
  const [a, b] = [srgbToOklab(parseHex(hexA)), srgbToOklab(parseHex(hexB))];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function blend(fgHex, bgHex, alpha) {
  const f = parseHex(fgHex);
  const b = parseHex(bgHex);
  return toHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

const rgbTriplet = (hex) => parseHex(hex).map((v) => Math.round(v * 255)).join(" ");
const fmtLch = ({ l, c, h }) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${Math.round(h)})`;

// ───────────────────────── seeded PRNG + mood parsing ─────────────────────────

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toSeed(v) {
  if (v === undefined || v === null || v === "") return 1;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.trunc(n);
  let h = 2166136261;
  for (const ch of String(v)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SYNONYMS = {
  finance: ["fintech", "banking"], financial: ["fintech"], bank: ["banking", "fintech"], money: ["fintech", "payments"],
  payment: ["payments"], trust: ["trustworthy"], trusted: ["trustworthy"], reliable: ["trustworthy", "reliable"],
  secure: ["security", "trustworthy"], loud: ["loud", "bold"], hype: ["loud", "energetic"], punchy: ["bold", "loud"],
  energetic: ["energetic", "bold"], vibrant: ["loud", "playful"], serene: ["calm"], quiet: ["calm", "minimal"],
  soft: ["calm"], gentle: ["calm"], relaxing: ["calm", "wellness"], natural: ["organic", "botanical"],
  earthy: ["organic", "warm"], eco: ["sustainability", "climate"], green: ["sustainability"], blockchain: ["crypto", "web3"],
  nft: ["crypto", "web3"], defi: ["crypto", "fintech"], game: ["gaming"], games: ["gaming"], esports: ["gaming", "loud"],
  health: ["health", "wellness"], healthcare: ["health", "medical"], clinic: ["clinical", "medical"], pharma: ["biotech", "medical"],
  ai: ["tech"], ml: ["tech"], saas: ["saas", "tech"], software: ["tech", "saas"], developer: ["devtools", "tech"],
  dev: ["devtools", "tech"], api: ["devtools", "tech"], data: ["tech", "saas"], premium: ["premium", "luxury"],
  "high-end": ["luxury"], elegant: ["elegant", "luxury"], kids: ["kids"], children: ["kids"], family: ["kids", "friendly"],
  learning: ["education"], school: ["education"], restaurant: ["restaurant", "food"], cafe: ["food", "hospitality"],
  coffee: ["food", "warm"], hotel: ["hospitality"], travel: ["hospitality", "outdoor"], sport: ["sports"],
  fitness: ["athletic", "sports"], gym: ["athletic"], cars: ["automotive"], car: ["automotive"], ev: ["automotive", "energy"],
  shipping: ["logistics"], delivery: ["logistics"], factory: ["industrial"], architect: ["architecture"],
  magazine: ["editorial", "publishing"], media: ["editorial"], news: ["editorial"], agency: ["agency", "studio"],
  design: ["studio"], portfolio: ["studio", "showreel"], music: ["music"], club: ["rave", "music"], nightlife: ["rave"],
  beauty: ["beauty"], cosmetics: ["beauty", "skincare"], jewelry: ["jewelry", "luxury"], property: ["realestate"],
  "real-estate": ["realestate"], estate: ["realestate"], solar: ["energy"], climate: ["climate", "sustainability"],
};

const MOOD_WARM = new Set(["warm", "organic", "wellness", "calm", "food", "craft", "editorial", "human", "luxury", "fashion",
  "heritage", "hospitality", "beauty", "botanical", "skincare", "spa", "restaurant", "farm", "agriculture", "friendly", "kids"]);
const MOOD_COOL = new Set(["tech", "fintech", "saas", "clinical", "medical", "science", "biotech", "cold", "nordic", "crypto",
  "web3", "devtools", "security", "engineering", "banking", "payments", "insurance", "clean", "automotive", "trustworthy"]);
const MOOD_MOODY = new Set(["moody", "luxury", "calm", "wellness", "organic", "premium", "elegant", "noir", "dark",
  "cinematic", "minimal", "serious", "botanical", "spa", "therapy", "trustworthy"]);
const MOOD_LOUD = new Set(["loud", "bold", "playful", "gaming", "crypto", "energetic", "youth", "music", "sports", "festival",
  "rave", "punk", "events", "launch", "candy", "social", "creator"]);

export function moodTokens(mood) {
  if (!mood) return [];
  const raw = String(mood).toLowerCase().split(/[\s,;/|+]+/).map((t) => t.replace(/[^a-z0-9-]/g, "")).filter(Boolean);
  const out = new Set();
  for (const t of raw) {
    out.add(t);
    for (const s of SYNONYMS[t] ?? []) out.add(s);
  }
  return [...out];
}

export function moodProfile(mood) {
  const tokens = moodTokens(mood);
  const count = (set) => tokens.filter((t) => set.has(t)).length;
  const warm = count(MOOD_WARM);
  const cool = count(MOOD_COOL);
  const moody = count(MOOD_MOODY);
  const loud = count(MOOD_LOUD);
  const machineMode = moody > loud ? "analogous-dark" : "complement";
  return {
    tokens,
    tint: cool > warm ? "cool" : warm > cool ? "warm" : null,
    machineMode,
    energy: loud > moody ? "loud" : moody > loud ? "calm" : "neutral",
    coolBias: cool > warm ? 0.08 : warm > cool ? 0 : 0.03,
    chromaScale: moody > loud ? 0.85 : 1,
    machineL: loud > moody ? 0.48 : moody > loud ? 0.46 : 0.5,
  };
}

// ───────────────────────── presets ─────────────────────────

let presetCache = null;
export function readPresets(path = PRESETS_PATH) {
  if (!presetCache || path !== PRESETS_PATH) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (path !== PRESETS_PATH) return data.presets;
    presetCache = data.presets;
  }
  return presetCache;
}

const tagMatches = (token, tag) =>
  token === tag || (token.length >= 4 && tag.length >= 4 && (tag.startsWith(token) || token.startsWith(tag)));

/** Rank presets by mood/industry tag overlap; ties broken by a seeded PRNG. */
export function rankPresets(mood, { seed = 1, exclude = [] } = {}) {
  const tokens = moodTokens(mood);
  const rng = mulberry32(toSeed(seed));
  return readPresets()
    .filter((p) => !exclude.includes(p.name))
    .map((p) => {
      const matched = tokens.filter((t) => p.tags.some((tag) => tagMatches(t, tag)));
      return { preset: p, score: matched.length, matched, jitter: rng() };
    })
    .sort((a, b) => b.score - a.score || b.jitter - a.jitter);
}

// ───────────────────────── palette assembly ─────────────────────────

/** Move a field's OKLCH lightness (keeping hue, and chroma where gamut allows) until ink or bone reaches 4.5:1. */
function ensureReadable(hex, ink, bone) {
  const best = (h) => Math.max(contrast(h, ink), contrast(h, bone));
  if (best(hex) >= MIN_TEXT) return { hex, adjusted: false };
  const o = hexToOklch(hex);
  for (let d = 0.0025; d <= 0.9; d += 0.0025) {
    const hits = [];
    for (const dir of [1, -1]) {
      const l = o.l + dir * d;
      if (l <= 0.02 || l >= 0.99) continue;
      const c = Math.min(o.c, maxChroma(l, o.h));
      const cand = oklchToHex({ l, c, h: o.h });
      if (best(cand) >= MIN_TEXT) hits.push({ hex: cand, c, l });
    }
    if (hits.length) {
      hits.sort((a, b) => b.c - a.c);
      return { hex: hits[0].hex, adjusted: true, from: hex, fromL: o.l, toL: hits[0].l, fromC: o.c, toC: hits[0].c };
    }
  }
  return { hex, adjusted: false, impossible: true };
}

function normalizeNeutral(role, hex, warnings, adjustments) {
  const o = hexToOklch(hex);
  let l = o.l;
  if (role === "ink") {
    if (o.l < 0.1) l = 0.15;
    else if (o.l > 0.3) l = 0.2;
  } else {
    if (o.l > 0.975) l = 0.955;
    else if (o.l < 0.86) l = 0.9;
  }
  if (l === o.l) return hex;
  const out = oklchToHex({ l, c: o.c, h: o.h });
  const why = role === "ink"
    ? (o.l < 0.1 ? "pure/near #000 is forbidden for ink" : "ink must stay near-black")
    : (o.l > 0.975 ? "pure/near #FFF is forbidden for bone" : "bone must stay off-white");
  warnings.push(`${role} ${hex} → ${out}: ${why}.`);
  adjustments.push({ role, from: hex, to: out, reason: why });
  return out;
}

/**
 * Build a full palette from 4 role hexes: normalizes ink/bone, fixes field
 * lightness for readability, derives on-/hud- tokens, matrix and forbidden pairs.
 */
export function buildPalette(roles, meta = {}) {
  const warnings = [...(meta.warnings ?? [])];
  const adjustments = [...(meta.adjustments ?? [])];
  for (const r of ROLES) if (!roles[r]) throw new Error(`Missing role "${r}"`);
  const hex = Object.fromEntries(ROLES.map((r) => [r, toHex(parseHex(roles[r]))]));

  hex.ink = normalizeNeutral("ink", hex.ink, warnings, adjustments);
  hex.bone = normalizeNeutral("bone", hex.bone, warnings, adjustments);
  const inkBone = contrast(hex.ink, hex.bone);

  for (const r of ["action", "machine"]) {
    const res = ensureReadable(hex[r], hex.ink, hex.bone);
    if (res.adjusted) {
      const reason = `lightness ${res.fromL.toFixed(3)} → ${res.toL.toFixed(3)}${res.toC < res.fromC - 0.002 ? `, chroma ${res.fromC.toFixed(3)} → ${res.toC.toFixed(3)} (gamut)` : ""} so ink or bone reaches ${MIN_TEXT}:1`;
      adjustments.push({ role: r, from: res.from, to: res.hex, reason });
      hex[r] = res.hex;
    }
  }

  const on = {};
  const text = {};
  for (const r of ROLES) {
    const cInk = contrast(hex[r], hex.ink);
    const cBone = contrast(hex[r], hex.bone);
    const pick = r === "ink" ? "bone" : r === "bone" ? "ink" : cInk >= cBone ? "ink" : "bone";
    on[r] = hex[pick];
    const ratio = pick === "ink" ? cInk : cBone;
    text[r] = { on: pick, ratio: round2(ratio), grade: grade(ratio), vsInk: round2(cInk), vsBone: round2(cBone) };
  }

  const hud = {};
  for (const r of ROLES) {
    let alpha = HUD_ALPHA;
    let h = blend(on[r], hex[r], alpha);
    while (contrast(h, hex[r]) < MIN_TEXT && alpha < 1) {
      alpha = Math.min(1, +(alpha + 0.05).toFixed(2));
      h = blend(on[r], hex[r], alpha);
    }
    hud[r] = { hex: h, alpha, ratio: round2(contrast(h, hex[r])) };
  }

  const matrix = {};
  const forbiddenPairs = [];
  for (const a of ROLES) {
    matrix[a] = {};
    for (const b of ROLES) matrix[a][b] = round2(contrast(hex[a], hex[b]));
  }
  for (let i = 0; i < ROLES.length; i++)
    for (let j = i + 1; j < ROLES.length; j++) {
      const ratio = matrix[ROLES[i]][ROLES[j]];
      if (ratio < MIN_PAIR) forbiddenPairs.push({ a: ROLES[i], b: ROLES[j], ratio });
    }

  const problems = [];
  if (inkBone < MIN_TEXT) problems.push(`ink/bone contrast ${inkBone.toFixed(2)} < ${MIN_TEXT}`);
  for (const r of ROLES) if (text[r].ratio < MIN_TEXT) problems.push(`on-${r} contrast ${text[r].ratio} < ${MIN_TEXT}`);

  return {
    name: meta.name ?? "custom",
    label: meta.label ?? meta.name ?? "Custom",
    source: meta.source ?? "custom",
    reasons: meta.reasons ?? [],
    warnings,
    adjustments,
    ...hex,
    oklch: Object.fromEntries(ROLES.map((r) => [r, roundLch(hexToOklch(hex[r]))])),
    on,
    hud,
    text,
    matrix,
    forbiddenPairs,
    tags: meta.tags,
    fontPairing: meta.fontPairing,
    notes: meta.notes,
    ok: problems.length === 0,
    problems,
  };
}

const round2 = (x) => Math.round(x * 100) / 100;
const roundLch = ({ l, c, h }) => ({ l: +l.toFixed(4), c: +c.toFixed(4), h: +h.toFixed(1) });

// ───────────────────────── public generators ─────────────────────────

export function loadPreset(name, overrides = {}) {
  const p = readPresets().find((x) => x.name === String(name).toLowerCase());
  if (!p) throw new Error(`Unknown preset "${name}". Available: ${readPresets().map((x) => x.name).join(", ")}`);
  const roles = { ink: p.ink, bone: p.bone, action: p.action, machine: p.machine };
  const reasons = [`preset "${p.name}" (${p.tags.slice(0, 4).join(", ")})`];
  for (const r of ROLES) if (overrides[r]) { roles[r] = overrides[r]; reasons.push(`${r} overridden → ${overrides[r]}`); }
  return buildPalette(roles, { name: p.name, label: p.label, source: "preset", tags: p.tags, fontPairing: p.fontPairing, notes: p.notes, reasons });
}

/**
 * Derive a palette from a brand color.
 * opts: { brand, ink?, bone?, action?, machine?, mood?, seed? }
 */
export function derivePalette(opts = {}) {
  const warnings = [];
  const reasons = [];
  const profile = moodProfile(opts.mood);
  const rng = mulberry32(toSeed(opts.seed));
  let seedHex = opts.brand ?? opts.action;
  if (!seedHex) throw new Error("derivePalette needs --brand (or --action).");
  seedHex = toHex(parseHex(seedHex));
  let brand = hexToOklch(seedHex);

  // Achromatic brand (black/white/grey): borrow a hue from the mood-matched preset.
  if (!opts.action && brand.c < 0.03) {
    const pick = rankPresets(opts.mood, { seed: opts.seed })[0].preset;
    const donor = opts.mood ? pick : readPresets().find((p) => p.name === "signal");
    warnings.push(
      `brand ${seedHex} is achromatic (chroma ${brand.c.toFixed(3)}): no hue to push into an action color. ` +
        `Borrowed the action hue from preset "${donor.name}"${opts.mood ? ` (best match for mood "${opts.mood}")` : " (default)"}. ` +
        `Pass --action "#..." to choose it yourself; the brand neutral can inform --ink/--bone instead.`,
    );
    brand = hexToOklch(donor.action);
  }

  // ACTION: push into the reel range. Light-cusp hues (yellow/lime/aqua) that are already light stay light (ink text).
  let action = opts.action;
  if (!action) {
    const cusp = cuspL(brand.h);
    const light = brand.l >= 0.78 && cusp >= 0.8;
    const l = light ? clamp(brand.l, 0.8, Math.min(cusp, 0.93)) : clamp(brand.l, 0.58, 0.7);
    const c = Math.min(maxChroma(l, brand.h), 0.32) * profile.chromaScale;
    action = oklchToHex({ l, c, h: brand.h });
    reasons.push(
      `action: brand hue ${Math.round(brand.h)}° at L ${l.toFixed(2)} with ${profile.chromaScale < 1 ? "85% of " : ""}max in-gamut chroma` +
        (light ? " (light-cusp hue kept light → ink text)" : " (reel range L 0.58–0.70)"),
    );
  } else reasons.push(`action overridden → ${action}`);
  const a = hexToOklch(action);

  // MACHINE: counter hue (rotation 150–210°) or analogous-dark variant for moody palettes.
  let machine = opts.machine;
  if (!machine) {
    const analog = profile.machineMode === "analogous-dark";
    // Complement: core window 150–210°, soft-extended to 130–240° with a small penalty
    // (red → ultramarine needs ~237°, since the pure 180° cyan-teal is chroma-starved at L 0.5).
    const rots = analog ? [-60, -50, -40, -30, 30, 40, 50, 60] : Array.from({ length: 23 }, (_, i) => 130 + i * 5);
    const outside = (rot) => (analog ? 0 : Math.max(0, 150 - rot, rot - 210) * 0.002);
    const L = analog ? 0.38 : profile.machineL;
    const cands = rots.map((rot) => {
      const h = norm360(a.h + rot);
      const c = Math.min(maxChroma(L, h), analog ? 0.11 : 0.26);
      const hex = oklchToHex({ l: L, c, h });
      const cool = h >= 200 && h <= 300 ? profile.coolBias : 0; // machine leans cool
      // dark yellows (60–125°) turn olive/brown at L ≤ 0.5: penalized below as "mud"
      return { rot, h, c, hex, score: deltaE(action, hex) + 0.5 * c + cool - outside(rot) - (h >= 60 && h <= 125 ? 0.08 : 0) };
    });
    cands.sort((x, y) => y.score - x.score);
    const near = cands.filter((x) => x.score >= cands[0].score - 0.015);
    const pick = near[Math.floor(rng() * near.length)];
    machine = pick.hex;
    reasons.push(
      `machine: ${analog ? "analogous-dark variant (moody mood)" : "counter hue"} rotated ${pick.rot > 0 ? "+" : ""}${pick.rot}° → ${Math.round(pick.h)}° ` +
        `at L ${L.toFixed(2)}, chosen for max distinctiveness vs action (ΔE ${deltaE(action, machine).toFixed(3)}, ${near.length} near-tie${near.length > 1 ? "s broken by seed" : ""})`,
    );
  } else reasons.push(`machine overridden → ${machine}`);

  // INK / BONE: slight tints.
  const ink = opts.ink ?? oklchToHex({ l: 0.16, c: 0.009, h: a.h });
  const tint = profile.tint ?? "warm";
  const bone = opts.bone ?? oklchToHex({ l: 0.94, c: 0.01, h: tint === "cool" ? 235 : 85 });
  reasons.push(opts.ink ? `ink overridden → ${opts.ink}` : `ink: L 0.16 tinted toward action hue (C 0.009)`);
  reasons.push(opts.bone ? `bone overridden → ${opts.bone}` : `bone: L 0.94, ${tint} tint${profile.tint ? ` (from mood)` : " (default paper)"}`);

  return buildPalette(
    { ink, bone, action, machine },
    { name: opts.name ?? "brand", label: `Derived from ${seedHex}`, source: "brand", reasons, warnings },
  );
}

/**
 * Surprise: with a brand → derive with mood-driven machine/tint; without → best tag-matching preset.
 * opts: { mood, seed, brand?, exclude?: string[], ink?, bone?, action?, machine? }
 */
export function surprise(opts = {}) {
  const seed = toSeed(opts.seed);
  if (opts.brand) {
    const p = derivePalette({ ...opts, seed });
    const prof = moodProfile(opts.mood);
    p.source = "surprise+brand";
    p.reasons.unshift(
      `surprise from brand ${opts.brand}, mood "${opts.mood ?? ""}" → machine ${prof.machineMode}, energy ${prof.energy}, bone ${prof.tint ?? "warm (default)"} tint, seed ${seed}`,
    );
    return p;
  }
  const ranked = rankPresets(opts.mood, { seed, exclude: opts.exclude ?? [] });
  if (!ranked.length) throw new Error("No presets left after --exclude.");
  const top = ranked[0];
  const overrides = Object.fromEntries(ROLES.filter((r) => opts[r]).map((r) => [r, opts[r]]));
  const p = loadPreset(top.preset.name, overrides);
  p.source = "surprise";
  const ties = ranked.filter((r) => r.score === top.score).length;
  p.reasons.unshift(
    top.score > 0
      ? `surprise: mood "${opts.mood}" matched ${top.score} tag(s) [${top.matched.join(", ")}]` +
          (ties > 1 ? `; ${ties}-way tie broken by seed ${seed}` : "") +
          `. Runners-up: ${ranked.slice(1, 4).map((r) => `${r.preset.name}(${r.score})`).join(", ")}`
      : `surprise: no tag matched mood "${opts.mood ?? ""}"; picked at random with seed ${seed}`,
    `re-roll: --seed ${seed + 1} --exclude ${[...(opts.exclude ?? []), top.preset.name].join(",")}`,
  );
  return p;
}

// ───────────────────────── formatters ─────────────────────────

const TOKEN_KEYS = [
  ...ROLES.map((r) => [r, (p) => p[r]]),
  ...ROLES.map((r) => [`on-${r}`, (p) => p.on[r]]),
  ...ROLES.map((r) => [`hud-on-${r}`, (p) => p.hud[r].hex]),
];

/** CSS custom properties as RGB channel triplets: use rgb(var(--reel-ink)) or rgb(var(--reel-ink) / 0.5). */
export function toCss(p) {
  const lines = TOKEN_KEYS.map(([k, get]) => `  --reel-${k}: ${rgbTriplet(get(p))}; /* ${get(p)} */`);
  const fp = p.fontPairing;
  const fonts = fp ? `\n  /* fonts: display ${fp.display}${fp.wdth ? ` (wdth ${fp.wdth.join("–")})` : " (no wdth axis)"}, mono ${fp.mono}, body ${fp.body} */` : "";
  const forb = p.forbiddenPairs.length ? `\n  /* forbidden text/bg pairs: ${p.forbiddenPairs.map((f) => `${f.a}×${f.b}`).join(", ")} */` : "";
  return `/* motion-reel palette: ${p.name} (${p.source}) */\n:root {\n${lines.join("\n")}${fonts}${forb}\n}`;
}

export function toTailwind(p) {
  const lines = TOKEN_KEYS.map(([k, get]) => `      ${/-/.test(k) ? `'${k}'` : k}: 'rgb(var(--reel-${k}) / <alpha-value>)', // ${get(p)}`);
  return `// tailwind.config → theme.extend (needs the :root vars from --format css)\ncolors: {\n  reel: {\n${lines.map((l) => l.slice(2)).join("\n")}\n  },\n},`;
}

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function toConfig(p) {
  const lines = TOKEN_KEYS.map(([k, get]) => `  ${camel(k)}: "${get(p)}",`);
  const forb = p.forbiddenPairs.map((f) => `["${f.a}", "${f.b}"]`).join(", ");
  return `palette: {\n${lines.join("\n")}\n  forbiddenPairs: [${forb}],\n},`;
}

export function toJson(p) {
  const tokens = Object.fromEntries(TOKEN_KEYS.map(([k, get]) => [k, get(p)]));
  return JSON.stringify({ ...p, tokens }, null, 2);
}

// ───────────────────────── report ─────────────────────────

const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;
function swatch(hex) {
  if (!useColor()) return "";
  const [r, g, b] = parseHex(hex).map((v) => Math.round(v * 255));
  return `\x1b[48;2;${r};${g};${b}m    \x1b[0m `;
}
const pad = (s, n) => String(s).padEnd(n);

export function report(p) {
  const out = [];
  out.push(`motion-reel palette · ${p.label} [${p.source}]${p.ok ? "" : "  ✗ INVALID"}`);
  for (const r of p.reasons) out.push(`  why: ${r}`);
  out.push("", "ROLES");
  for (const r of ROLES)
    out.push(`  ${swatch(p[r])}${pad(r, 8)} ${p[r]}  ${pad(fmtLch(p.oklch[r]), 26)} text → on-${pad(r, 8)} ${p.on[r]}  ${p.text[r].ratio}:1 ${p.text[r].grade}`);
  out.push("", "CONTRAST (field vs ink / vs bone)");
  for (const r of ROLES) {
    const t = p.text[r];
    const vi = r === "ink" ? "—" : `${t.vsInk.toFixed(2)} ${grade(t.vsInk)}`;
    const vb = r === "bone" ? "—" : `${t.vsBone.toFixed(2)} ${grade(t.vsBone)}`;
    out.push(`  ${pad(r, 8)} vs ink ${pad(vi, 18)} vs bone ${pad(vb, 18)} → on-${r} = ${t.on}`);
  }
  out.push("", "HUD (on-<field> blended over field; alpha raised until ≥ 4.5:1)");
  for (const r of ROLES) out.push(`  hud-on-${pad(r, 8)} ${p.hud[r].hex}  alpha ${p.hud[r].alpha.toFixed(2)}  ${p.hud[r].ratio}:1`);
  out.push("", "FORBIDDEN PAIRS (< 3:1 — never text-on-background)");
  if (p.forbiddenPairs.length) for (const f of p.forbiddenPairs) out.push(`  ${f.a} × ${f.b}  ${f.ratio}:1`);
  else out.push("  none");
  out.push("", "ADJUSTMENTS");
  if (p.adjustments.length) for (const a of p.adjustments) out.push(`  ${a.role}: ${a.from} → ${a.to} (${a.reason})`);
  else out.push("  none");
  if (p.warnings.length) {
    out.push("", "WARNINGS");
    for (const w of p.warnings) out.push(`  ! ${w}`);
  }
  if (p.fontPairing) {
    const f = p.fontPairing;
    out.push("", "FONTS (Google Fonts)", `  display ${f.display}${f.wdth ? ` · wdth ${f.wdth.join("–")}` : " · no wdth axis"} · mono ${f.mono} · body ${f.body}`);
  }
  if (p.notes) out.push("", "NOTES", `  ${p.notes}`);
  if (!p.ok) out.push("", "PROBLEMS", ...p.problems.map((x) => `  ✗ ${x}`));
  return out.join("\n");
}

// ───────────────────────── validation ─────────────────────────

const DISPLAY_FONTS = { Anybody: [50, 150], Archivo: [62, 125], "Mona Sans": [75, 125], "Hubot Sans": [75, 125], "Roboto Flex": [25, 151], Unbounded: null, Syne: null, "Lexend Zetta": null, "Dela Gothic One": null, "Archivo Black": null };
const MONO_FONTS = ["Space Mono", "JetBrains Mono", "Geist Mono", "Martian Mono", "IBM Plex Mono", "Azeret Mono"];
const BODY_FONTS = ["Hanken Grotesk", "Instrument Sans", "Figtree", "Manrope", "Space Grotesk", "IBM Plex Sans"];

/** Check every preset against the rules. Returns [{name, ok, issues}] */
export function validatePresets() {
  const seen = new Set();
  return readPresets().map((pr) => {
    const issues = [];
    if (seen.has(pr.name)) issues.push("duplicate name");
    seen.add(pr.name);
    if (!Array.isArray(pr.tags) || pr.tags.length < 4) issues.push("needs ≥ 4 tags");
    const p = loadPreset(pr.name);
    if (!p.ok) issues.push(...p.problems);
    for (const a of p.adjustments) issues.push(`needed adjustment: ${a.role} ${a.from} → ${a.to}`);
    if (pr.ink.toUpperCase() === "#000000") issues.push("ink is #000");
    if (pr.bone.toUpperCase() === "#FFFFFF") issues.push("bone is #FFF");
    if (contrast(pr.ink, pr.bone) < 12) issues.push(`ink/bone only ${contrast(pr.ink, pr.bone).toFixed(2)}:1 (want ≥ 12)`);
    if (p.oklch.action.c < 0.08) issues.push(`action chroma ${p.oklch.action.c} too low`);
    const f = pr.fontPairing ?? {};
    if (!(f.display in DISPLAY_FONTS)) issues.push(`display font "${f.display}" not in allowlist`);
    else if (JSON.stringify(DISPLAY_FONTS[f.display]) !== JSON.stringify(f.wdth ?? null)) issues.push(`wdth for ${f.display} should be ${JSON.stringify(DISPLAY_FONTS[f.display])}`);
    if (!MONO_FONTS.includes(f.mono)) issues.push(`mono font "${f.mono}" not in allowlist`);
    if (!BODY_FONTS.includes(f.body)) issues.push(`body font "${f.body}" not in allowlist`);
    return { name: pr.name, ok: issues.length === 0, issues, palette: p };
  });
}

// ───────────────────────── CLI ─────────────────────────

const HELP = `motion-reel palette — 4-role full-bleed palettes (ink · bone · action · machine)

  --brand "#1DB954"            derive from a brand color
  --preset <name>              load a curated preset (see --list)
  --surprise --mood "a, b, c"  pick by mood/industry tags (with --brand: derive, mood picks machine/tint)
  --seed <n>                   deterministic tie-breaks / re-rolls (default 1)
  --exclude a,b                skip presets (for re-rolls)
  --ink/--bone/--action/--machine "#..."   override any role (still contrast-checked)
  --format css|json|tailwind|config        machine-readable output on stdout, report on stderr
  --quiet                      suppress the stderr report when --format is set
  --list                       list presets        --validate   check every preset against the rules`;

function parseArgs(argv) {
  const o = {};
  const bool = new Set(["surprise", "list", "validate", "help", "quiet"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument "${a}"`);
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    if (bool.has(k)) o[k] = true;
    else {
      const v = inline ?? argv[++i];
      if (v === undefined) throw new Error(`--${k} needs a value`);
      o[k] = v;
    }
  }
  return o;
}

function listPresets() {
  const rows = readPresets().map((p) => `  ${swatch(p.ink)}${swatch(p.bone)}${swatch(p.action)}${swatch(p.machine)}${pad(p.name, 11)} ${p.ink} ${p.bone} ${p.action} ${p.machine}  ${p.tags.slice(0, 3).join(", ")}`);
  return [`  ${pad("name", 11)} ${pad("ink", 7)} ${pad("bone", 7)} ${pad("action", 7)} ${pad("machine", 7)}  tags`, ...rows].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || Object.keys(args).length === 0) return console.log(HELP), 0;

  if (args.list) {
    if (args.format === "json") console.log(JSON.stringify(readPresets(), null, 2));
    else console.log(listPresets());
    return 0;
  }
  if (args.validate) {
    const res = validatePresets();
    for (const r of res)
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${pad(r.name, 11)} on-action ${pad(r.palette.text.action.ratio, 5)} on-machine ${pad(r.palette.text.machine.ratio, 5)} forbidden: ${r.palette.forbiddenPairs.map((f) => `${f.a}×${f.b}`).join(", ") || "none"}${r.ok ? "" : "\n      " + r.issues.join("\n      ")}`);
    const bad = res.filter((r) => !r.ok).length;
    console.log(`\n${res.length - bad}/${res.length} presets pass.`);
    return bad ? 1 : 0;
  }

  const overrides = Object.fromEntries(ROLES.filter((r) => args[r]).map((r) => [r, args[r]]));
  const exclude = args.exclude ? args.exclude.split(",").map((s) => s.trim()) : [];
  let p;
  if (args.surprise) p = surprise({ ...overrides, brand: args.brand, mood: args.mood, seed: args.seed, exclude });
  else if (args.preset) p = loadPreset(args.preset, overrides);
  else if (args.brand || args.action) p = derivePalette({ ...overrides, brand: args.brand, mood: args.mood, seed: args.seed });
  else throw new Error("Nothing to do: pass --brand, --preset, --surprise, --list or --validate (see --help).");

  const fmt = args.format;
  const formats = { css: toCss, json: toJson, tailwind: toTailwind, config: toConfig };
  if (fmt) {
    if (!formats[fmt]) throw new Error(`Unknown --format "${fmt}" (css|json|tailwind|config)`);
    if (!args.quiet) console.error(report(p) + "\n");
    console.log(formats[fmt](p));
  } else {
    console.log(report(p));
    console.log("\n── CSS ──\n" + toCss(p));
    console.log("\n── TAILWIND ──\n" + toTailwind(p));
    console.log("\n── VIDEO CONFIG ──\n" + toConfig(p));
  }
  return p.ok ? 0 : 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (await import("node:fs")).realpathSync(process.argv[1]);
if (isMain) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`palette: ${e.message}`);
    process.exitCode = 1;
  }
}
