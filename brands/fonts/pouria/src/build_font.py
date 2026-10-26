#!/usr/bin/env python3
"""Pouria (پوریا) — heavy rounded Persian display/caption font.

Glyphs are centre-line skeletons (lines, filleted corners and cubic curves)
stroked with a round pen, so every weight is the same skeleton drawn with a
thicker or thinner pen. Dots are round.

Usage: python3 build_font.py OUT_DIR
"""
import math
import os
import sys

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from shapely import affinity
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

FAMILY = "Pouria"
VERSION = "1.000"
WEIGHTS = [("Bold", 700, 118), ("Black", 900, 150)]
UPM = 820
STAMP = 3844540800  # 2025-10-26, seconds since 1904
SLANT = 0.0         # optional italic lean (x += y * SLANT)
NIB_X, NIB_Y, NIB_ANGLE = 0.30, 0.78, -22   # nib half-axes as a share of the weight

B = 60              # baseline centre-line
TT = 255            # tooth top centre-line
BODY = 330          # dal / heh / jeem-head height centre-line
A = 690             # alef / lam top centre-line
D = -250            # descender centre-line


# ---------------------------------------------------------------- geometry

def _norm(x, y):
    d = math.hypot(x, y)
    return (x / d, y / d) if d else (0.0, 0.0)


def fillet(pts):
    """pts: [(x, y, r)] -> dense list, corners with r > 0 rounded."""
    n = len(pts)
    out = []
    for i, (x, y, r) in enumerate(pts):
        if r <= 0 or i == 0 or i == n - 1:
            out.append((x, y))
            continue
        px, py, _ = pts[i - 1]
        nx, ny, _ = pts[i + 1]
        l1, l2 = math.hypot(px - x, py - y), math.hypot(nx - x, ny - y)
        v1, v2 = _norm(px - x, py - y), _norm(nx - x, ny - y)
        th = math.acos(max(-1.0, min(1.0, v1[0] * v2[0] + v1[1] * v2[1])))
        if th < 1e-3 or th > math.pi - 1e-3:
            out.append((x, y))
            continue
        t = min(r / math.tan(th / 2), l1 * 0.5, l2 * 0.5)
        re = t * math.tan(th / 2)
        t1 = (x + v1[0] * t, y + v1[1] * t)
        bx, by = _norm(v1[0] + v2[0], v1[1] + v2[1])
        dc = re / math.sin(th / 2)
        cx, cy = x + bx * dc, y + by * dc
        a1 = math.atan2(t1[1] - cy, t1[0] - cx)
        t2 = (x + v2[0] * t, y + v2[1] * t)
        a2 = math.atan2(t2[1] - cy, t2[0] - cx)
        da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        steps = max(4, int(abs(da) / (math.pi / 2) * 24))
        for k in range(steps + 1):
            a = a1 + da * k / steps
            out.append((cx + re * math.cos(a), cy + re * math.sin(a)))
    return out


def expand(items):
    """items: (x, y) / (x, y, r) vertices and ('C', c1, c2, p3) cubic segments."""
    pts = []
    for it in items:
        if it[0] == "C":
            _, c1, c2, p3 = it
            x0, y0, _ = pts[-1]
            for k in range(1, 33):
                t = k / 32
                u = 1 - t
                x = u ** 3 * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p3[0]
                y = u ** 3 * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p3[1]
                pts.append((x, y, 0))
        else:
            pts.append((it[0], it[1], it[2] if len(it) > 2 else 0))
    return fillet(pts)


class Pen:
    def __init__(self, s):
        self.s = s
        self.h = s / 2
        self.rd = s * 0.6           # dot radius
        self.shapes = []

    def nib(self, w):
        """Tilted ellipse: horizontal strokes come out thicker than vertical ones."""
        e = Point(0, 0).buffer(1, quad_segs=10)
        e = affinity.scale(e, w * NIB_X, w * NIB_Y)
        return affinity.rotate(e, NIB_ANGLE, origin=(0, 0))

    def path(self, *items, w=None):
        pts = expand(items)
        nib = self.nib(w or self.s)
        ring = list(nib.exterior.coords)
        # resample so consecutive points are close, then sweep the nib
        dense = [pts[0]]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 12))
            for k in range(1, n + 1):
                dense.append((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n))
        hulls = []
        for (x0, y0), (x1, y1) in zip(dense, dense[1:] or dense):
            hulls.append(MultiPoint([(x0 + a, y0 + b) for a, b in ring] +
                                    [(x1 + a, y1 + b) for a, b in ring]).convex_hull)
        self.shapes.append(unary_union(hulls))

    def loop(self, *items, w=None):
        pts = expand(items)
        hw = (w or self.s) / 2
        ring = Polygon(pts).exterior
        self.shapes.append(ring.buffer(hw, cap_style="round", join_style="round", quad_segs=12))

    def circle(self, cx, cy, r):
        """A stroked ring of centre-line radius r."""
        self.shapes.append(Point(cx, cy).buffer(r + self.h, quad_segs=24)
                           .difference(Point(cx, cy).buffer(max(r - self.h, 0.1), quad_segs=24)))

    def dot(self, x, y, k=1.0):
        self.shapes.append(Point(x, y).buffer(self.rd * k, quad_segs=16))

    def dots(self, n, cx, cy, above=True, k=1.0):
        r = self.rd * k
        gap = r * 1.12
        if n == 1:
            self.dot(cx, cy, k)
        elif n == 2:
            self.dot(cx - gap, cy, k)
            self.dot(cx + gap, cy, k)
        elif n == 3:
            self.dot(cx - gap, cy, k)
            self.dot(cx + gap, cy, k)
            self.dot(cx, cy + (r * 1.9 if above else -r * 1.9), k)

    def above(self, top):
        """Centre y for dots sitting above a stroke whose centre-line is at `top`."""
        return top + self.h + 45 + self.rd

    def below(self, bottom=B):
        return bottom - self.h - 45 - self.rd

    def hamza(self, cx, by, k=1.0):
        w = self.s * 0.55
        sc = k
        self.path((cx + 70 * sc, by + 150 * sc), ("C", (cx - 60 * sc, by + 190 * sc),
                  (cx - 90 * sc, by + 40 * sc), (cx + 60 * sc, by + 50 * sc)),
                  (cx - 90 * sc, by), w=w)

    def geometry(self):
        return unary_union(self.shapes) if self.shapes else None


