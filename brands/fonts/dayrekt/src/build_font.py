#!/usr/bin/env python3
"""Dayrekt (دایرکت) — geometric monoline Persian/Latin caption font.

Every glyph is a set of centre-line strokes (polylines with filleted corners)
expanded to a fixed stroke width, so each weight is the same skeleton drawn
with a different pen. Dots are drawn as dashes, as in the reference artwork.

Usage: python3 build_font.py OUT_DIR
"""
import math
import os
import sys

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from shapely.geometry import LineString, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

FAMILY = "Dayrekt"
VERSION = "1.000"
WEIGHTS = [("Light", 300, 40), ("Regular", 400, 56), ("Medium", 500, 74), ("Bold", 700, 96)]

UPM = 1000
STAMP = 3844540800  # 2025-10-26, seconds since 1904
BODY = 500      # top edge of the Persian body (x-height)
ASC = 600       # top edge of alef / lam / Latin caps
DESC = -228     # bottom edge of descenders
TOOTH = 330     # top edge of teeth
L1, L2 = 120, 260   # one-dot and two-dot dash lengths


# ---------------------------------------------------------------- geometry

def _norm(x, y):
    d = math.hypot(x, y)
    return (x / d, y / d) if d else (0.0, 0.0)


def fillet(pts, closed=False):
    """pts: [(x, y[, r])] -> dense point list with round corners of radius r."""
    pts = [(p[0], p[1], p[2] if len(p) > 2 else 0) for p in pts]
    n = len(pts)
    out = []
    for i in range(n):
        x, y, r = pts[i]
        interior = closed or 0 < i < n - 1
        if not interior or r <= 0:
            out.append((x, y))
            continue
        px, py, pr = pts[i - 1]
        nx, ny, nr = pts[(i + 1) % n]
        l1, l2 = math.hypot(px - x, py - y), math.hypot(nx - x, ny - y)
        v1, v2 = _norm(px - x, py - y), _norm(nx - x, ny - y)
        cos = max(-1.0, min(1.0, v1[0] * v2[0] + v1[1] * v2[1]))
        th = math.acos(cos)
        if th < 1e-3 or th > math.pi - 1e-3:
            out.append((x, y))
            continue
        # share each segment with a rounded neighbour
        f1 = 0.5 if (closed or i - 1 > 0) and pr > 0 else 1.0
        f2 = 0.5 if (closed or i + 1 < n - 1) and nr > 0 else 1.0
        t = min(r / math.tan(th / 2), l1 * f1, l2 * f2)
        re = t * math.tan(th / 2)
        t1 = (x + v1[0] * t, y + v1[1] * t)
        t2 = (x + v2[0] * t, y + v2[1] * t)
        bx, by = _norm(v1[0] + v2[0], v1[1] + v2[1])
        dc = re / math.sin(th / 2)
        cx, cy = x + bx * dc, y + by * dc
        a1 = math.atan2(t1[1] - cy, t1[0] - cx)
        a2 = math.atan2(t2[1] - cy, t2[0] - cx)
        da = a2 - a1
        while da > math.pi:
            da -= 2 * math.pi
        while da < -math.pi:
            da += 2 * math.pi
        steps = max(4, int(abs(da) / (math.pi / 2) * 28))
        for k in range(steps + 1):
            a = a1 + da * k / steps
            out.append((cx + re * math.cos(a), cy + re * math.sin(a)))
    return out


class Pen:
    """Collects strokes for one glyph at a given stroke width."""

    def __init__(self, s):
        self.s = s
        self.h = s / 2
        self.B = s / 2              # baseline centre-line
        self.T = BODY - s / 2       # body-top centre-line
        self.D = DESC + s / 2       # descender centre-line
        self.shapes = []

    def path(self, *pts, limit=2.2):
        line = LineString(fillet(pts))
        self.shapes.append(line.buffer(self.h, cap_style="flat", join_style="mitre", mitre_limit=limit))

    def loop(self, *pts):
        ring = Polygon(fillet(pts, closed=True)).exterior
        self.shapes.append(ring.buffer(self.h, cap_style="flat", join_style="mitre", mitre_limit=2.2))

    def dash(self, cx, cy, length):
        self.shapes.append(box(cx - length / 2, cy - self.h, cx + length / 2, cy + self.h))

    def dots(self, n, cx, cy, above=True):
        if n == 1:
            self.dash(cx, cy, L1)
        elif n == 2:
            self.dash(cx, cy, L2)
        elif n == 3:
            self.dash(cx, cy, L2)
            self.dash(cx, cy + (115 if above else -115), L1)

    def hamza(self, cx, by, k=1.0):
        """Small hamza sitting with its bottom on `by`."""
        w, h = 120 * k, 110 * k
        self.path((cx + w / 2, by + h), (cx - w / 2, by + h, 50 * k), (cx - w / 2, by + h * 0.45, 0),
                  (cx + w / 2, by + h * 0.45, 0), (cx - w / 2 - 30 * k, by), limit=1.5)

    def geometry(self):
        return unary_union(self.shapes) if self.shapes else None


# ---------------------------------------------------------------- glyphs
# Every builder gets a Pen and returns the advance width.
# Persian joins are made at the baseline centre-line: a joining side
# draws a bar that ends exactly on x=0 (left) or x=adv (right).

E = 90          # centre-line inset on a free (non-joining) side
RB = 200        # bowl radius
RM = 130
RS = 70
G = {}          # name -> builder


def glyph(name):
    def deco(fn):
        G[name] = fn
        return fn
    return deco


def form_family(base, builders):
    for form, fn in builders.items():
        G[base if form == "iso" else f"{base}.{form}"] = fn


# --- alef family
def alef_iso(mark=None):
    def fn(p):
        adv, x = 240, 120
        p.path((x, 0), (x, ASC))
        _alef_mark(p, mark, x)
        return adv
    return fn


def alef_fina(mark=None):
    def fn(p):
        adv, x = 250, 110
        p.path((adv, p.B), (x - p.h, p.B, 0))
        p.path((x, 0), (x, ASC))
        _alef_mark(p, mark, x)
        return adv
    return fn


def _alef_mark(p, mark, x):
    if mark == "madda":
        p.dash(x, ASC + 90, 220)
    elif mark == "hamza":
        p.hamza(x, ASC + 50)
    elif mark == "hamza_below":
        p.hamza(x, DESC - 40)


for cp, mark in [(0x0627, None), (0x0622, "madda"), (0x0623, "hamza"), (0x0625, "hamza_below")]:
    form_family(f"uni{cp:04X}", {"iso": alef_iso(mark), "fina": alef_fina(mark)})


