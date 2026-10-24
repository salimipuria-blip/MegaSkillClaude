# Original soundtrack for the film: pad + arpeggio + sub, a whoosh into every cube dive and an impact on
# every arrival. Pure numpy, deterministic (fixed seed); timings mirror index.html (INTRO, SLIDE).
import numpy as np, wave, sys
SR, DUR, INTRO, SLIDE = 44100, 37.0, 3.2, 6.0
n = int(SR * DUR); t = np.arange(n) / SR
rng = np.random.default_rng(7)
mix = np.zeros((n, 2))
def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR); sig = sig[: max(0, n - i)]
    mix[i:i + len(sig), 0] += sig * gain * (1 - pan) ; mix[i:i + len(sig), 1] += sig * gain * (1 + pan)
def env(length, a, r):
    m = int(length * SR); e = np.ones(m); ai, ri = int(a * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, ai); e[m - ri:] *= np.linspace(1, 0, ri); return e
def tone(f, length, detune=0.0):
    x = np.arange(int(length * SR)) / SR
    return sum(np.sin(2 * np.pi * f * (1 + d) * x) for d in (-detune, 0, detune)) / 3
hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)
# Chords per section: intro + 5 slides + outro (D minor world, lifting to F/C then home).
chords = [[50, 57, 62, 65], [46, 53, 58, 62], [50, 57, 62, 65], [53, 60, 65, 69], [48, 55, 60, 64], [46, 53, 58, 65], [50, 57, 62, 69]]
starts = [0, INTRO] + [INTRO + i * SLIDE for i in range(1, 5)] + [INTRO + 5 * SLIDE]
ends = starts[1:] + [DUR]
for ch, a, b in zip(chords, starts, ends):
    L = b - a + 1.2
    for k, m in enumerate(ch):
        p = tone(hz(m), L, .004) * env(L, .9, 1.4)
        add(p, a, .055, pan=(-.4 + .27 * k))
    add(np.sin(2 * np.pi * hz(ch[0] - 12) * np.arange(int(L * SR)) / SR) * env(L, .3, 1.0), a, .16)
# Arpeggio: 8th notes at 120 BPM from the first slide to the outro.
step = .25
for a, b, ch in zip(starts[1:-1], ends[1:-1], chords[1:-1]):
    k = 0; s = a
    while s < b - .05:
        m = ch[[0, 2, 1, 3, 2, 1][k % 6]] + 12
        x = np.arange(int(.22 * SR)) / SR
        pl = (np.sin(2 * np.pi * hz(m) * x) + .3 * np.sin(4 * np.pi * hz(m) * x)) * np.exp(-x * 14)
        add(pl, s, .05, pan=.35 if k % 2 else -.35); s += step; k += 1
# Whoosh into each cube dive, impact on each arrival.
def whoosh(L):
    m = int(L * SR); w = rng.standard_normal(m)
    out = np.zeros(m); y = 0.0; x = np.linspace(0, 1, m); alpha = .02 + .5 * x ** 2
    for i in range(m): y += alpha[i] * (w[i] - y); out[i] = y
    return out * np.sin(np.pi * x) ** 2
def impact():
    x = np.arange(int(1.4 * SR)) / SR
    f = 90 * np.exp(-x * 3) + 38
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 3.2) + rng.standard_normal(len(x)) * np.exp(-x * 30) * .25
for i in range(5):
    arrive = INTRO + i * SLIDE - (.3 if i == 0 else .25)
    add(impact(), arrive + .02, .5)
    if i < 4: add(whoosh(.75), INTRO + (i + 1) * SLIDE - .75, .9)
add(whoosh(1.4), INTRO + 5 * SLIDE - 1.0, .6)     # pull-back into the outro
add(impact(), INTRO + 5 * SLIDE + .2, .55)
add(whoosh(1.2), .1, .5)                           # intro line draw
# Fade in/out, gentle limiter, 16-bit.
mix *= np.minimum(1, t / 1.0)[:, None] * np.minimum(1, (DUR - t) / 2.5)[:, None]
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix *= .85 / np.abs(mix).max()
with wave.open(sys.argv[1], 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes((mix * 32767).astype('<i2').tobytes())