# ---------------------------------------------------------------- glyphs
G = {}


def form_family(base, builders):
    for form, fn in builders.items():
        G[base if form == "iso" else f"{base}.{form}"] = fn


def glyph(name):
    def deco(fn):
        G[name] = fn
        return fn
    return deco


def E(p):
    return p.h + 30


# --- alef
def alef(fina, mark=None):
    def fn(p):
        if fina:
            adv = 2 * E(p) + 70
            x = E(p)
            p.path((adv, B), (x, B, 90), (x, A))
        else:
            adv = 2 * E(p)
            x = adv / 2
            p.path((x, B - 10), (x, A))
        if mark == "madda":
            p.path((x - 110, A + p.h + 90), ("C", (x - 50, A + p.h + 150), (x + 20, A + p.h + 40),
                   (x + 110, A + p.h + 110)), w=p.s * 0.6)
        elif mark == "hamza":
            p.hamza(x + 10, A + p.h + 40)
        elif mark == "hamza_below":
            p.hamza(x + 10, B - p.h - 230)
        return adv
    return fn


for cp, mark in [(0x0627, None), (0x0622, "madda"), (0x0623, "hamza"), (0x0625, "hamza_below")]:
    form_family(f"uni{cp:04X}", {"iso": alef(False, mark), "fina": alef(True, mark)})


# --- beh family
def beh(form, n, above, hamza=False, noon=False):
    def fn(p):
        e = E(p)
        if form == "init":
            adv = 2 * e + 40
            x = adv - e
            p.path((x, TT), (x, B, 110), (0, B))
            cx = x - 20
        elif form == "medi":
            adv = 2 * e + 50
            x = adv / 2
            p.path((adv, B), (0, B))
            p.path((x, TT), (x, B))
            cx = x
        elif form == "iso":
            adv = 640
            xr, xl = adv - e, e
            p.path((xr, B + 150), (xr, B, 120), (xl, B, 120), (xl, B + 170))
            cx = adv / 2
        else:
            adv = 640
            xl = e
            p.path((adv, B), (xl, B, 120), (xl, B + 170))
            p.path((adv - e - 20, B + 150), (adv - e - 20, B))
            cx = adv / 2
        if n:
            if above:
                y = p.above(TT if form in ("init", "medi") else B + 150)
                p.dots(n, cx, y, True)
            else:
                p.dots(n, cx, p.below(), False)
        if hamza:
            p.hamza(cx, (TT if form in ("init", "medi") else B + 160) + p.h + 30)
        return adv
    return fn


for cp, n, above in [(0x0628, 1, False), (0x067E, 3, False), (0x062A, 2, True), (0x062B, 3, True)]:
    form_family(f"uni{cp:04X}", {f: beh(f, n, above) for f in ("iso", "fina", "init", "medi")})


# --- noon / yeh bowls
def noon(form, dot):
    def fn(p):
        e = E(p)
        if form == "iso":
            adv = 580
            xr, xl = adv - e, e
            p.path((xr, B + 170), ("C", (xr + 10, D - 60), (xl - 10, D - 60), (xl, B + 150)))
        else:
            adv = 600
            xr, xl = adv - e - 60, e
            p.path((adv, B), ("C", (xr - 20, B), (xr + 40, D - 20), (xr - 170, D - 10)),
                   ("C", (xl + 20, D - 10), (xl - 10, B - 60), (xl, B + 150)))
        if dot:
            p.dot((xl + xr) / 2, p.above(B + 90))
        return adv
    return fn


form_family("uni0646", {"iso": noon("iso", 1), "fina": noon("fina", 1),
                        "init": beh("init", 1, True), "medi": beh("medi", 1, True)})


def yeh(form, hamza=False):
    def fn(p):
        e = E(p)
        if form == "iso":
            adv = 560
            xr, xl = adv - e, e
            p.path((xr - 10, B + 270), ("C", (xr - 220, B + 300), (xr - 250, B + 90), (xr - 110, B + 60)),
                   ("C", (xr + 30, B + 20), (xr + 40, D), (xr - 190, D)),
                   (xl + 90, D), ("C", (xl, D), (xl - 10, D + 50), (xl, D + 170)))
            cx = xr - 150
        else:
            adv = 540
            xr, xl = adv - e - 40, e
            p.path((adv, B), ("C", (xr - 40, B), (xr + 60, D), (xr - 160, D)),
                   (xl + 90, D), ("C", (xl, D), (xl - 10, D + 50), (xl, D + 170)))
            cx = (xl + xr) / 2
        if hamza:
            p.hamza(cx, B + 90)
        return adv
    return fn


form_family("uni06CC", {"iso": yeh("iso"), "fina": yeh("fina"),
                        "init": beh("init", 2, False), "medi": beh("medi", 2, False)})
