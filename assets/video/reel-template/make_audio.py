#!/usr/bin/env python3
"""make_audio.py — beat-locked soundtrack synthesized entirely by math.

Reads the SAME beat table as the picture (<out>.timing.json, written by
render.js next to the video), so cuts, hits and the final silence line up by
construction.

    python3 make_audio.py --timing out/reel.timing.json --out out/audio.wav
    python3 make_audio.py --bpm 120 --beats 60 --cuts 4,12,18 --big 4,26 --out a.wav

Arrangement from the timing: leader ticks only if the first scene is a
`leader`; drums stop at the last scene (outro); the breakdown (no kick, snare
roll) is the last 2-4 beats BEFORE the last scene, kept inside the scene
before it, so the roll lands on the end card / final hit. Override with
--intro / --outro / --breakdown a-b (use --breakdown none to disable).

Voices: pitch-dropping sine kick, filtered-noise hats/claps, reverse whooshes
into every cut, booms on big cuts, risers, 7-voice detuned-saw chord pad
(A minor: Am F C G) with a filter sweep "camera", off-beat saw bass, and a
sidechain duck driven by the kick. ~0.1 s of silence before the final hit.
Master: loudness-normalized to ~-14 LUFS (BS.1770-style K-weighting + gating,
approximate) with a soft clipper at -1 dBFS.

numpy is OPTIONAL. With numpy: 48 kHz, FFT filters, ~5 s. Without: pure
Python, 22.05 kHz, biquads, fewer pad voices, ~20-40 s. Same arrangement.

The agent that runs this cannot LISTEN to it. Verify instead with:
  ffmpeg -i audio.wav -af ebur128=peak=true -f null -          (loudness/peak)
  ffmpeg -i audio.wav -filter_complex showwavespic=s=1600x300 -frames:v 1 wave.png
and check hits line up with cut times printed at the end.
"""
import argparse
import array
import json
import math
import random
import sys
import wave

try:
    import numpy as np
except ImportError:  # pure-Python fallback
    np = None

# ------------------------------------------------------------------ CLI / timing
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--timing', metavar='PATH', help='<out>.timing.json from render.js (e.g. out/reel.timing.json); overrides bpm/beats/cuts/big/final')
ap.add_argument('--bpm', type=float, default=120)
ap.add_argument('--beats', type=int, default=60, help='total beats')
ap.add_argument('--cuts', default='4,12,13,14,15,16,18,22,30,34,42,48,54', help='hard-cut beats (template defaults)')
ap.add_argument('--big', default='4,22,30,54', help='beats that get a boom + riser')
ap.add_argument('--final', type=float, default=None, help='final hit beat (default beats-1)')
ap.add_argument('--intro', type=float, default=None, help='beats of leader ticks before the groove (default: first scene length if it is a leader, else 0; 4 without timing)')
ap.add_argument('--outro', type=float, default=None, help='beat where drums stop (default: last scene start; without timing the last cut)')
ap.add_argument('--breakdown', default=None, help="a-b beats with no kick, or 'none' (default: 2-4 beats right before the outro)")
ap.add_argument('--silence', type=float, default=0.1, help='seconds of silence before the final hit')
ap.add_argument('--lufs', type=float, default=-14.0, help='integrated loudness target')
ap.add_argument('--sr', type=int, default=None, help='sample rate (48000 with numpy, 22050 without)')
ap.add_argument('--seed', type=int, default=128)
ap.add_argument('--out', default='audio.wav')
A = ap.parse_args()

BPM, BEATS = A.bpm, A.beats
CUTS = [float(x) for x in A.cuts.split(',') if x.strip()]
BIG = [float(x) for x in A.big.split(',') if x.strip()]
FINAL, SIL, INTRO, OUTRO = A.final, A.silence, A.intro, A.outro
SC = []
if A.timing:
    try:
        T = json.load(open(A.timing))
    except FileNotFoundError:
        sys.exit(f'timing file not found: {A.timing} (render.js writes <out>.timing.json next to the video)')
    BPM, BEATS = T['bpm'], T['totalBeats']
    CUTS, BIG, SIL = T['cuts'], T.get('big', []), T.get('silence', SIL)
    FINAL = T.get('finalBeat') if FINAL is None else FINAL
    SC = T.get('scenes') or []
    if INTRO is None:
        INTRO = SC[1]['b0'] if len(SC) > 1 and SC[0].get('type') == 'leader' else 0
    if OUTRO is None and len(SC) > 1:
        OUTRO = SC[-1]['b0']