# --- beh family (U-shaped body on the baseline, as the reference ت)
def beh_iso(n, above, dash_y=None):
    def fn(p):
        adv = 680
        p.path((E, BODY), (E, p.B, RB), (adv - E, p.B, RB), (adv - E, BODY))
        if n:
            p.dots(n, adv / 2, p.T if above else -140, above)
        return adv
    return fn


def beh_fina(n, above):
    def fn(p):
        adv = 660
        xr = adv - p.h
        p.path((E, BODY), (E, p.B, RB), (adv, p.B))
        p.path((xr, BODY), (xr, p.B))
        if n:
            p.dots(n, (E + xr) / 2, p.T if above else -140, above)
        return adv
    return fn


def tooth_init(n, above, hamza=False):
    def fn(p):
        adv = 210
        x = adv - E
        p.path((x, TOOTH), (x, p.B, RS), (0, p.B))
        if n:
            p.dots(n, x - 20, TOOTH + 150 if above else -140, above)
        if hamza:
            p.hamza(x - 10, TOOTH + 70)
        return adv
    return fn


def tooth_medi(n, above, hamza=False):
    def fn(p):
        adv = 200
        x = adv / 2
        p.path((adv, p.B), (0, p.B))
        p.path((x, TOOTH), (x, p.B))
        if n:
            p.dots(n, x, TOOTH + 150 if above else -140, above)
        if hamza:
            p.hamza(x, TOOTH + 70)
        return adv
    return fn


for cp, n, above in [(0x0628, 1, False), (0x067E, 3, False), (0x062A, 2, True), (0x062B, 3, True)]:
    form_family(f"uni{cp:04X}", {"iso": beh_iso(n, above), "fina": beh_fina(n, above),
                                 "init": tooth_init(n, above), "medi": tooth_medi(n, above)})


# --- noon / yeh (U-shaped bowl hanging below the baseline)
NOON_TOP = 330


def bowl_iso(dot=0, hook=False, hamza=False):
    def fn(p):
        xr = 470
        if hook:
            p.path((E, NOON_TOP), (E, p.D, RB), (xr, p.D, RB), (xr, NOON_TOP - p.h, 0), (xr + 140, NOON_TOP - p.h))
            adv = xr + 140 + 70
        else:
            p.path((E, NOON_TOP), (E, p.D, RB), (xr, p.D, RB), (xr, NOON_TOP))
            adv = xr + E
        if dot:
            p.dots(dot, (E + xr) / 2, NOON_TOP - p.h, True)
        if hamza:
            p.hamza((E + xr) / 2, 120)
        return adv
    return fn


def bowl_fina(dot=0, hamza=False):
    def fn(p):
        adv, xr = 560, 440
        p.path((E, NOON_TOP), (E, p.D, RB), (xr, p.D, RB), (xr, p.B, 0), (adv, p.B))
        if dot:
            p.dots(dot, (E + xr) / 2, NOON_TOP - p.h, True)
        if hamza:
            p.hamza((E + xr) / 2, 120)
        return adv
    return fn


form_family("uni0646", {"iso": bowl_iso(1), "fina": bowl_fina(1),
                        "init": tooth_init(1, True), "medi": tooth_medi(1, True)})
form_family("uni06CC", {"iso": bowl_iso(0, hook=True), "fina": bowl_fina(0),
                        "init": tooth_init(2, False), "medi": tooth_medi(2, False)})
form_family("uni0626", {"iso": bowl_iso(0, hook=True, hamza=True), "fina": bowl_fina(0, hamza=True),
                        "init": tooth_init(0, True, hamza=True), "medi": tooth_medi(0, True, hamza=True)})


# --- jeem family (C-shaped bowl with a raised head)
def jeem_iso(n, above):
    def fn(p):
        adv = 620
        xr = adv - E
        p.path((xr, BODY + 90), (xr, p.T, 0), (E, p.T, RB), (E, p.D, RB), (xr, p.D))
        _jeem_dots(p, n, above, (E + xr) / 2 + 30, (p.T + p.D) / 2)
        return adv
    return fn


def jeem_fina(n, above):
    def fn(p):
        adv = 640
        xr = adv - 130
        p.path((adv, p.B), (xr, p.B, 0), (xr, p.T, 0), (E, p.T, RB), (E, p.D, RB), (xr, p.D))
        _jeem_dots(p, n, above, (E + xr) / 2 + 20, (p.B + p.D) / 2 + 10)
        return adv
    return fn


def jeem_init(n, above):
    def fn(p):
        adv = 520
        xr, xv = adv - E, 190
        p.path((xr, BODY + 90), (xr, p.T, 0), (xv, p.T, 220), (xv, p.B, 160), (0, p.B))
        _jeem_head_dots(p, n, above, (xv + xr) / 2 + 40)
        return adv
    return fn


def jeem_medi(n, above):
    def fn(p):
        adv = 520
        xr, xv = adv - E, 190
        p.path((adv, p.B), (0, p.B))
        p.path((xr, BODY + 90), (xr, p.T, 0), (xv, p.T, 220), (xv, p.B, 160), (0, p.B))
        _jeem_head_dots(p, n, above, (xv + xr) / 2 + 40)
        return adv
    return fn


def _jeem_head_dots(p, n, above, cx):
    if n:
        p.dots(n, cx, BODY + 150 if above else -140, above)


def _jeem_dots(p, n, above, cx, cy):
    if not n:
        return
    if above:                       # khah: dash above the head
        p.dots(n, cx - 60, BODY + 150, True)
    elif n == 3:                    # tcheh: two dashes inside the bowl
        p.dash(cx, cy + 55, L2 - 80)
        p.dash(cx, cy - 55, L1)
    else:                           # jeem: one floating dash inside
        p.dash(cx, cy, L1)


for cp, n, above in [(0x062C, 1, False), (0x0686, 3, False), (0x062D, 0, False), (0x062E, 1, True)]:
    form_family(f"uni{cp:04X}", {"iso": jeem_iso(n, above), "fina": jeem_fina(n, above),
                                 "init": jeem_init(n, above), "medi": jeem_medi(n, above)})


# --- dal (half-stadium, as the reference د)
def dal_iso(n):
    def fn(p):
        adv = 560
        xr = adv - E
        r = (p.T - p.B) / 2
        p.path((E, p.T), (xr, p.T, r), (xr, p.B, r), (E, p.B))
        if n:
            p.dots(n, E + 110, BODY + 150)
        return adv
    return fn