form_family("uni0626", {"iso": yeh("iso", True), "fina": yeh("fina", True),
                        "init": beh("init", 0, True, hamza=True), "medi": beh("medi", 0, True, hamza=True)})


# --- jeem family
def jeem(form, n, above):
    def fn(p):
        e = E(p)
        head = BODY
        if form in ("iso", "fina"):
            adv = 620 if form == "iso" else 720
            xr, xl = adv - e, e
            xm = (xl + xr) / 2
            if form == "iso":
                start = [(xr, head - 60), ("C", (xr, head - 10), (xr - 30, head), (xr - 110, head))]
            else:
                xr = adv - e - 60
                start = [(adv, B), ("C", (adv - 110, B), (xr + 20, head - 80), (xr - 60, head))]
            p.path(*start, (xl + 140, head),
                   ("C", (xl - 40, head - 10), (xl - 50, D + 10), (xm - 10, D)),
                   ("C", (xm + 120, D), (xr - 60, D + 10), (xr, D + 80)))
            inner = (xm + 50, (head + D) / 2 + 10)
        else:
            adv = 600
            xr = adv - e
            xv = 230
            head = BODY + 30
            p.path((xr, head - 60), ("C", (xr, head - 10), (xr - 30, head), (xr - 110, head)),
                   (xv, head), ("C", (xv - 70, head), (xv - 110, B + 40), (xv - 200, B)),
                   *([(0, B)] if form == "init" else []))
            if form == "medi":
                p.path((adv, B), (0, B))
            inner = ((xv + xr) / 2 + 10, B + 60) if form == "init" else ((xv + xr) / 2 + 10, p.below())
        if n:
            if above:
                p.dots(n, inner[0] - 30, p.above(head), True)
            elif n == 3:
                p.dots(3, inner[0], inner[1] + 30, False, k=0.8)
            else:
                p.dot(*inner)
        return adv
    return fn


for cp, n, above in [(0x062C, 1, False), (0x0686, 3, False), (0x062D, 0, False), (0x062E, 1, True)]:
    form_family(f"uni{cp:04X}", {f: jeem(f, n, above) for f in ("iso", "fina", "init", "medi")})


# --- dal
def dal(fina, n):
    def fn(p):
        e = E(p)
        adv = 440 if not fina else 470
        xr, xl = adv - e - (40 if fina else 0), e
        p.path((xl + 70, BODY + 20), ("C", (xr - 40, BODY - 30), (xr + 30, B + 80), (xr - 70, B)), (xl, B))
        if fina:
            p.path((adv, B), (xr - 70, B))
        if n:
            p.dot(xl + 80, p.above(BODY + 20))
        return adv
    return fn


for cp, n in [(0x062F, 0), (0x0630, 1)]:
    form_family(f"uni{cp:04X}", {"iso": dal(False, n), "fina": dal(True, n)})


# --- reh
def reh(fina, n):
    def fn(p):
        e = E(p)
        adv = 380
        xr, xl = adv - e, e - 10
        if fina:
            p.path((adv, B), (xr - 30, B), ("C", (xr - 90, B - 20), (xr - 110, D + 30), (xl, D)))
        else:
            xr -= 20
            p.path((xr, B + 160), ("C", (xr + 10, B - 60), (xr - 90, D + 30), (xl, D)))
        if n:
            p.dots(n, xr - 30, p.above(B + 140), True, k=0.95)
        return adv
    return fn


for cp, n in [(0x0631, 0), (0x0632, 1), (0x0698, 3)]:
    form_family(f"uni{cp:04X}", {"iso": reh(False, n), "fina": reh(True, n)})


# --- seen family
STEP = 215
SEEN_T = B + 165


def seen(form, n):
    def fn(p):
        e = E(p)
        if form in ("init", "medi"):
            adv = 2 * STEP + 2 * e + (0 if form == "init" else 40)
            x3 = adv - e - (0 if form == "init" else 20)
            xs = [x3, x3 - STEP, x3 - 2 * STEP]
            if form == "init":
                p.path((x3, SEEN_T), (x3, B, 90), (0, B))
            else:
                p.path((adv, B), (0, B))
                p.path((x3, SEEN_T), (x3, B))
            for x in xs[1:]:
                p.path((x, SEEN_T), (x, B))
            mid = xs[1]
        else:
            xl = e
            xb = xl + 400
            x3 = xb + 2 * STEP
            p.path((xb, SEEN_T), ("C", (xb + 10, D - 90), (xl - 10, D - 90), (xl, B + 120)))
            p.path((xb + STEP, SEEN_T), (xb + STEP, B))
            if form == "iso":
                adv = x3 + e
                p.path((xb, B), (x3, B, 90), (x3, SEEN_T))
            else:
                adv = x3 + 90
                p.path((xb, B), (adv, B))
                p.path((x3, SEEN_T), (x3, B))
            mid = xb + STEP
        if n:
            p.dots(n, mid, p.above(SEEN_T), True)
        return adv
    return fn


for cp, n in [(0x0633, 0), (0x0634, 3)]:
    form_family(f"uni{cp:04X}", {f: seen(f, n) for f in ("iso", "fina", "init", "medi")})


# --- sad / tah
LOOP_H = 300


def sad_loop(p, xl, xr):
    t = B + 250
    r = (t - B) / 2
    p.loop((xl, B, 0), (xr - r, B, 0), ("C", (xr + r * 0.3, B), (xr + r * 0.3, t), (xr - r, t)),
           (xl + 60, t, 0), ("C", (xl - 20, t), (xl, B + 30), (xl, B)))