FINAL = BEATS - 1 if FINAL is None else FINAL
INTRO = 4 if INTRO is None else INTRO
if OUTRO is None:
    inner = [c for c in CUTS if INTRO < c < FINAL]
    OUTRO = max(inner) if inner else BEATS - 8
if A.breakdown and A.breakdown.lower() != 'none':
    BD0, BD1 = [float(x) for x in A.breakdown.split('-')]
elif A.breakdown is None and OUTRO - INTRO >= 8:
    # Breakdown = the beats right before the last scene, so the snare roll lands on
    # the end card / final hit. Kept inside the scene before it (never straddles a cut).
    BD1 = OUTRO
    BD0 = max(OUTRO - (4 if OUTRO - INTRO >= 16 else 2), INTRO, SC[-2]['b0'] if len(SC) > 1 else 0)
    if BD1 - BD0 < 1:
        BD0 = BD1 = -1
else:
    BD0 = BD1 = -1
CUTS = [c for c in CUTS if 0 < c < BEATS and c != FINAL]

SR = A.sr or (48000 if np is not None else 22050)
SPB = 60.0 / BPM
DUR = BEATS * SPB
N = int(round(SR * DUR))
rng = random.Random(A.seed)
if np is not None:
    nrng = np.random.default_rng(A.seed)


def bt(b):
    return b * SPB


def bs(b):
    return int(round(bt(b) * SR))


def cl(x, a=0.0, b=1.0):
    return min(b, max(a, x))


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ primitives (numpy | pure)
def zeros(n):
    return np.zeros(n) if np is not None else [0.0] * n


def noise(n):
    if np is not None:
        return nrng.standard_normal(n)
    g = rng.gauss
    return [g(0, 1) for _ in range(n)]


def env(n, k, attack=0.0):
    """exp(-t*k) with optional linear attack (seconds)."""
    if np is not None:
        t = np.arange(n) / SR
        e = np.exp(-t * k)
        return e * np.minimum(1, t / attack) if attack else e
    out, a = [0.0] * n, math.exp(-k / SR)
    v = 1.0
    for i in range(n):
        out[i] = v * (min(1.0, i / SR / attack) if attack else 1.0)
        v *= a
    return out


def mul(x, y):
    return x * y if np is not None else [a * b for a, b in zip(x, y)]


def gain(x, g):
    return x * g if np is not None else [a * g for a in x]


def addv(x, y):
    return x + y if np is not None else [a + b for a, b in zip(x, y)]


def tanh(x, drive=1.0):
    return np.tanh(x * drive) if np is not None else [math.tanh(a * drive) for a in x]


def mix_into(dst, src, start, g=1.0):
    s = int(start)
    n = len(src)
    if s < 0:
        src, n, s = src[-s:], n + s, 0
    e = min(len(dst), s + n)
    if e <= s:
        return
    if np is not None:
        dst[s:e] += src[: e - s] * g
    else:
        for i in range(s, e):
            dst[i] += src[i - s] * g


def chirp(f_fn, n):
    """Sine with time-varying frequency f_fn(t_sec) (phase-accumulated)."""
    if np is not None:
        f = f_fn(np.arange(n) / SR)
        return np.sin(2 * np.pi * np.cumsum(f) / SR)
    out, ph = [0.0] * n, 0.0
    for i in range(n):
        ph += 2 * math.pi * f_fn(i / SR) / SR
        out[i] = math.sin(ph)
    return out


def biquad(kind, fc, q=0.707, db=0.0):
    """RBJ cookbook coefficients (b0, b1, b2, a1, a2), normalized."""
    w = 2 * math.pi * min(fc, SR * 0.45) / SR
    cw, sw = math.cos(w), math.sin(w)
    al = sw / (2 * q)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    else:  # high shelf
        A_ = 10 ** (db / 40); sa = 2 * math.sqrt(A_) * al
        b = [A_ * ((A_ + 1) + (A_ - 1) * cw + sa), -2 * A_ * ((A_ - 1) + (A_ + 1) * cw), A_ * ((A_ + 1) + (A_ - 1) * cw - sa)]
        a = [(A_ + 1) - (A_ - 1) * cw + sa, 2 * ((A_ - 1) - (A_ + 1) * cw), (A_ + 1) - (A_ - 1) * cw - sa]
    return (b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0])