def dal_fina(n):
    def fn(p):
        adv = 560
        xr = adv - 110
        p.path((E, p.T), (xr, p.T, RB), (xr, p.B))
        p.path((E, p.B), (adv, p.B))
        if n:
            p.dots(n, E + 110, BODY + 150)
        return adv
    return fn


for cp, n in [(0x062F, 0), (0x0630, 1)]:
    form_family(f"uni{cp:04X}", {"iso": dal_iso(n), "fina": dal_fina(n)})


# --- reh (the reference ر: stub, drop, round turn, tail)
def reh(fina, n):
    def fn(p):
        xv = 300
        if fina:
            adv = 400
            p.path((adv, p.B), (xv, p.B, 0), (xv, p.D, 170), (E - 20, p.D))
        else:
            adv = 470
            p.path((adv - E, p.B), (xv, p.B, 0), (xv, p.D, 170), (E - 20, p.D))
        if n:
            p.dots(n, xv + 10, 210, True)
        return adv
    return fn


for cp, n in [(0x0631, 0), (0x0632, 1), (0x0698, 3)]:
    form_family(f"uni{cp:04X}", {"iso": reh(False, n), "fina": reh(True, n)})


# --- seen family (three teeth, bowl when final)
SEEN_TOP = 300
GAP = 150


def seen(form, n):
    def fn(p):
        if form in ("init", "medi"):
            adv = 2 * GAP + 2 * E
            x1, x3 = E, adv - E
            if form == "init":
                p.path((x3, SEEN_TOP), (x3, p.B, RS), (0, p.B))
            else:
                p.path((adv, p.B), (0, p.B))
                p.path((x3, SEEN_TOP), (x3, p.B))
            p.path((x1 + GAP, SEEN_TOP), (x1 + GAP, p.B))
            p.path((x1, SEEN_TOP), (x1, p.B))
        else:
            xb = 460
            x3 = xb + 2 * GAP
            p.path((E, SEEN_TOP), (E, p.D, RB), (xb, p.D, RB), (xb, SEEN_TOP))
            p.path((xb + GAP, SEEN_TOP), (xb + GAP, p.B))
            if form == "iso":
                adv = x3 + E
                p.path((xb, p.B), (x3, p.B, RS), (x3, SEEN_TOP))
            else:
                adv = x3 + 100
                p.path((xb, p.B), (adv, p.B))
                p.path((x3, SEEN_TOP), (x3, p.B))
            x1 = xb
        if n:
            p.dots(n, x1 + GAP, SEEN_TOP + 140, True)
        return adv
    return fn


for cp, n in [(0x0633, 0), (0x0634, 3)]:
    form_family(f"uni{cp:04X}", {f: seen(f, n) for f in ("iso", "fina", "init", "medi")})


# --- sad / tah loops
LOOP_TOP = 330


def sad_loop(p, xl, xr, joined_right):
    t = LOOP_TOP - p.h
    br = 0 if joined_right else 140
    p.loop((xl, p.B, 0), (xr, p.B, br), (xr, t, 140), (xl, t, 0))


def sad(form, n):
    def fn(p):
        w = 300
        if form in ("iso", "fina"):
            xb = 450
            p.path((E, NOON_TOP), (E, p.D, RB), (xb, p.D, RB), (xb, p.B))
            xl = xb
        else:
            xl = E if form == "init" else 100
            if True:
                p.path((xl, p.B), (0, p.B))
        xr = xl + w
        joined = form in ("fina", "medi")
        sad_loop(p, xl, xr, joined)
        adv = xr + (100 if joined else E)
        if joined:
            p.path((adv, p.B), (xr, p.B))
        if n:
            p.dots(n, (xl + xr) / 2, LOOP_TOP + 140, True)
        return adv
    return fn


for cp, n in [(0x0635, 0), (0x0636, 1)]:
    form_family(f"uni{cp:04X}", {f: sad(f, n) for f in ("iso", "fina", "init", "medi")})


def tah(form, n):
    def fn(p):
        joined_l = form in ("init", "medi")
        joined_r = form in ("fina", "medi")
        xl = 110 if joined_l else E
        xr = xl + 300
        sad_loop(p, xl, xr, joined_r)
        p.path((xl, p.B), (xl, ASC))
        if joined_l:
            p.path((xl, p.B), (0, p.B))
        adv = xr + (100 if joined_r else E)
        if joined_r:
            p.path((adv, p.B), (xr, p.B))
        if n:
            p.dots(n, xl + 170, LOOP_TOP + 140, True)
        return adv
    return fn


for cp, n in [(0x0637, 0), (0x0638, 1)]:
    form_family(f"uni{cp:04X}", {f: tah(f, n) for f in ("iso", "fina", "init", "medi")})


# --- ain family
def ain(form, n):
    def fn(p):
        if form == "iso":
            adv = 560
            xr = adv - E
            p.path((xr, p.T), (E, p.T, RM), (E, p.D, RB), (xr, p.D))
            p.path((E, p.B), (xr - 60, p.B))
            dx = (E + xr) / 2
        elif form == "init":
            adv = 460
            xr, xl = adv - E, 110
            p.path((xr, p.T), (xl, p.T, RM), (xl, p.B))
            p.path((0, p.B), (xr, p.B))
            dx = (xl + xr) / 2
        elif form == "medi":
            adv = 400
            p.path((adv, p.B), (0, p.B))
            p.loop((60, p.T), (adv - 60, p.T), (adv / 2 + 70, p.B), (adv / 2 - 70, p.B))
            dx = adv / 2
        else:
            adv = 540
            x1, x2, m1, m2 = 180, adv - 70, 260, 400
            p.path((adv, p.B), (m2, p.B))
            p.loop((x1, p.T), (x2, p.T), (m2, p.B), (m1, p.B))
            p.path((m1, p.B), (E, p.B, RM), (E, p.D, RB), (x2, p.D))
            dx = (x1 + x2) / 2
        if n:
            p.dots(n, dx, BODY + 150, True)
        return adv
    return fn


for cp, n in [(0x0639, 0), (0x063A, 1)]:
    form_family(f"uni{cp:04X}", {f: ain(f, n) for f in ("iso", "fina", "init", "medi")})


# --- feh / qaf (small loop on the baseline)
FEH_TOP = 300


def feh_loop(p, xl, xr):
    t = FEH_TOP - p.h
    p.loop((xl, p.B, 0), (xr, p.B, 0), (xr, t, 110), (xl, t, 110))


