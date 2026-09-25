#!/usr/bin/env node
// ============================================================================
// render.js — parallel deterministic renderer for index.html → MP4.
//
// Serves this folder over HTTP, launches N headless Chrome/Brave/Chromium
// instances (puppeteer-core, no bundled browser), each rendering a disjoint
// stride of frames via window.renderFrame(n) → canvas.toDataURL → JPEG/PNG,
// then encodes with ffmpeg (H.264, yuv420p limited/TV range, BT.709 tags,
// +faststart) and optionally muxes a WAV. Also writes <out>.timing.json (beat
// table) next to the output, for make_audio.py --timing.
//
// renderFrame(n) may be synchronous or return a Promise (e.g. a scene that
// fetches pre-rendered shader frames before drawing); render.js awaits it.
//
// Usage
//   node render.js --out out/reel.mp4                       full reel, config size
//   node render.js --out out/preview.mp4 --duration 2 --width 960 --height 540 --blur 1
//   node render.js --out out/reel.mp4 --audio out/audio.wav --workers 6
//   node render.js --stills 0,150,300 --out out/stills       PNG stills only (QA)
//   node render.js --page "riso-reel.html?q=med" --out out/riso.mp4   another page (+ its own query)
//   node render.js --out out/vertical.mp4 --width 1080 --height 1920
//
// Flags
//   --out PATH        .mp4 path (or a folder with --stills)        [out/reel.mp4]
//   --fps N  --width N  --height N  --blur N  --seed N               [from CONFIG]
//   --from S          start time in seconds                           [0]
//   --duration S      seconds to render (default: whole reel)
//   --workers N       parallel browsers                  [max(1, min(8, cpus-2))]
//   --audio PATH      mux this WAV (AAC 320k), trimmed to the video
//   --crf N           x264 quality (lower = better/larger)             [16]
//   --format jpg|png  intermediate frames                              [jpg]
//   --keep-frames     keep the frame folder after encoding
//   --page FILE       page to render, may carry its own ?query          [index.html]
//                     (CLI --width/--height/--fps/--blur/--seed override it)
//   --browser PATH    browser executable (else $BROWSER_PATH / $CHROME_PATH / auto-detect)
//   --which-browser   print the detected browser + launch flags, then exit
//
// Browser & platforms
//   Detection order: --browser, $BROWSER_PATH, $CHROME_PATH, then Chrome /
//   Chromium / Brave / Edge in the usual macOS, Linux (PATH, /usr/bin,
//   /snap/bin) and Windows (%PROGRAMFILES%, %PROGRAMFILES(X86)%, %LOCALAPPDATA%)
//   locations. Running as root on Linux (Docker/CI) or with NO_SANDBOX=1 adds
//   --no-sandbox --disable-dev-shm-usage automatically.
// ============================================================================
'use strict';
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = __dirname;
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const num = (k, d) => (opt(k) !== undefined ? Number(opt(k)) : d);

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

function hasFfmpeg() { return spawnSync('ffmpeg', ['-version']).status === 0; }

// ---------------------------------------------------------------- static server
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// ---------------------------------------------------------------- page helpers
// URL API, so a --page that already has a query string (riso-reel.html?q=med)
// gets merged params instead of a second "?".
function pageUrl(port) {
  const u = new URL(opt('page', 'index.html').replace(/^\/+/, ''), `http://127.0.0.1:${port}/`);
  for (const [flagName, key] of [['width', 'w'], ['height', 'h'], ['fps', 'fps'], ['blur', 'blur'], ['seed', 'seed']]) if (opt(flagName) !== undefined) u.searchParams.set(key, opt(flagName));
  return u.href;
}

async function openPage(exe, port, wid) {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: launchArgs(['--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--font-render-hinting=none']),
    defaultViewport: { width: num('width', 1920), height: num('height', 1080), deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  // [reel] boot logs/warnings print once (probe page); errors from every worker.
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || (wid === 'p' && t.startsWith('[reel]'))) console.log(`[w${wid}]`, t); });
  page.on('pageerror', e => console.log(`[w${wid}] PAGEERROR`, e.message));
  await page.goto(pageUrl(port), { waitUntil: 'load' });
  await page.waitForFunction('window.READY === true', { timeout: 120000 });
  return { browser, page };
}