def filt(x, kind, fc, q=0.707, db=0.0):
    c = biquad(kind, fc, q, db)
    if np is not None:  # apply the biquad's complex response in the frequency domain
        n = len(x)
        m = 1 << int(math.ceil(math.log2(n + 8192)))
        z = np.exp(-1j * np.pi * np.arange(m // 2 + 1) / (m // 2))
        Hz = (c[0] + c[1] * z + c[2] * z * z) / (1 + c[3] * z + c[4] * z * z)
        return np.fft.irfft(np.fft.rfft(x, m) * Hz, m)[:n]
    b0, b1, b2, a1, a2 = c
    y, x1, x2, y1, y2 = [0.0] * len(x), 0.0, 0.0, 0.0, 0.0
    for i, v in enumerate(x):
        o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, o
        y[i] = o
    return y


def sweep_lp(x, cutoff_at):
    """Low-pass whose cutoff follows cutoff_at(t_sec)."""
    if np is not None:  # STFT, sqrt-Hann, 50% overlap
        fr, hop = 2048, 1024
        win = np.sqrt(np.hanning(fr + 1)[:-1])
        pad = np.concatenate([np.zeros(fr), x, np.zeros(fr)])
        out = np.zeros_like(pad)
        f = np.fft.rfftfreq(fr, 1 / SR)
        for i in range(0, len(pad) - fr, hop):
            fc = cutoff_at((i - fr / 2) / SR)
            g = 1.0 / np.sqrt(1.0 + (f / fc) ** 4)
            out[i:i + fr] += np.fft.irfft(np.fft.rfft(pad[i:i + fr] * win) * g, fr) * win
        return out[fr:fr + len(x)]
    y, x1, x2, y1, y2, c = [0.0] * len(x), 0.0, 0.0, 0.0, 0.0, None
    for i, v in enumerate(x):
        if i % 256 == 0:
            c = biquad('lp', cutoff_at(i / SR))
        o = c[0] * v + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2
        x2, x1, y2, y1 = x1, v, y1, o
        y[i] = o
    return y


# ------------------------------------------------------------------ instruments
def kick(amp=1.0, dur=0.42, f0=165.0, f1=44.0, drop=28.0):
    n = int(dur * SR)
    body = mul(chirp(lambda t: f1 + (f0 - f1) * (np.exp(-t * drop) if np is not None else math.exp(-t * drop)), n), env(n, 6.5))
    click = mul(noise(n), env(n, 900))
    return gain(tanh(addv(body, gain(click, 0.5)), 1.6), amp)


def snare(amp=1.0, dur=0.28):
    n = int(dur * SR)
    nz = mul(filt(filt(noise(n), 'hp', 900), 'lp', 9000), env(n, 16))
    body = mul(chirp(lambda t: 190.0 + 0 * t, n), env(n, 30))
    clap = mul(filt(noise(n), 'bp', 1500, 1.2), env(n, 60))
    return gain(addv(addv(gain(nz, 0.9), gain(body, 0.7)), gain(clap, 0.8)), amp)


def hat(amp=1.0, open_=False):
    n = int((0.3 if open_ else 0.06) * SR)
    return gain(mul(filt(noise(n), 'hp', 7000), env(n, 9 if open_ else 70)), amp)


def tick(amp=1.0, f=1760.0):
    n = int(0.05 * SR)
    return gain(mul(chirp(lambda t: f + 0 * t, n), env(n, 90)), amp)


def whoosh(dur, amp=1.0):
    """Reverse whoosh: rising band-passed noise, swelling into the cut."""
    n = int(dur * SR)
    x = sweep_lp(filt(noise(n), 'hp', 300), lambda t: 400 * (6000 / 400) ** cl(t / dur))
    if np is not None:
        e = np.linspace(0, 1, n) ** 3
    else:
        e = [(i / n) ** 3 for i in range(n)]
    return gain(mul(x, e), amp)


def boom(amp=1.0, dur=1.4):
    n = int(dur * SR)
    s = mul(chirp(lambda t: 38 + 60 * (np.exp(-t * 9) if np is not None else math.exp(-t * 9)), n), env(n, 2.6))
    crash = mul(filt(noise(n), 'hp', 2500), env(n, 3.5))
    return gain(addv(gain(tanh(s, 2), 0.9), gain(crash, 0.35)), amp)


PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]  # Am F C G
BASS = [33, 29, 36, 31]
DETUNE = [-0.21, -0.13, -0.06, 0.0, 0.06, 0.13, 0.21] if np is not None else [-0.12, 0.0, 0.12]


def saw_stack(notes, n, t0):
    """Stereo detuned saws, phase-continuous in absolute time (no clicks at bar lines)."""
    pans = [(-0.85 + 1.7 * k / (len(DETUNE) - 1)) if len(DETUNE) > 1 else 0 for k in range(len(DETUNE))]
    k = 1.0 / (len(notes) * math.sqrt(len(DETUNE)))
    if np is not None:
        t = (np.arange(n) + t0) / SR
        L, R = np.zeros(n), np.zeros(n)
        for m in notes:
            for d, p in zip(DETUNE, pans):
                s = 2 * ((t * midi(m + d) + (m * 0.137 + d) % 1) % 1.0) - 1
                L += s * math.cos((p + 1) * math.pi / 4)
                R += s * math.sin((p + 1) * math.pi / 4)
        return L * k, R * k
    L, R = [0.0] * n, [0.0] * n
    for m in notes:
        for d, p in zip(DETUNE, pans):
            f, ph0 = midi(m + d) / SR, (m * 0.137 + d) % 1
            gl, gr = math.cos((p + 1) * math.pi / 4) * k, math.sin((p + 1) * math.pi / 4) * k
            for i in range(n):
                s = 2 * (((i + t0) * f + ph0) % 1.0) - 1
                L[i] += s * gl
                R[i] += s * gr
    return L, R


# ------------------------------------------------------------------ arrangement
L, R = zeros(N), zeros(N)
DL, DR = zeros(N), zeros(N)  # duck bus (sidechained by the kick)
KB = zeros(N)                # kick bus (mono, not ducked)


def put(sig, b_or_sample, g=1.0, pan=0.0, duck=True, sample=False):
    s = b_or_sample if sample else bs(b_or_sample)
    gl, gr = math.cos((pan + 1) * math.pi / 4) * math.sqrt(2), math.sin((pan + 1) * math.pi / 4) * math.sqrt(2)
    mix_into(DL if duck else L, sig, s, g * gl)
    mix_into(DR if duck else R, sig, s, g * gr)


def in_bd(b):
    return BD0 <= b < BD1


def cutoff(b):
    """Pad filter cutoff (Hz) over the arrangement — the soundtrack's 'camera'."""
    if b < INTRO:
        return 300 + 500 * (b / max(1, INTRO)) ** 2
    if BD0 <= b < BD1:
        return 1200 + 2400 * ((b - BD0) / (BD1 - BD0)) ** 3  # build out of the breakdown
    if b >= OUTRO:
        return 1600
    return 3000


def pad_gain(b):
    if b < INTRO:
        return 0.35 * b / max(1, INTRO)
    if b >= OUTRO:
        return 0.15 + 0.4 * max(0.0, 1 - (b - OUTRO) / max(1, BEATS - OUTRO))
    return 0.55


print(f'[audio] numpy={np is not None} sr={SR} bpm={BPM} beats={BEATS} dur={DUR:.3f}s intro=0-{INTRO:g} '
      f'outro={OUTRO:g} breakdown=' + (f'{BD0:g}-{BD1:g} ({bt(BD0):.2f}-{bt(BD1):.2f}s)' if BD1 > BD0 >= 0 else 'none'), file=sys.stderr)

# pad: one chord per bar
PL, PR = zeros(N), zeros(N)
for bar in range(int(math.ceil(BEATS / 4))):
    s0, s1 = bs(bar * 4), min(N, bs(bar * 4 + 4))
    if s1 <= s0:
        continue
    l, r = saw_stack(PROG[bar % 4], s1 - s0, s0)
    mix_into(PL, l, s0)
    mix_into(PR, r, s0)
PL = sweep_lp(PL, lambda t: cutoff(t / SPB))
PR = sweep_lp(PR, lambda t: cutoff(t / SPB))
step = 256
gc = [pad_gain(i / SR / SPB) for i in range(0, N, step)]
if np is not None:
    g = np.interp(np.arange(N), np.arange(0, N, step), gc)
    DL += PL * g
    DR += PR * g
else:
    for i in range(N):
        g = gc[i // step]
        DL[i] += PL[i] * g
        DR[i] += PR[i] * g

# groove: kick / clap / hats / bass
kicks = [b for b in range(int(INTRO), int(OUTRO)) if not in_bd(b)]
for b in kicks:
    mix_into(KB, kick(0.95), bs(b))
nb = int(SPB * 0.5 * SR * 0.95)
for b in range(int(INTRO), int(OUTRO)):
    if in_bd(b):
        continue
    root = BASS[(b // 4) % 4]
    f = midi(root + 12)
    if np is not None:
        t = np.arange(nb) / SR
        x = (2 * ((t * f) % 1) - 1) * 0.6 + np.sin(np.pi * f * t) * 0.8
    else:
        x = [(2 * ((i / SR * f) % 1) - 1) * 0.6 + math.sin(math.pi * f * i / SR) * 0.8 for i in range(nb)]
    put(filt(mul(x, env(nb, 5, 0.004)), 'lp', 420), b + 0.5, 0.55, 0.0)
    if b % 2 == 1:
        put(snare(0.42), b, pan=0.05, duck=False)
    put(hat(0.3, open_=(b % 4 == 3)), b + 0.5, pan=0.25)
    if b >= INTRO + 6:
        for k in (0.25, 0.75):
            put(hat(0.12), b + k, pan=-0.3)
if BD1 > BD0 >= 0:  # snare roll into the drop
    for i in range(16):
        put(snare(0.1 + 0.3 * i / 16, 0.18), BD1 - 2 + i * 0.125, duck=False)

# intro: leader ticks
for b in range(int(INTRO)):
    put(tick(0.6 if b < INTRO - 1 else 0.9, 1760 if b < INTRO - 1 else 880), b, duck=False)

# transitions
for c in CUTS:
    big = c in BIG
    wd = 0.9 if big else 0.45
    put(whoosh(wd, 0.25 if big else 0.14), bs(c) - int(wd * SR), pan=-0.2, duck=False, sample=True)
    if big:
        put(boom(0.55), c, duck=False)
    else:
        n = int(0.12 * SR)
        put(mul(filt(noise(n), 'hp', 3000), env(n, 35)), c, 0.25, duck=False)
for c in sorted(set(BIG + [FINAL])):
    if c >= 3:
        d = bt(2.5)
        put(whoosh(d, 0.2), bs(c) - int(d * SR), duck=False, sample=True)

# final hit: chord stab + kick + boom + clap, preceded by silence
fs = bs(FINAL)
l, r = saw_stack([45, 57, 64, 69, 72, 76], int(1.2 * SR), fs)
e = env(len(l), 2.2)
mix_into(L, filt(mul(l, e), 'lp', 6000), fs, 1.1)
mix_into(R, filt(mul(r, e), 'lp', 6000), fs, 1.1)
mix_into(KB, kick(1.1, 0.6, 200, 38, 20), fs)
put(boom(0.9, 1.2), FINAL, duck=False)
put(snare(0.5), FINAL, duck=False)

# sidechain: duck the pad/bass/hats under every kick
if np is not None:
    duck = np.ones(N)
    n = int(SPB * SR)
    tt = np.arange(n) / SR
    g = 1 - 0.78 * np.exp(-tt / 0.11) * np.minimum(1, tt / 0.003 + 0.6)
    for b in kicks:
        s = bs(b); e2 = min(N, s + n)
        duck[s:e2] = np.minimum(duck[s:e2], g[: e2 - s])
    L += DL * duck + KB
    R += DR * duck + KB
else:
    duck = [1.0] * N
    n = int(SPB * SR)
    g = [1 - 0.78 * math.exp(-(i / SR) / 0.11) * min(1, (i / SR) / 0.003 + 0.6) for i in range(n)]
    for b in kicks:
        s = bs(b)
        for i in range(s, min(N, s + n)):
            duck[i] = min(duck[i], g[i - s])
    for i in range(N):
        L[i] += DL[i] * duck[i] + KB[i]
        R[i] += DR[i] * duck[i] + KB[i]


# ------------------------------------------------------------------ master: loudness + soft clip
def k_weight(x):
    return filt(filt(x, 'hs', 1681.97, 0.7071, 4.0), 'hp', 38.13, 0.5)


def lufs(l, r):
    """Integrated loudness, BS.1770-style: K-weighting, 400 ms blocks, 75% overlap, abs + rel gates."""
    kl, kr = k_weight(l), k_weight(r)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if np is not None:
        cs = np.concatenate([[0.0], np.cumsum(kl * kl + kr * kr)])
        ms = [(cs[i + blk] - cs[i]) / blk for i in range(0, len(kl) - blk, hop)]
    else:
        cs, acc = [0.0], 0.0
        for a, b in zip(kl, kr):
            acc += a * a + b * b
            cs.append(acc)
        ms = [(cs[i + blk] - cs[i]) / blk for i in range(0, len(kl) - blk, hop)]
    ld = [(-0.691 + 10 * math.log10(m)) if m > 0 else -200 for m in ms]
    g1 = [m for m, x in zip(ms, ld) if x > -70]
    if not g1:
        return -70.0
    rel = -0.691 + 10 * math.log10(sum(g1) / len(g1)) - 10
    g2 = [m for m, x in zip(ms, ld) if x > rel]
    return -0.691 + 10 * math.log10(sum(g2) / len(g2))


CEIL = 10 ** (-1.0 / 20)


def master(l, r, gdb):
    g = 10 ** (gdb / 20)
    if np is not None:
        return CEIL * np.tanh(l * g / CEIL), CEIL * np.tanh(r * g / CEIL)
    return [CEIL * math.tanh(a * g / CEIL) for a in l], [CEIL * math.tanh(a * g / CEIL) for a in r]


pk = (float(max(np.abs(L).max(), np.abs(R).max())) if np is not None else max(max(abs(v) for v in L), max(abs(v) for v in R))) or 1.0
L, R = gain(L, 0.5 / pk), gain(R, 0.5 / pk)
gdb = A.lufs - lufs(L, R)
for _ in range(3):  # soft clipping eats loudness: re-measure and correct
    ol, orr = master(L, R, gdb)
    err = A.lufs - lufs(ol, orr)
    if abs(err) < 0.3:
        break
    gdb += err
L, R = ol, orr

# silence before the final hit, micro-fades, tail fade
s0 = max(0, int(round((bt(FINAL) - SIL) * SR)))
f = int(0.004 * SR)
for ch in (L, R):
    for i in range(max(0, s0 - f), s0):
        ch[i] *= (s0 - i) / f
    for i in range(s0, min(N, fs)):
        ch[i] = 0.0
    for i in range(fs, min(N, fs + f)):
        ch[i] *= (i - fs) / f
    fe = int(0.12 * SR)
    for i in range(N - fe, N):
        ch[i] *= (N - i) / fe

# ------------------------------------------------------------------ write 16-bit stereo WAV
if np is not None:
    pcm = (np.clip(np.stack([L, R]).T, -1, 1) * 32767).astype('<i2').tobytes()
else:
    a = array.array('h', [0] * (2 * N))
    for i in range(N):
        a[2 * i] = int(max(-1.0, min(1.0, L[i])) * 32767)
        a[2 * i + 1] = int(max(-1.0, min(1.0, R[i])) * 32767)
    if sys.byteorder == 'big':
        a.byteswap()
    pcm = a.tobytes()
with wave.open(A.out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm)
print(f'{A.out}: {N / SR:.3f}s @ {SR} Hz · ~{lufs(L, R):.1f} LUFS (approx) · silence {s0 / SR:.3f}-{fs / SR:.3f}s · '
      f'final hit {fs / SR:.3f}s · cuts at ' + ', '.join(f'{bt(c):.2f}s' for c in CUTS))