def feh(form, n, qaf):
    def fn(p):
        w = 230
        joined_r = form in ("fina", "medi")
        if form in ("init", "medi"):
            xl = E if form == "init" else 90
            p.path((xl, p.B), (0, p.B))
        elif qaf:
            xl = 450
            p.path((E, NOON_TOP - 50), (E, p.D, RB), (xl, p.D, RB), (xl, p.B))
        else:
            xl = 330
            p.path((xl, p.B), (E, p.B, RS), (E, p.B + 170))
        xr = xl + w
        feh_loop(p, xl, xr)
        adv = xr + (100 if joined_r else E)
        if joined_r:
            p.path((adv, p.B), (xr, p.B))
        p.dots(n, (xl + xr) / 2, FEH_TOP + 130, True)
        return adv
    return fn


form_family("uni0641", {f: feh(f, 1, False) for f in ("iso", "fina", "init", "medi")})
form_family("uni0642", {f: feh(f, 2, True) for f in ("iso", "fina", "init", "medi")})


# --- keheh / gaf (the reference ک: box corner + rising diagonal)
def kaf(form, gaf):
    def fn(p):
        joined_r = form in ("fina", "medi")
        free_l = form in ("iso", "fina")
        adv = 700 if free_l else 620
        xr = adv - (110 if joined_r else E)
        xk = 230 if free_l else 150
        dx, dy = (250, 215) if gaf else (290, 250)
        if joined_r:
            p.path((adv, p.B), (E, p.B, RS), (E, p.B + 170)) if free_l else p.path((adv, p.B), (0, p.B))
            p.path((xr, p.B), (xr, p.T, 0), (xk, p.T))
        else:
            if free_l:
                p.path((E, p.B + 170), (E, p.B, RS), (xr, p.B, RB), (xr, p.T, 0), (xk, p.T))
            else:
                p.path((0, p.B), (xr, p.B, RB), (xr, p.T, 0), (xk, p.T))
        p.path((xk - p.h * 0.6, p.T - p.h * 0.5), (xk + dx, p.T + dy))
        if gaf:
            p.path((xk + 70, p.T + 135), (xk + 70 + dx, p.T + 135 + dy))
        return adv
    return fn


for cp, gaf in [(0x06A9, False), (0x06AF, True)]:
    form_family(f"uni{cp:04X}", {f: kaf(f, gaf) for f in ("iso", "fina", "init", "medi")})


# --- lam
@glyph("uni0644")
def lam_iso(p):
    xr = 430
    p.path((xr, ASC), (xr, p.D, RB), (E, p.D, RB), (E, 280))
    return xr + E


@glyph("uni0644.fina")
def lam_fina(p):
    adv, xr = 540, 420
    p.path((adv, p.B), (xr, p.B))
    p.path((xr, ASC), (xr, p.D, RB), (E, p.D, RB), (E, 280))
    return adv


@glyph("uni0644.init")
def lam_init(p):
    adv, x = 250, 160
    p.path((x, ASC), (x, p.B, RS), (0, p.B))
    return adv


@glyph("uni0644.medi")
def lam_medi(p):
    adv, x = 220, 110
    p.path((adv, p.B), (0, p.B))
    p.path((x, ASC), (x, p.B))
    return adv


@glyph("lam_alef")
def lam_alef(p):
    xr, xm = 440, 250
    p.path((xr, ASC), (xr, p.B, RM), (xm, p.B, 0), (E, ASC), limit=3)
    return xr + E


@glyph("lam_alef.fina")
def lam_alef_fina(p):
    adv, xr, xm = 560, 420, 250
    p.path((adv, p.B), (xm, p.B, 0), (E, ASC), limit=3)
    p.path((xr, ASC), (xr, p.B))
    return adv


# --- meem
def meem_loop(p, xl, xr, bl, br):
    t = 300 - p.h
    p.loop((xl, p.B, bl), (xr, p.B, br), (xr, t, 110), (xl, t, 110))


@glyph("uni0645")
def meem_iso(p):
    xl, xr = 150, 400
    meem_loop(p, xl, xr, 0, 110)
    p.path((xl, p.B), (xl, DESC))
    return xr + E


@glyph("uni0645.init")
def meem_init(p):
    xl, xr = 90, 340
    meem_loop(p, xl, xr, 0, 110)
    p.path((xl, p.B), (0, p.B))
    return xr + E


@glyph("uni0645.medi")
def meem_medi(p):
    adv, xl, xr = 420, 90, 330
    p.path((adv, p.B), (0, p.B))
    p.loop((xl, p.B, 0), (xr, p.B, 0), (xr, -240, 110), (xl, -240, 110))
    return adv


@glyph("uni0645.fina")
def meem_fina(p):
    xl, xr = 150, 400
    adv = xr + 100
    meem_loop(p, xl, xr, 0, 0)
    p.path((xl, p.B), (xl, DESC))
    p.path((adv, p.B), (xr, p.B))
    return adv


# --- heh
@glyph("uni0647")
def heh_iso(p):
    adv = 520
    p.loop((E, p.B, 170), (adv - E, p.B, 170), (adv - E, p.T, 170), (E, p.T, 170))
    return adv


@glyph("uni0647.init")
def heh_init(p):
    xl, xr = 90, 350
    p.loop((xl, p.B, 0), (xr, p.B, 110), (xr, p.T, 110), (xl, p.T, 110))
    p.path((xl, 260), (xr, 260))
    p.path((xl, p.B), (0, p.B))
    return xr + E


@glyph("uni0647.medi")
def heh_medi(p):
    adv, xl, xr = 400, 100, 300
    p.path((adv, p.B), (0, p.B))
    p.loop((xl, -180, 90), (xr, -180, 90), (xr, 310, 90), (xl, 310, 90))
    return adv


def heh_fina_fn(n):
    def fn(p):
        xl, xr = 90, 340
        adv = xr + 100
        t = 340 - p.h
        p.loop((xl, p.B, 120), (xr, p.B, 0), (xr, t, 120), (xl, t, 120))
        p.path((adv, p.B), (xr, p.B))
        if n:
            p.dots(n, (xl + xr) / 2, 340 + 140)
        return adv
    return fn


G["uni0647.fina"] = heh_fina_fn(0)


@glyph("uni0629")
def teh_marbuta(p):
    adv = heh_iso(p)
    p.dots(2, adv / 2, BODY + 150)
    return adv


G["uni0629.fina"] = heh_fina_fn(2)