def sad(form, n):
    def fn(p):
        e = E(p)
        w = 380
        if form in ("iso", "fina"):
            xb = e + 380
            p.path((xb, B), ("C", (xb + 10, D - 90), (e - 10, D - 90), (e, B + 120)))
            xl = xb
        else:
            xl = e if form == "init" else 40
            p.path((xl, B), (0, B))
        xr = xl + w
        sad_loop(p, xl, xr)
        joined = form in ("fina", "medi")
        adv = xr + (90 if joined else e)
        if joined:
            p.path((adv, B), (xr - 60, B))
        if n:
            p.dot((xl + xr) / 2, p.above(B + 250))
        return adv
    return fn


for cp, n in [(0x0635, 0), (0x0636, 1)]:
    form_family(f"uni{cp:04X}", {f: sad(f, n) for f in ("iso", "fina", "init", "medi")})


def tah(form, n):
    def fn(p):
        e = E(p)
        jl, jr = form in ("init", "medi"), form in ("fina", "medi")
        xl = e + (20 if jl else 0)
        xr = xl + 380
        sad_loop(p, xl, xr)
        p.path((xl + 30, B + 40), (xl + 30, A - 20))
        if jl:
            p.path((xl, B), (0, B))
        adv = xr + (90 if jr else e)
        if jr:
            p.path((adv, B), (xr - 60, B))
        if n:
            p.dot(xl + 230, p.above(B + 250))
        return adv
    return fn


for cp, n in [(0x0637, 0), (0x0638, 1)]:
    form_family(f"uni{cp:04X}", {f: tah(f, n) for f in ("iso", "fina", "init", "medi")})


# --- ain
def ain(form, n):
    def fn(p):
        e = E(p)
        if form in ("iso", "init"):
            adv = 540 if form == "iso" else 460
            xr = adv - e
            head = [(xr, BODY + 40), ("C", (xr - 250, BODY + 110), (xr - 300, B + 110), (xr - 60, B + 90))]
            if form == "iso":
                xl = e
                xm = (xl + xr) / 2
                p.path(*head, ("C", (xl + 30, B + 80), (xl - 40, D + 20), (xm, D)),
                       ("C", (xm + 120, D), (xr - 40, D + 10), (xr, D + 80)))
            else:
                p.path(*head, (0, B))
            cx = xr - 130
            top = BODY + 60
        else:
            adv = 430 if form == "medi" else 520
            cx = adv / 2 if form == "medi" else adv - 200
            p.loop((cx - 120, B + 250), (cx + 120, B + 250), (cx, B))
            p.path((adv, B), (cx, B))
            if form == "medi":
                p.path((cx, B), (0, B))
            else:
                xl = e
                p.path((cx, B), ("C", (xl, B), (xl - 40, D + 20), (cx - 40, D)),
                       ("C", (cx + 80, D), (adv - e - 30, D + 10), (adv - e, D + 80)))
            top = B + 250
        if n:
            p.dot(cx, p.above(top))
        return adv
    return fn


for cp, n in [(0x0639, 0), (0x063A, 1)]:
    form_family(f"uni{cp:04X}", {f: ain(f, n) for f in ("iso", "fina", "init", "medi")})


# --- feh / qaf
def feh(form, n, qaf):
    def fn(p):
        e = E(p)
        r = 105
        jr = form in ("fina", "medi")
        if form in ("init", "medi"):
            cx = e + r - 20 + (0 if form == "init" else 20)
            p.path((cx, B), (0, B))
        elif qaf:
            cx = e + 400
            p.path((cx - 60, B), ("C", (cx - 100, D - 100), (e - 10, D - 90), (e, B + 120)))
        else:
            cx = e + 430
            p.path((cx, B), (e, B, 110), (e, B + 170))
        p.circle(cx, B + r, r)
        adv = cx + r + (90 if jr else e)
        if jr:
            p.path((adv, B), (cx, B))
        p.dots(n, cx, p.above(B + 2 * r), True)
        return adv
    return fn


form_family("uni0641", {f: feh(f, 1, False) for f in ("iso", "fina", "init", "medi")})
form_family("uni0642", {f: feh(f, 2, True) for f in ("iso", "fina", "init", "medi")})


# --- keheh / gaf: a "<" over a beh-like base
def kaf(form, gaf):
    def fn(p):
        e = E(p)
        jr = form in ("fina", "medi")
        free_l = form in ("iso", "fina")
        adv = 640 if free_l else 470
        xr = adv - e - (60 if jr else 0)
        tip = (xr - 250, B + 330)
        top = (xr - 10, A - 40)
        p.path(top, (tip[0], tip[1], 40), (xr, B + 20, 60), (e if free_l else 0, B, 110 if free_l else 0),
               *([(e, B + 170)] if free_l else []))
        if jr:
            p.path((adv, B), (xr - 40, B))
        if gaf:
            p.path((top[0] + 20, top[1] + 175), (tip[0] + 10, tip[1] + 210), w=p.s * 0.78)
        return adv
    return fn


for cp, gaf in [(0x06A9, False), (0x06AF, True)]:
    form_family(f"uni{cp:04X}", {f: kaf(f, gaf) for f in ("iso", "fina", "init", "medi")})


