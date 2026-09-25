#!/usr/bin/env node
// ============================================================================
// qa-screenshots.js — headless scroll-through QA for reel-style sites.
//
// For each viewport (desktop 1440×900, mobile 390×844 touch) it loads the URL,
// waits for intro/leader animations, scrolls ~0.9 viewport per step, waits for
// scroll-triggered motion to SETTLE (scramble/count-up/reveals look broken
// mid-animation), and captures JPEGs. It reports:
//   - horizontal overflow (scrollWidth − innerWidth) + the widest offenders
//   - console errors, page errors, failed requests (HTTP ≥ 400)
// Screenshots are real pixels at 1× (unlike scaled preview panes), so type
// clipping and overflow are judged on what users actually get.
//
// Usage
//   node qa-screenshots.js --url http://localhost:3000/ --out qa-shots
//   node qa-screenshots.js --url … --reduced        emulate prefers-reduced-motion
//   node qa-screenshots.js --url … --strict         exit 1 on overflow/errors
// Flags: --wait ms (after load, default 3500) · --settle ms (per step, 1400)
//        --max N (shots per viewport, 40) · --browser PATH (else auto-detect)
//        --which-browser (print the detected browser + launch flags, then exit)
//
// Browser detection order: --browser, $BROWSER_PATH, $CHROME_PATH, then
// Chrome / Chromium / Brave / Edge in the usual macOS, Linux (PATH, /usr/bin,
// /snap/bin) and Windows (%PROGRAMFILES%, %PROGRAMFILES(X86)%, %LOCALAPPDATA%)
// locations. Running as root on Linux (Docker/CI) or with NO_SANDBOX=1 adds
// --no-sandbox --disable-dev-shm-usage automatically.
//
// Platforms: macOS and Linux work natively. Windows: this script and
// render.js run in PowerShell with Node; contact-sheet.sh (bash) needs WSL or
// Git Bash. Docker/CI usually runs as root, so the sandbox flags above are
// added for you.
// Needs puppeteer-core resolvable (npm i -D puppeteer-core, or run it from a
// folder that has it, e.g. the video reel-template).
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// Resolve puppeteer-core next to this script first, then from the current folder.
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { puppeteer = require(require.resolve('puppeteer-core', { paths: [process.cwd()] })); }

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const URL_ = opt('url', 'http://localhost:3000/');
const OUT = path.resolve(opt('out', 'qa-shots'));
const WAIT = Number(opt('wait', 3500));
const SETTLE = Number(opt('settle', 1400));
const MAX = Number(opt('max', 40));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- browser launch
// Same helper lives in video/reel-template/render.js and qa/qa-screenshots.js
// (each script stays standalone). Keep both copies in sync.
function onPath(name) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
  }
  return null;
}

function findBrowser(cliPath) {
  const env = process.env;
  const explicit = cliPath || env.BROWSER_PATH || env.CHROME_PATH || env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) {
    const hit = fs.existsSync(explicit) ? explicit : onPath(explicit);
    if (hit) return hit;
    throw new Error(`Browser not found at "${explicit}" (from --browser, BROWSER_PATH, CHROME_PATH or PUPPETEER_EXECUTABLE_PATH). Fix the path or unset it to auto-detect.`);
  }
  const tried = [];
  const check = p => { tried.push(p); return p && fs.existsSync(p) ? p : null; };
  if (process.platform === 'darwin') {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Chromium.app/Contents/MacOS/Chromium',
      'Brave Browser.app/Contents/MacOS/Brave Browser',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
    for (const root of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      for (const a of apps) { const hit = check(path.join(root, a)); if (hit) return hit; }
    }
  } else if (process.platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    const rels = [
      'Google\\Chrome\\Application\\chrome.exe',
      'Microsoft\\Edge\\Application\\msedge.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];
    for (const root of roots) for (const r of rels) { const hit = check(path.join(root, r)); if (hit) return hit; }
  } else {
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge', 'microsoft-edge-stable'];
    for (const n of names) {
      tried.push(`${n} (PATH)`);
      const hit = onPath(n); if (hit) return hit;
      for (const dir of ['/usr/bin', '/snap/bin']) { const h = check(path.join(dir, n)); if (h) return h; }
    }
  }
  throw new Error([
    `No Chrome/Chromium/Brave/Edge found on ${process.platform}. Tried:`,
    ...tried.map(t => '  - ' + t),
    'Install one, or point to it explicitly:',
    '  macOS/Linux:  BROWSER_PATH=/path/to/chrome node <script> …',
    '  PowerShell:   $env:BROWSER_PATH="C:\\Path\\To\\chrome.exe"; node <script> …',
    '  or pass --browser PATH',
  ].join('\n'));
}

// Chrome's sandbox cannot start as root (Docker/CI), and /dev/shm is tiny in
// containers. Add the escape hatches only when needed.
function launchArgs(base) {
  const noSandbox = process.env.NO_SANDBOX === '1' || (process.platform === 'linux' && process.getuid?.() === 0);
  return noSandbox ? [...base, '--no-sandbox', '--disable-dev-shm-usage'] : base;
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = findBrowser(opt('browser'));
  if (flag('which-browser')) { console.log('browser:', exe); console.log('flags:', launchArgs([]).join(' ') || '(none)'); return; }
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: launchArgs(['--no-first-run', '--hide-scrollbars']) });
  const report = { url: URL_, reducedMotion: flag('reduced'), viewports: [] };
  let problems = 0;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
    await page.setViewport({ deviceScaleFactor: 1, ...vp });
    if (flag('reduced')) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await sleep(WAIT); // leader / intro timelines

    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = Math.round(vp.height * 0.9);
    const shots = [];
    for (let y = 0, i = 0; y < H && i < MAX; y += step, i++) {
      await page.evaluate(y => window.scrollTo(0, y), y);
      await sleep(SETTLE); // let scrubs catch up and one-shot tweens finish
      const file = path.join(OUT, `${vp.name}_${String(i).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
      shots.push(path.basename(file));
    }

    const overflow = await page.evaluate(() => {
      // clientWidth, not innerWidth: with mobile emulation innerWidth grows to fit overflowing content.
      const iw = document.documentElement.clientWidth;
      const px = document.documentElement.scrollWidth - iw;
      const offenders = [...document.querySelectorAll('body *')]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.width > 0 && r.right > iw + 1 && getComputedStyle(el).position !== 'fixed')
        .sort((a, b) => b.r.right - a.r.right)
        .slice(0, 8)
        .map(({ el, r }) => {
          const id = el.id ? '#' + el.id : '';
          const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
          return `${el.tagName.toLowerCase()}${id}${cls} right=${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 30)}"`;
        });
      return { px, offenders };
    });
    // Offenders inside overflow:hidden/clip parents are fine; px > 0 is what users feel.
    if (overflow.px > 0 || errors.length) problems++;
    report.viewports.push({ ...vp, height: H, shots: shots.length, horizontalOverflowPx: overflow.px, offenders: overflow.px > 0 ? overflow.offenders : [], errors: errors.slice(0, 20) });
    console.log(`${vp.name}: page ${H}px · ${shots.length} shots · hOverflow ${overflow.px}px · errors ${errors.length}`);
    if (overflow.px > 0) overflow.offenders.forEach(o => console.log('  overflow:', o));
    errors.slice(0, 8).forEach(e => console.log('  ', e));
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('wrote', OUT);
  if (flag('strict') && problems) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