# --- waw
def waw(fina, hamza):
    def fn(p):
        xl, xr = 150, 390
        t = 300 - p.h
        p.loop((xl, p.B, 110), (xr, p.B, 0), (xr, t, 110), (xl, t, 110))
        p.path((xr, p.B), (xr, p.D, 170), (E - 20, p.D))
        adv = xr + (100 if fina else E)
        if fina:
            p.path((adv, p.B), (xr, p.B))
        if hamza:
            p.hamza((xl + xr) / 2, 380)
        return adv
    return fn


form_family("uni0648", {"iso": waw(False, False), "fina": waw(True, False)})
form_family("uni0624", {"iso": waw(False, True), "fina": waw(True, True)})


@glyph("uni0621")
def hamza_glyph(p):
    p.hamza(170, p.B - p.h, k=1.6)
    return 360


@glyph("uni0640")
def tatweel(p):
    p.path((0, p.B), (240, p.B))
    return 240


# --- digits (Persian), height = ASC - 40
DH = 560


@glyph("uni06F0")
def d0(p):
    p.loop((170, 200, 30), (290, 200, 30), (290, 320, 30), (170, 320, 30))
    return 460


@glyph("uni06F1")
def d1(p):
    p.path((180, 0), (180, DH))
    return 360


@glyph("uni06F2")
def d2(p):
    y = 380
    p.path((110, 0), (110, y, 0), (340, y, 0), (340, DH))
    return 450


@glyph("uni06F3")
def d3(p):
    y = 380
    p.path((100, 0), (100, y, 0), (370, y, 0), (370, DH))
    p.path((235, y), (235, DH))
    return 470


@glyph("uni06F4")
def d4(p):
    t = DH - p.h
    p.path((110, 0), (110, t, 0), (360, t))
    p.path((360, 430), (170, 360, 0), (360, 290), limit=3)
    return 460


@glyph("uni06F5")
def d5(p):
    p.loop((230, DH - p.h, 0), (370, 330, 40), (370, p.B, 120), (90, p.B, 120), (90, 330, 40))
    return 460


@glyph("uni06F6")
def d6(p):
    t = DH - p.h
    p.path((110, t - 130), (110, t, 0), (350, t, 0), (130, 0), limit=3)
    return 460


@glyph("uni06F7")
def d7(p):
    p.path((90, DH), (230, p.B), (370, DH), limit=3)
    return 460


@glyph("uni06F8")
def d8(p):
    p.path((90, 0), (230, DH - p.B), (370, 0), limit=3)
    return 460


@glyph("uni06F9")
def d9(p):
    t = DH - p.h
    p.loop((100, 290, 90), (360, 290, 0), (360, t, 90), (100, t, 90))
    p.path((360, 290), (360, 0))
    return 460


# --- Latin (unicase, as the reference)
CT = None   # filled per pen: ASC - h


def latin(name, adv):
    def deco(fn):
        def wrapped(p):
            fn(p, ASC - p.h, p.B, (ASC) / 2)
            return adv
        G[name] = wrapped
        return fn
    return deco


RC = 250


@latin("A", 600)
def L_A(p, t, b, m):
    p.path((E, 0), (E, t, RC), (510, t, RC), (510, 0))
    p.path((E, m), (510, m))


@latin("B", 580)
def L_B(p, t, b, m):
    p.path((E, b), (E, t, 0), (440, t, 130), (440, m, 130), (E, m))
    p.path((E, m), (490, m, 130), (490, b, 130), (E, b))


@latin("C", 560)
def L_C(p, t, b, m):
    p.path((470, t), (E, t, RC), (E, b, RC), (470, b))


@latin("D", 620)
def L_D(p, t, b, m):
    r = (t - b) / 2
    p.loop((E, b, 0), (530, b, r), (530, t, r), (E, t, 0))


@latin("E", 560)
def L_E(p, t, b, m):
    p.path((470, t), (E, t, RC), (E, b, RC), (470, b))
    p.dash((260 + 470) / 2, m, 470 - 260)


@latin("F", 520)
def L_F(p, t, b, m):
    p.path((E, 0), (E, t, 0), (450, t))
    p.dash((230 + 430) / 2, m, 430 - 230)


@latin("G", 600)
def L_G(p, t, b, m):
    p.path((500, t), (E, t, RC), (E, b, RC), (510, b, 0), (510, m, 0), (320, m))


@latin("H", 600)
def L_H(p, t, b, m):
    p.path((E, 0), (E, ASC))
    p.path((510, 0), (510, ASC))
    p.path((E, m), (510, m))


@latin("I", 180)
def L_I(p, t, b, m):
    p.path((E, 0), (E, ASC))


@latin("J", 520)
def L_J(p, t, b, m):
    p.path((430, ASC), (430, b, RC), (E, b, 0), (E, 200))


@latin("K", 560)
def L_K(p, t, b, m):
    p.path((E, 0), (E, ASC))
    p.path((480, ASC), (E + p.h, m, 0), (480, 0), limit=3)


@latin("L", 480)
def L_L(p, t, b, m):
    p.path((E, ASC), (E, b, 0), (420, b))


@latin("M", 700)
def L_M(p, t, b, m):
    p.path((E, 0), (E, t, 0), (350, 160, 0), (610, t, 0), (610, 0), limit=3)


@latin("N", 600)
def L_N(p, t, b, m):
    p.path((E, 0), (E, t, 0), (510, b, 0), (510, ASC), limit=3)


@latin("O", 640)
def L_O(p, t, b, m):
    p.loop((E, b, RC), (550, b, RC), (550, t, RC), (E, t, RC))


@latin("P", 560)
def L_P(p, t, b, m):
    p.path((E, 0), (E, t, 0), (470, t, 140), (470, m, 140), (E, m))


@latin("Q", 660)
def L_Q(p, t, b, m):
    p.loop((E, b, RC), (550, b, RC), (550, t, RC), (E, t, RC))
    p.path((420, 120), (600, -40))


@latin("R", 330)
def L_R(p, t, b, m):
    p.path((E, 0), (E, t, 110), (290, t))


@latin("S", 560)
def L_S(p, t, b, m):
    p.path((470, t), (E, t, 135), (E, m, 135), (470, m, 135), (470, b, 135), (E, b))


@latin("T", 560)
def L_T(p, t, b, m):
    p.path((40, t), (520, t))
    p.path((280, 0), (280, t))


@latin("U", 600)
def L_U(p, t, b, m):
    p.path((E, ASC), (E, b, RC), (510, b, RC), (510, ASC))