# --- lam
def lam(form):
    def fn(p):
        e = E(p)
        if form == "init":
            adv = 2 * e + 40
            x = adv - e
            p.path((x, A), (x, B, 110), (0, B))
        elif form == "medi":
            adv = 2 * e + 50
            x = adv / 2
            p.path((adv, B), (0, B))
            p.path((x, A), (x, B))
        else:
            adv = 500 if form == "iso" else 560
            xr = adv - e - (60 if form == "fina" else 0)
            p.path((xr, A), (xr, B + 20), ("C", (xr, D - 100), (e - 10, D - 90), (e, B + 120)))
            if form == "fina":
                p.path((adv, B), (xr, B))
        return adv
    return fn


form_family("uni0644", {f: lam(f) for f in ("iso", "fina", "init", "medi")})


def lam_alef(fina):
    def fn(p):
        e = E(p)
        adv = 470 if not fina else 520
        xr = adv - e - (60 if fina else 0)
        xm = xr - 170
        p.path((xr, A), (xr, B + 40, 0), ("C", (xr, B - 60), (xm + 40, B - 70), (xm, B + 20)), (e, A))
        if fina:
            p.path((adv, B), (xr, B))
        return adv
    return fn


G["lam_alef"] = lam_alef(False)
G["lam_alef.fina"] = lam_alef(True)


# --- meem
def meem(form):
    def fn(p):
        e = E(p)
        r = 100
        if form == "medi":
            adv = 2 * r + 2 * e + 40
            cx = adv / 2
            p.path((adv, B), (0, B))
            p.circle(cx, B - r + 10, r)
            return adv
        cx = e + r + (60 if form in ("iso", "fina") else 0)
        p.circle(cx, B + r, r)
        if form in ("iso", "fina"):
            p.path((cx - r, B + r), ("C", (cx - r, B), (cx - r - 10, B - 60), (cx - r - 10, D - 30)))
        if form == "init":
            p.path((cx, B), (0, B))
        adv = cx + r + (90 if form == "fina" else e)
        if form == "fina":
            p.path((adv, B), (cx, B))
        return adv
    return fn


form_family("uni0645", {f: meem(f) for f in ("iso", "fina", "init", "medi")})


# --- heh
def heh(form, n=0):
    def fn(p):
        e = E(p)
        if form == "iso":
            r = 140
            adv = 2 * r + 2 * e
            cx = adv / 2
            p.circle(cx, B + r, r)
            top = B + 2 * r
        elif form == "init":
            adv = 520
            xl, xr = e, adv - e
            p.loop((xl, B, 140), (xr, B, 140), (xr, BODY + 170, 140), (xl, BODY + 170, 140))
            p.path((xl, B + 30), ("C", (xl + 120, B + 60), (xl + 170, B + 140), (xl + 160, B + 230)))
            p.path((xl, B), (0, B))
            top = BODY + 170
            cx = adv / 2
        elif form == "medi":
            adv = 440
            cx = adv / 2
            p.path((adv, B), (0, B))
            p.loop((cx, B + 290, 70), (cx + 140, B, 70), (cx, B - 290, 70), (cx - 140, B, 70))
            top = B + 290
        else:
            r = 115
            cx = e + r
            p.circle(cx, B + r, r)
            adv = cx + r + 90
            p.path((adv, B), (cx, B))
            top = B + 2 * r
        if n:
            p.dots(n, cx, p.above(top), True)
        return adv
    return fn


form_family("uni0647", {f: heh(f) for f in ("iso", "fina", "init", "medi")})
form_family("uni0629", {"iso": heh("iso", 2), "fina": heh("fina", 2)})


# --- waw
def waw(fina, hamza):
    def fn(p):
        e = E(p)
        r = 95
        cx = e + 170
        p.circle(cx, B + r + 10, r)
        p.path((cx + r, B + r + 10), ("C", (cx + r, B - 80), (cx, D + 20), (e - 20, D)))
        adv = cx + r + (90 if fina else e)
        if fina:
            p.path((adv, B), (cx, B))
        if hamza:
            p.hamza(cx, B + 2 * r + p.h + 40)
        return adv
    return fn


form_family("uni0648", {"iso": waw(False, False), "fina": waw(True, False)})
form_family("uni0624", {"iso": waw(False, True), "fina": waw(True, True)})


@glyph("uni0621")
def hamza_glyph(p):
    p.hamza(180, B, k=1.5)
    return 380


@glyph("uni0640")
def tatweel(p):
    p.path((0, B), (260, B))
    return 260


# --- Persian digits
DH = 640


def dig(name, adv):
    def deco(fn):
        def wrapped(p):
            fn(p, p.h + 10, DH - p.h)
            return adv
        G[name] = wrapped
        return fn
    return deco


@dig("uni06F0", 380)
def d0(p, b, t):
    p.dot(190, 300, 1.15)


@dig("uni06F1", 330)
def d1(p, b, t):
    p.path((150, t), ("C", (185, t - 200), (180, b + 150), (175, b)))


@dig("uni06F2", 470)
def d2(p, b, t):
    p.path((130, b), (130, 380), ("C", (130, 480), (300, 470), (340, t)))


@dig("uni06F3", 520)
def d3(p, b, t):
    p.path((120, b), (120, 390), ("C", (120, 470), (230, 470), (250, t - 40)))
    p.path((250, 420), ("C", (270, 470), (370, 470), (390, t)))


@dig("uni06F4", 480)
def d4(p, b, t):
    p.path((130, b), (130, t))
    p.path((380, t), ("C", (200, t + 20), (190, 450), (330, 440)), ("C", (190, 430), (160, 340), (130, 330)))


@dig("uni06F5", 500)
def d5(p, b, t):
    p.loop((250, t), ("C", (330, t - 120), (390, b + 220), (370, b + 90)),
           ("C", (350, b - 20), (150, b - 20), (130, b + 90)), ("C", (110, b + 220), (170, t - 120), (250, t)))