async function worker(exe, port, list, wid, dir, fmt) {
  const { browser, page } = await openPage(exe, port, wid);
  const t0 = Date.now();
  let done = 0;
  for (const n of list) {
    const b64 = await page.evaluate(async (n, fmt) => {
      await window.renderFrame(n); // sync or async (Promise) renderFrame both work
      const c = document.getElementById('c');
      return fmt === 'png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.95);
    }, n, fmt);
    fs.writeFileSync(path.join(dir, String(n).padStart(5, '0') + '.' + fmt), Buffer.from(b64.split(',')[1], 'base64'));
    if (++done % 50 === 0) console.log(`[w${wid}] ${done}/${list.length} (${((Date.now() - t0) / done).toFixed(0)} ms/frame)`);
  }
  await browser.close();
}

// ---------------------------------------------------------------- main
(async () => {
  const exe = findBrowser(opt('browser'));
  console.log('browser:', exe);
  if (flag('which-browser')) { console.log('flags:', launchArgs([]).join(' ') || '(none)'); return; }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // Read the beat table / frame count from the page itself (single source of truth).
  const probe = await openPage(exe, port, 'p');
  const REEL = await probe.page.evaluate(() => window.REEL);
  await probe.browser.close();

  const stills = opt('stills');
  const out = path.resolve(opt('out', stills ? 'out/stills' : 'out/reel.mp4'));
  const outDir = stills ? out : path.dirname(out);
  fs.mkdirSync(outDir, { recursive: true });
  // Beat table next to the output, named after it (out/reel.mp4 → out/reel.timing.json),
  // so rendering another page into the same folder never clobbers this reel's timing.
  const timingPath = path.join(path.dirname(out), path.basename(out, path.extname(out)) + '.timing.json');
  fs.writeFileSync(timingPath, JSON.stringify(REEL, null, 2));
  console.log('timing:', timingPath);

  const fps = REEL.fps;
  let frames;
  if (stills) frames = stills.split(',').map(Number).filter(n => n >= 0 && n < REEL.totalFrames);
  else {
    const f0 = Math.round(num('from', 0) * fps);
    const f1 = opt('duration') !== undefined ? Math.min(REEL.totalFrames, f0 + Math.round(num('duration') * fps)) : REEL.totalFrames;
    frames = []; for (let i = f0; i < f1; i++) frames.push(i);
  }
  if (!frames.length) throw new Error('no frames to render');
  const fmt = stills ? 'png' : opt('format', 'jpg');
  const framesDir = stills ? out : path.join(outDir, path.basename(out, path.extname(out)) + '_frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const workers = Math.max(1, Math.min(frames.length, num('workers', Math.max(1, Math.min(8, os.cpus().length - 2)))));
  console.log(`rendering ${frames.length} frames @${fps}fps ${REEL.width}x${REEL.height} with ${workers} workers → ${framesDir}`);
  const t0 = Date.now();
  const lists = Array.from({ length: workers }, () => []);
  frames.forEach((n, i) => lists[i % workers].push(n)); // stride: balances heavy and light scenes
  await Promise.all(lists.map((l, i) => (l.length ? worker(exe, port, l, i, framesDir, fmt) : null)));
  console.log(`rendered ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  server.close();
  if (stills) return;

  if (!hasFfmpeg()) { console.log('ffmpeg not found — frames kept in', framesDir); return; }
  const audio = opt('audio');
  const args = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-start_number', String(frames[0]), '-i', path.join(framesDir, `%05d.${fmt}`)];
  if (audio) args.push('-ss', String(frames[0] / fps), '-i', path.resolve(audio));
  // JPEG frames decode as full-range yuvj420p; convert explicitly to limited (TV)
  // range BT.709 yuv420p and tag it, or players show crushed/washed-out levels.
  args.push('-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(num('crf', 16)), '-pix_fmt', 'yuv420p',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart');
  if (audio) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push(out);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log('wrote', out);
  if (!flag('keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
})().catch(e => { console.error(e); server.close(); process.exit(1); });