@latin("V", 600)
def L_V(p, t, b, m):
    p.path((E, ASC), (300, b, 0), (510, ASC), limit=3)


@latin("W", 780)
def L_W(p, t, b, m):
    p.path((E, ASC), (E, b, 200), (690, b, 200), (690, ASC))
    p.path((390, b), (390, 400))


@latin("X", 580)
def L_X(p, t, b, m):
    p.path((E, ASC), (490, 0))
    p.path((490, ASC), (E, 0))


@latin("Y", 580)
def L_Y(p, t, b, m):
    p.path((E, ASC), (290, m, 0), (490, ASC), limit=3)
    p.path((290, m), (290, 0))


@latin("Z", 560)
def L_Z(p, t, b, m):
    p.path((E, t), (470, t, 0), (E, b, 0), (470, b), limit=3)


@latin("zero", 520)
def L_0(p, t, b, m):
    p.loop((E, b, 200), (430, b, 200), (430, t, 200), (E, t, 200))


@latin("one", 340)
def L_1(p, t, b, m):
    p.path((80, t - 110), (220, ASC - p.h * 1.2))
    p.path((220, 0), (220, ASC))


@latin("two", 520)
def L_2(p, t, b, m):
    p.path((E, t), (430, t, 130), (430, m, 130), (E, m, 0), (E, b, 0), (440, b))


@latin("three", 520)
def L_3(p, t, b, m):
    p.path((E, t), (430, t, 130), (430, b, 130), (E, b))
    p.path((200, m), (430, m))


@latin("four", 520)
def L_4(p, t, b, m):
    p.path((E, ASC), (E, 220, 0), (450, 220))
    p.path((370, 380), (370, 0))


@latin("five", 520)
def L_5(p, t, b, m):
    p.path((430, t), (E, t, 0), (E, m, 0), (430, m, 130), (430, b, 130), (E, b))


@latin("six", 520)
def L_6(p, t, b, m):
    p.path((430, t), (E, t, 130), (E, b, 130), (430, b, 130), (430, m, 130), (E, m))


@latin("seven", 500)
def L_7(p, t, b, m):
    p.path((E, t), (420, t, 0), (180, 0), limit=3)


@latin("eight", 520)
def L_8(p, t, b, m):
    p.loop((110, m, 100), (410, m, 100), (410, t, 100), (110, t, 100))
    p.loop((E, b, 120), (430, b, 120), (430, m, 120), (E, m, 120))


@latin("nine", 520)
def L_9(p, t, b, m):
    p.path((430, m), (E, m, 130), (E, t, 130), (430, t, 130), (430, b, 130), (E, b))


# --- punctuation
def sq(p, cx, y0, size=None):
    s = size or p.s * 1.35
    p.shapes.append(box(cx - s / 2, y0, cx + s / 2, y0 + s))


@glyph("space")
def space(p):
    return 280


@glyph("uni00A0")
def nbsp(p):
    return 280


for zw in ("uni200C", "uni200D", "uni200E", "uni200F", "uni200B", "uni2060", "uniFEFF"):
    G[zw] = lambda p: 0


@glyph("period")
def period(p):
    sq(p, 110, 0)
    return 220


@glyph("comma")
def comma(p):
    p.path((140, 90), (80, -110))
    return 220


@glyph("uni060C")
def ar_comma(p):
    p.path((90, 0), (150, 190))
    return 240


@glyph("colon")
def colon(p):
    sq(p, 110, 0)
    sq(p, 110, 300)
    return 220


@glyph("semicolon")
def semicolon(p):
    comma(p)
    sq(p, 110, 300)
    return 220


@glyph("uni061B")
def ar_semicolon(p):
    p.path((90, 0), (150, 190))
    sq(p, 120, 320)
    return 240


@glyph("exclam")
def exclam(p):
    p.path((110, 180), (110, ASC))
    sq(p, 110, 0)
    return 220


@glyph("question")
def question(p):
    t = ASC - p.h
    p.path((E, t), (380, t, 120), (380, 300, 120), (240, 300, 0), (240, 170))
    sq(p, 240, 0)
    return 470


@glyph("uni061F")
def ar_question(p):
    t = ASC - p.h
    p.path((380, t), (E, t, 120), (E, 300, 120), (230, 300, 0), (230, 170))
    sq(p, 230, 0)
    return 470


@glyph("hyphen")
def hyphen(p):
    p.path((70, 250), (310, 250))
    return 380


@glyph("endash")
def endash(p):
    p.path((40, 250), (460, 250))
    return 500


@glyph("emdash")
def emdash(p):
    p.path((40, 250), (960, 250))
    return 1000


@glyph("underscore")
def underscore(p):
    p.path((0, -120), (500, -120))
    return 500


def paren(left):
    def fn(p):
        t, b, x0, x1 = ASC + 40, -140, 220, 80
        if not left:
            x0, x1 = 80, 220
        p.path((x0, t - p.h), (x1, t - p.h, 120), (x1, b + p.h, 120), (x0, b + p.h))
        return 300
    return fn


G["parenleft"] = paren(True)
G["parenright"] = paren(False)


def bracket(left):
    def fn(p):
        t, b = ASC + 40, -140
        x0, x1 = (220, 90) if left else (80, 210)
        p.path((x0, t - p.h), (x1, t - p.h, 0), (x1, b + p.h, 0), (x0, b + p.h))
        return 300
    return fn


G["bracketleft"] = bracket(True)
G["bracketright"] = bracket(False)


@glyph("slash")
def slash(p):
    p.path((60, -100), (340, ASC + 20))
    return 400


@glyph("backslash")
def backslash(p):
    p.path((340, -100), (60, ASC + 20))
    return 400


@glyph("plus")
def plus(p):
    p.path((70, 260), (430, 260))
    p.path((250, 80), (250, 440))
    return 500


@glyph("equal")
def equal(p):
    p.path((70, 180), (430, 180))
    p.path((70, 340), (430, 340))
    return 500


@glyph("asterisk")
def asterisk(p):
    p.path((200, 330), (200, 590))
    p.path((90, 400), (310, 520))
    p.path((90, 520), (310, 400))
    return 400


@glyph("percent")
def percent(p):
    p.loop((70, 390, 40), (210, 390, 40), (210, 560, 40), (70, 560, 40))
    p.loop((390, 40, 40), (530, 40, 40), (530, 210, 40), (390, 210, 40))
    p.path((90, 0), (510, ASC))
    return 600