@dig("uni06F6", 480)
def d6(p, b, t):
    p.path((150, t - 110), ("C", (150, t + 30), (360, t + 30), (350, t - 60)), (130, b))


@dig("uni06F7", 520)
def d7(p, b, t):
    p.path((110, t), (260, b + 10, 40), (410, t))


@dig("uni06F8", 520)
def d8(p, b, t):
    p.path((110, b), (260, t - 10, 40), (410, b))


@dig("uni06F9", 470)
def d9(p, b, t):
    p.circle(200, t - 105, 105)
    p.path((305, t - 105), ("C", (305, 300), (320, 150), (330, b)))


# Latin digits (rounded)
@dig("zero", 520)
def l0(p, b, t):
    p.loop((260, b), ("C", (420, b), (420, t), (260, t)), ("C", (100, t), (100, b), (260, b)))


@dig("one", 360)
def l1(p, b, t):
    p.path((90, t - 120), (210, t, 30), (210, b))


@dig("two", 500)
def l2(p, b, t):
    p.path((110, t - 90), ("C", (140, t + 40), (420, t + 20), (380, t - 170)), (110, b, 30), (400, b))


@dig("three", 500)
def l3(p, b, t):
    p.path((110, t - 60), ("C", (190, t + 40), (420, t), (360, 380)), ("C", (330, 340), (260, 340), (220, 340)))
    p.path((220, 340), ("C", (430, 340), (440, b - 10), (110, b + 50)))


@dig("four", 500)
def l4(p, b, t):
    p.path((300, t), (100, 220, 20), (420, 220))
    p.path((330, 380), (330, b))


@dig("five", 500)
def l5(p, b, t):
    p.path((390, t), (140, t, 20), (120, 360, 20), ("C", (430, 420), (440, b - 20), (110, b + 50)))


@dig("six", 500)
def l6(p, b, t):
    p.path((370, t), ("C", (150, t - 40), (110, 300), (130, 200)),
           ("C", (150, b - 20), (390, b - 20), (390, 200)), ("C", (390, 380), (150, 380), (130, 220)))


@dig("seven", 480)
def l7(p, b, t):
    p.path((100, t), (390, t, 20), (190, b))


@dig("eight", 500)
def l8(p, b, t):
    p.circle(250, 470, 110)
    p.circle(250, 190, 130)


@dig("nine", 500)
def l9(p, b, t):
    p.path((370, 400), ("C", (370, 590), (130, 600), (130, 440)), ("C", (130, 300), (370, 290), (370, 420)),
           ("C", (370, 220), (320, b), (130, b + 30)))


# --- punctuation
@glyph("space")
def space(p):
    return 260


@glyph("uni00A0")
def nbsp(p):
    return 260


for zw in ("uni200B", "uni200C", "uni200D", "uni200E", "uni200F", "uni2060", "uniFEFF"):
    G[zw] = lambda p: 0


def simple(name, adv, draw):
    def fn(p):
        draw(p)
        return adv
    G[name] = fn


simple("period", 260, lambda p: p.dot(130, p.rd))
simple("colon", 260, lambda p: (p.dot(130, p.rd), p.dot(130, 380)))
simple("exclam", 260, lambda p: (p.path((130, 300), (130, DH - p.h)), p.dot(130, p.rd)))
simple("comma", 260, lambda p: p.path((150, 110), ("C", (150, 20), (120, -60), (80, -110))))
simple("semicolon", 260, lambda p: (p.path((150, 110), ("C", (150, 20), (120, -60), (80, -110))),
                                    p.dot(140, 380)))
simple("uni060C", 280, lambda p: p.path((150, 110), ("C", (120, 190), (140, 260), (190, 300))))
simple("uni061B", 280, lambda p: (p.path((150, 110), ("C", (120, 190), (140, 260), (190, 300))),
                                  p.dot(160, 470)))
simple("question", 480, lambda p: (
    p.path((110, 500), ("C", (130, 680), (400, 660), (370, 500)), ("C", (350, 400), (240, 410), (240, 270))),
    p.dot(240, p.rd)))
simple("uni061F", 480, lambda p: (
    p.path((370, 500), ("C", (350, 680), (80, 660), (110, 500)), ("C", (130, 400), (240, 410), (240, 270))),
    p.dot(240, p.rd)))
simple("hyphen", 400, lambda p: p.path((90, 280), (310, 280)))
simple("endash", 540, lambda p: p.path((80, 280), (460, 280)))
simple("emdash", 1000, lambda p: p.path((60, 280), (940, 280)))
simple("underscore", 540, lambda p: p.path((60, -130), (480, -130)))
simple("parenleft", 340, lambda p: p.path((240, 760), ("C", (60, 600), (60, 40), (240, -140))))
simple("parenright", 340, lambda p: p.path((100, 760), ("C", (280, 600), (280, 40), (100, -140))))
simple("slash", 420, lambda p: p.path((90, -80), (330, 720)))
simple("plus", 540, lambda p: (p.path((100, 300), (440, 300)), p.path((270, 130), (270, 470))))
simple("equal", 540, lambda p: (p.path((100, 210), (440, 210)), p.path((100, 390), (440, 390))))
simple("quotedbl", 360, lambda p: (p.path((120, 520), (120, 690)), p.path((240, 520), (240, 690))))
simple("quotesingle", 240, lambda p: p.path((120, 520), (120, 690)))
simple("uni066A", 520, lambda p: (p.dot(130, 520, 0.9), p.dot(390, 90, 0.9), p.path((120, 30), (400, 600))))
simple("percent", 560, lambda p: (p.dot(140, 520, 0.95), p.dot(420, 90, 0.95), p.path((120, 30), (440, 600))))
simple("uni066B", 260, lambda p: p.path((150, 110), ("C", (150, 20), (120, -60), (80, -110))))
simple("uni066C", 260, lambda p: p.path((150, 110), ("C", (150, 20), (120, -60), (80, -110))))