@glyph("uni066A")
def ar_percent(p):
    sq(p, 110, 430)
    sq(p, 390, 40)
    p.path((90, 0), (410, ASC))
    return 500


@glyph("uni066B")
def ar_decimal(p):
    p.path((140, 90), (80, -110))
    return 220


@glyph("uni066C")
def ar_thousands(p):
    p.path((140, 90), (80, -110))
    return 220


@glyph("quotesingle")
def quotesingle(p):
    p.path((100, 400), (100, ASC))
    return 200


@glyph("quotedbl")
def quotedbl(p):
    p.path((90, 400), (90, ASC))
    p.path((210, 400), (210, ASC))
    return 300


@glyph("numbersign")
def numbersign(p):
    for y in (180, 380):
        p.path((50, y), (550, y))
    for x in (200, 400):
        p.path((x - 40, 0), (x + 40, 560))
    return 600


@glyph("at")
def at(p):
    p.loop((E, -60, 200), (640, -60, 200), (640, ASC, 200), (E, ASC, 200))
    p.path((470, 380), (470, 140, 0), (230, 140, 90), (230, 380, 90), (470, 380))
    return 730


def guillemet(left):
    def fn(p):
        for dx in (0, 170):
            if left:
                p.path((230 + dx, 460), (90 + dx, 270, 0), (230 + dx, 80), limit=3)
            else:
                p.path((90 + dx, 460), (230 + dx, 270, 0), (90 + dx, 80), limit=3)
        return 500
    return fn


G["guillemotleft"] = guillemet(True)
G["guillemotright"] = guillemet(False)


# --- harakat (positioned with GPOS mark attachment)
def mark(name, above):
    def deco(fn):
        G[name] = lambda p: (fn(p), 0)[1]
        MARKS[name] = above
        return fn
    return deco


MARKS = {}


@mark("uni064E", True)        # fatha
def fatha(p):
    p.path((-80, 20), (80, 100))


@mark("uni0650", False)       # kasra
def kasra(p):
    p.path((-80, -120), (80, -40))


@mark("uni064F", True)        # damma
def damma(p):
    p.loop((-20, 60, 0), (60, 60, 30), (60, 130, 30), (-20, 130, 30))
    p.path((-20, 60), (-20, 20, 0), (-90, 0))


@mark("uni064B", True)        # fathatan
def fathatan(p):
    p.path((-80, 20), (80, 100))
    p.path((-80, 120), (80, 200))


@mark("uni064D", False)       # kasratan
def kasratan(p):
    p.path((-80, -120), (80, -40))
    p.path((-80, -220), (80, -140))


@mark("uni064C", True)        # dammatan
def dammatan(p):
    damma(p)
    p.path((90, 60), (90, 140))


@mark("uni0651", True)        # shadda
def shadda(p):
    p.path((-110, 140), (-110, 20, 0), (110, 20, 0), (110, 140))
    p.path((0, 20), (0, 110))


@mark("uni0652", True)        # sukun
def sukun(p):
    p.loop((-55, 20, 30), (55, 20, 30), (55, 130, 30), (-55, 130, 30))


@mark("uni0654", True)        # hamza above
def hamza_above(p):
    p.hamza(0, 10)


# ---------------------------------------------------------------- tables

DUAL = ["0628", "067E", "062A", "062B", "062C", "0686", "062D", "062E", "0633", "0634",
        "0635", "0636", "0637", "0638", "0639", "063A", "0641", "0642", "06A9", "06AF",
        "0644", "0645", "0646", "0647", "06CC", "0626"]
RIGHT = ["0627", "0622", "0623", "0625", "062F", "0630", "0631", "0632", "0698", "0648",
         "0624", "0629"]

LATIN = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
CMAP = {
    0x20: "space", 0xA0: "uni00A0", 0x2E: "period", 0x2C: "comma", 0x3A: "colon",
    0x3B: "semicolon", 0x21: "exclam", 0x3F: "question", 0x2D: "hyphen", 0x2013: "endash",
    0x2014: "emdash", 0x5F: "underscore", 0x28: "parenleft", 0x29: "parenright",
    0x5B: "bracketleft", 0x5D: "bracketright", 0x2F: "slash", 0x5C: "backslash", 0x2B: "plus",
    0x3D: "equal", 0x2A: "asterisk", 0x25: "percent", 0x27: "quotesingle", 0x22: "quotedbl",
    0x23: "numbersign", 0x40: "at", 0xAB: "guillemotleft",
    0xBB: "guillemotright", 0x2019: "quotesingle", 0x201C: "quotedbl", 0x201D: "quotedbl",
    0x060C: "uni060C", 0x061B: "uni061B", 0x061F: "uni061F", 0x066A: "uni066A",
    0x066B: "uni066B", 0x066C: "uni066C", 0x0640: "uni0640", 0x0621: "uni0621",
    0x200C: "uni200C", 0x200D: "uni200D", 0x200E: "uni200E", 0x200F: "uni200F",
    0x200B: "uni200B", 0x2060: "uni2060", 0xFEFF: "uniFEFF",
    # Arabic code points that Persian keyboards also produce
    0x0643: "uni06A9", 0x064A: "uni06CC", 0x0649: "uni06CC",
}
for i, ch in enumerate(LATIN):
    CMAP[ord(ch)] = ch
    CMAP[ord(ch.lower())] = ch
for i, d in enumerate(DIGITS):
    CMAP[0x30 + i] = d
    CMAP[0x06F0 + i] = f"uni{0x06F0 + i:04X}"
    CMAP[0x0660 + i] = f"uni{0x06F0 + i:04X}"
for cp in DUAL + RIGHT:
    CMAP[int(cp, 16)] = f"uni{cp}"
for m in MARKS:
    CMAP[int(m[3:], 16)] = m

# Presentation forms for apps that do not shape Arabic script themselves.
PRES4 = {  # code point: (iso, fina, init, medi)
    "0628": 0xFE8F, "062A": 0xFE95, "062B": 0xFE99, "062C": 0xFE9D, "062D": 0xFEA1,
    "062E": 0xFEA5, "0633": 0xFEB1, "0634": 0xFEB5, "0635": 0xFEB9, "0636": 0xFEBD,
    "0637": 0xFEC1, "0638": 0xFEC5, "0639": 0xFEC9, "063A": 0xFECD, "0641": 0xFED1,
    "0642": 0xFED5, "06A9": 0xFED9, "0644": 0xFEDD, "0645": 0xFEE1, "0646": 0xFEE5,
    "0647": 0xFEE9, "06CC": 0xFEF1, "0626": 0xFE89,
}
PRES4_A = {"067E": 0xFB56, "0686": 0xFB7A, "06A9": 0xFB8E, "06AF": 0xFB92, "06CC": 0xFBFC}
PRES2 = {"0622": 0xFE81, "0623": 0xFE83, "0624": 0xFE85, "0625": 0xFE87, "0627": 0xFE8D,
         "0629": 0xFE93, "062F": 0xFEA9, "0630": 0xFEAB, "0631": 0xFEAD, "0632": 0xFEAF,
         "0648": 0xFEED, "0698": 0xFB8A}