def guillemet(left):
    def fn(p):
        for dx in (0, 190):
            if left:
                p.path((250 + dx, 470), (100 + dx, 290, 30), (250 + dx, 110))
            else:
                p.path((100 + dx, 470), (250 + dx, 290, 30), (100 + dx, 110))
        return 540
    return fn


G["guillemotleft"] = guillemet(True)
G["guillemotright"] = guillemet(False)


# --- harakat (GPOS mark attachment)
MARKS = {}


def mark(name, above):
    def deco(fn):
        def wrapped(p):
            fn(p)
            return 0
        G[name] = wrapped
        MARKS[name] = above
        return fn
    return deco


@mark("uni064E", True)
def fatha(p):
    p.path((-90, 30), (90, 110), w=p.s * 0.6)


@mark("uni0650", False)
def kasra(p):
    p.path((-90, -110), (90, -30), w=p.s * 0.6)


@mark("uni064B", True)
def fathatan(p):
    p.path((-90, 30), (90, 110), w=p.s * 0.6)
    p.path((-90, 150), (90, 230), w=p.s * 0.6)


@mark("uni064D", False)
def kasratan(p):
    p.path((-90, -110), (90, -30), w=p.s * 0.6)
    p.path((-90, -230), (90, -150), w=p.s * 0.6)


@mark("uni064F", True)
def damma(p):
    p.path((-80, 10), ("C", (30, 40), (60, 90), (40, 140)), ("C", (10, 190), (-60, 150), (0, 100)),
           w=p.s * 0.55)


@mark("uni064C", True)
def dammatan(p):
    damma(p)
    p.path((110, 40), (110, 160), w=p.s * 0.55)


@mark("uni0651", True)
def shadda(p):
    p.path((-120, 140), (-120, 30, 40), (0, 30), (0, 110), w=p.s * 0.55)
    p.path((0, 30), (120, 30, 40), (120, 140), w=p.s * 0.55)


@mark("uni0652", True)
def sukun(p):
    p.shapes.append(Point(0, 80).buffer(75).difference(Point(0, 80).buffer(30)))


@mark("uni0654", True)
def hamza_above(p):
    p.hamza(0, 0, k=0.85)


# ---------------------------------------------------------------- tables

DUAL = ["0628", "067E", "062A", "062B", "062C", "0686", "062D", "062E", "0633", "0634",
        "0635", "0636", "0637", "0638", "0639", "063A", "0641", "0642", "06A9", "06AF",
        "0644", "0645", "0646", "0647", "06CC", "0626"]
RIGHT = ["0627", "0622", "0623", "0625", "062F", "0630", "0631", "0632", "0698", "0648",
         "0624", "0629"]
DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]

CMAP = {
    0x20: "space", 0xA0: "uni00A0", 0x2E: "period", 0x2C: "comma", 0x3A: "colon",
    0x3B: "semicolon", 0x21: "exclam", 0x3F: "question", 0x2D: "hyphen", 0x2013: "endash",
    0x2014: "emdash", 0x5F: "underscore", 0x28: "parenleft", 0x29: "parenright", 0x2F: "slash",
    0x2B: "plus", 0x3D: "equal", 0x25: "percent", 0x27: "quotesingle", 0x22: "quotedbl",
    0x2019: "quotesingle", 0x201C: "quotedbl", 0x201D: "quotedbl",
    0xAB: "guillemotleft", 0xBB: "guillemotright",
    0x060C: "uni060C", 0x061B: "uni061B", 0x061F: "uni061F", 0x066A: "uni066A",
    0x066B: "uni066B", 0x066C: "uni066C", 0x0640: "uni0640", 0x0621: "uni0621",
    0x200B: "uni200B", 0x200C: "uni200C", 0x200D: "uni200D", 0x200E: "uni200E",
    0x200F: "uni200F", 0x2060: "uni2060", 0xFEFF: "uniFEFF",
    0x0643: "uni06A9", 0x064A: "uni06CC", 0x0649: "uni06CC",
}
for i, d in enumerate(DIGITS):
    CMAP[0x30 + i] = d
    CMAP[0x06F0 + i] = f"uni{0x06F0 + i:04X}"
    CMAP[0x0660 + i] = f"uni{0x06F0 + i:04X}"
for cp in DUAL + RIGHT:
    CMAP[int(cp, 16)] = f"uni{cp}"
for m in MARKS:
    CMAP[int(m[3:], 16)] = m

# Presentation forms for apps that do not shape Arabic script themselves.
PRES4 = {
    "0628": 0xFE8F, "062A": 0xFE95, "062B": 0xFE99, "062C": 0xFE9D, "062D": 0xFEA1,
    "062E": 0xFEA5, "0633": 0xFEB1, "0634": 0xFEB5, "0635": 0xFEB9, "0636": 0xFEBD,
    "0637": 0xFEC1, "0638": 0xFEC5, "0639": 0xFEC9, "063A": 0xFECD, "0641": 0xFED1,
    "0642": 0xFED5, "06A9": 0xFED9, "0644": 0xFEDD, "0645": 0xFEE1, "0646": 0xFEE5,
    "0647": 0xFEE9, "06CC": 0xFEF1, "0626": 0xFE89,
    "067E": 0xFB56, "0686": 0xFB7A, "06AF": 0xFB92,
}
PRES4_A = {"06A9": 0xFB8E, "06CC": 0xFBFC}
PRES2 = {"0622": 0xFE81, "0623": 0xFE83, "0624": 0xFE85, "0625": 0xFE87, "0627": 0xFE8D,
         "0629": 0xFE93, "062F": 0xFEA9, "0630": 0xFEAB, "0631": 0xFEAD, "0632": 0xFEAF,
         "0648": 0xFEED, "0698": 0xFB8A}