for cp, start in PRES4.items():
    for k, form in enumerate(("", ".fina", ".init", ".medi")):
        CMAP[start + k] = f"uni{cp}{form}"
for cp, start in PRES4_A.items():   # Forms-A order: iso, fina, init, medi
    for k, form in enumerate(("", ".fina", ".init", ".medi")):
        CMAP[start + k] = f"uni{cp}{form}"
for cp, start in PRES2.items():
    CMAP[start] = f"uni{cp}"
    CMAP[start + 1] = f"uni{cp}.fina"
CMAP[0xFE80] = "uni0621"
CMAP[0xFEFB] = "lam_alef"
CMAP[0xFEFC] = "lam_alef.fina"
CMAP[0xFEEF] = "uni06CC"
CMAP[0xFEF0] = "uni06CC.fina"


def features():
    fea = ["languagesystem DFLT dflt;", "languagesystem arab dflt;", "languagesystem latn dflt;", ""]
    for form, letters in (("init", DUAL), ("medi", DUAL), ("fina", DUAL + RIGHT)):
        src = " ".join(f"uni{c}" for c in letters)
        dst = " ".join(f"uni{c}.{form}" for c in letters)
        fea.append(f"feature {form} {{ lookupflag IgnoreMarks; sub [{src}] by [{dst}]; }} {form};")
    fea.append("feature rlig { lookupflag IgnoreMarks;"
               " sub uni0644.init uni0627.fina by lam_alef;"
               " sub uni0644.medi uni0627.fina by lam_alef.fina; } rlig;")
    return "\n".join(fea)


def mark_features(advances, bounds):
    fea = []
    for m, above in MARKS.items():
        fea.append(f"markClass {m} <anchor 0 0> @{'TOP' if above else 'BOTTOM'};")
    bases = [g for g in advances if g not in MARKS and advances[g] > 0]
    lines = []
    for g in bases:
        xmin, ymin, xmax, ymax = bounds.get(g, (0, 0, advances[g], BODY))
        cx = round((xmin + xmax) / 2)
        top = round(max(BODY, ymax) + 60)
        bot = round(min(0, ymin) - 60)
        lines.append(f"pos base {g} <anchor {cx} {top}> mark @TOP <anchor {cx} {bot}> mark @BOTTOM;")
    fea.append("feature mark {\n" + "\n".join(lines) + "\n} mark;")
    marks = " ".join(MARKS)
    fea.append(f"table GDEF {{ GlyphClassDef [{' '.join(bases)}], , [{marks}], ; }} GDEF;")
    return "\n".join(fea)


# ---------------------------------------------------------------- build

def draw(geom, pen):
    if geom is None or geom.is_empty:
        return
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    for poly in polys:
        poly = orient(poly.simplify(0.35, preserve_topology=True), sign=-1.0)
        for ring in [poly.exterior, *poly.interiors]:
            pts = []
            for x, y in list(ring.coords)[:-1]:
                q = (round(x), round(y))
                if not pts or q != pts[-1]:
                    pts.append(q)
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts.pop()
            if len(pts) < 3:
                continue
            pen.moveTo(pts[0])
            for q in pts[1:]:
                pen.lineTo(q)
            pen.closePath()


def build(out_dir, style, weight, stroke):
    order = [".notdef"] + list(G.keys())
    glyphs, metrics, advances, bounds = {}, {}, {}, {}
    for name in order:
        pen = TTGlyphPen(None)
        if name == ".notdef":
            p = Pen(stroke)
            p.loop((60, p.h, 0), (440, p.h, 0), (440, ASC - p.h, 0), (60, ASC - p.h, 0))
            adv = 500
        else:
            p = Pen(stroke)
            adv = G[name](p)
        geom = p.geometry()
        draw(geom, pen)
        g = pen.glyph()
        glyphs[name] = g
        advances[name] = adv
        if geom is not None and not geom.is_empty:
            bounds[name] = geom.bounds
        lsb = round(geom.bounds[0]) if geom is not None and not geom.is_empty else 0
        metrics[name] = (adv, lsb)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(CMAP)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-330)
    ps = f"{FAMILY}-{style}"
    is_ribbi = style in ("Regular", "Bold")
    fb.setupNameTable({
        "familyName": FAMILY if is_ribbi else f"{FAMILY} {style}",
        "styleName": style if is_ribbi else "Regular",
        "typographicFamily": FAMILY,
        "typographicSubfamily": style,
        "uniqueFontIdentifier": f"{ps};{VERSION}",
        "fullName": f"{FAMILY} {style}",
        "psName": ps,
        "version": f"Version {VERSION}",
        "copyright": "Copyright 2026 Pouria Salimi. Dayrekt caption typeface.",
        "designer": "Pouria Salimi with Claude",
        "description": "Geometric monoline Persian caption typeface with dash-dots.",
        "licenseDescription": "Free for personal and commercial use by the owner and their clients.",
    })
    fb.setupOS2(
        version=4, usWeightClass=weight, sTypoAscender=880, sTypoDescender=-320, sTypoLineGap=0,
        usWinAscent=900, usWinDescent=330, sxHeight=BODY, sCapHeight=ASC,
        fsSelection=(0x20 if style == "Bold" else 0x40) | 0x80,
        achVendID="DAYR", ulUnicodeRange1=(1 << 0) | (1 << 13), ulCodePageRange1=(1 << 0) | (1 << 6),
    )
    fb.setupPost()
    fb.setupHead(unitsPerEm=UPM, created=STAMP, modified=STAMP, macStyle=1 if style == "Bold" else 0)
    font = fb.font
    addOpenTypeFeaturesFromString(font, features() + "\n" + mark_features(advances, bounds))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{ps}.ttf")
    font.save(path)
    font.flavor = "woff2"
    font.save(os.path.join(out_dir, f"{ps}.woff2"))
    return path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "fonts"
    for style, weight, stroke in WEIGHTS:
        print(build(out, style, weight, stroke))