for table in (PRES4, PRES4_A):
    for cp, start in table.items():
        for k, form in enumerate(("", ".fina", ".init", ".medi")):
            CMAP[start + k] = f"uni{cp}{form}"
for cp, start in PRES2.items():
    CMAP[start] = f"uni{cp}"
    CMAP[start + 1] = f"uni{cp}.fina"
CMAP.update({0xFE80: "uni0621", 0xFEFB: "lam_alef", 0xFEFC: "lam_alef.fina",
             0xFEEF: "uni06CC", 0xFEF0: "uni06CC.fina"})


def features(advances, bounds):
    fea = ["languagesystem DFLT dflt;", "languagesystem arab dflt;", ""]
    for form, letters in (("init", DUAL), ("medi", DUAL), ("fina", DUAL + RIGHT)):
        src = " ".join(f"uni{c}" for c in letters)
        dst = " ".join(f"uni{c}.{form}" for c in letters)
        fea.append(f"feature {form} {{ lookupflag IgnoreMarks; sub [{src}] by [{dst}]; }} {form};")
    fea.append("feature rlig { lookupflag IgnoreMarks;"
               " sub uni0644.init uni0627.fina by lam_alef;"
               " sub uni0644.medi uni0627.fina by lam_alef.fina; } rlig;")
    for m, above in MARKS.items():
        fea.append(f"markClass {m} <anchor 0 0> @{'TOP' if above else 'BOTTOM'};")
    bases = [g for g in advances if g not in MARKS and advances[g] > 0]
    lines = []
    for g in bases:
        xmin, ymin, xmax, ymax = bounds.get(g, (0, 0, advances[g], BODY))
        cx = round((xmin + xmax) / 2)
        lines.append(f"pos base {g} <anchor {cx} {round(max(BODY + 100, ymax) + 50)}> mark @TOP"
                     f" <anchor {cx} {round(min(0, ymin) - 50)}> mark @BOTTOM;")
    fea.append("feature mark {\n" + "\n".join(lines) + "\n} mark;")
    fea.append(f"table GDEF {{ GlyphClassDef [{' '.join(bases)}], , [{' '.join(MARKS)}], ; }} GDEF;")
    return "\n".join(fea)


# ---------------------------------------------------------------- build

def draw(geom, pen):
    if geom is None or geom.is_empty:
        return
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    for poly in polys:
        poly = orient(poly.simplify(0.6, preserve_topology=True), sign=-1.0)
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
        p = Pen(stroke)
        if name == ".notdef":
            p.loop((80, 60), (420, 60), (420, 640), (80, 640))
            adv = 500
        else:
            adv = G[name](p)
        geom = p.geometry()
        if geom is not None and not geom.is_empty and SLANT:
            geom = affinity.skew(geom, xs=math.degrees(math.atan(SLANT)), origin=(0, 0))
        pen = TTGlyphPen(None)
        draw(geom, pen)
        glyphs[name] = pen.glyph()
        advances[name] = adv
        if geom is not None and not geom.is_empty:
            bounds[name] = geom.bounds
        metrics[name] = (adv, round(geom.bounds[0]) if geom is not None and not geom.is_empty else 0)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(CMAP)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=1000, descent=-420)
    ps = f"{FAMILY}-{style}"
    is_ribbi = style == "Bold"
    fb.setupNameTable({
        "familyName": FAMILY if is_ribbi else f"{FAMILY} {style}",
        "styleName": style if is_ribbi else "Regular",
        "typographicFamily": FAMILY,
        "typographicSubfamily": style,
        "uniqueFontIdentifier": f"{ps};{VERSION}",
        "fullName": f"{FAMILY} {style}",
        "psName": ps,
        "version": f"Version {VERSION}",
        "copyright": "Copyright 2026 Pouria Salimi.",
        "designer": "Pouria Salimi with Claude",
        "description": "Heavy rounded Persian display and caption typeface.",
        "licenseDescription": "Free for personal and commercial use by the owner and their clients.",
    })
    fb.setupOS2(version=4, usWeightClass=weight, sTypoAscender=950, sTypoDescender=-380, sTypoLineGap=0,
                usWinAscent=1000, usWinDescent=420, sxHeight=BODY, sCapHeight=A,
                fsSelection=(0x20 if style == "Bold" else 0x40) | 0x80, achVendID="POUR",
                ulUnicodeRange1=(1 << 0) | (1 << 13), ulCodePageRange1=(1 << 0) | (1 << 6))
    fb.setupPost()
    fb.setupHead(unitsPerEm=UPM, created=STAMP, modified=STAMP, macStyle=1 if style == "Bold" else 0)
    addOpenTypeFeaturesFromString(fb.font, features(advances, bounds))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{ps}.ttf")
    fb.font.save(path)
    fb.font.flavor = "woff2"
    fb.font.save(os.path.join(out_dir, f"{ps}.woff2"))
    return path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "fonts"
    for style, weight, stroke in WEIGHTS:
        print(build(out, style, weight, stroke))
