#!/usr/bin/env python3
"""Shaped, bidirectional text for the DJ Aliens story renderer.

Pillow cannot shape Persian on this machine: its bundled FreeType has no Raqm,
and the brand fonts (Vazirmatn, Lalezar) carry no Arabic Presentation Forms, so
the usual `arabic_reshaper` trick would draw tofu. This module shapes runs with
HarfBuzz (uharfbuzz) and rasterises the resulting glyph ids with FreeType
(freetype-py), which gives the same joining, ligatures and kerning a browser
would.

It also runs a small bidi pass, because a Persian line that carries a Latin name
(or a Persian date) must not come out mirrored: "دی‌جی‌ستِ ALIENS" has to keep
ALIENS left-to-right while the line itself runs right-to-left. HarfBuzz only
reverses the buffer it is given, so the line is split into script runs, each is
shaped in its own direction, and the runs are laid out in visual order.

Deterministic by design: no network, no fontconfig, no system font lookup.
"""

from __future__ import annotations

import math
import os
import tempfile
import unicodedata

import freetype
import uharfbuzz as hb
from PIL import Image, ImageFilter

from bidi import split_runs

SUPERSAMPLE = 3  # glyph masks are rasterised at 3x and downsampled for clean edges
_CACHE_DIR = os.path.join(tempfile.gettempdir(), "dj-aliens-fonts")
_TTF_CACHE: dict[str, str] = {}

# --------------------------------------------------------------------------- fonts
def truetype_path(path: str) -> str:
    """Repo fonts ship as WOFF2; FreeType/HarfBuzz need a raw container."""
    if not path.lower().endswith(".woff2"):
        return path
    if path in _TTF_CACHE:
        return _TTF_CACHE[path]

    from fontTools.ttLib import TTFont

    os.makedirs(_CACHE_DIR, exist_ok=True)
    target = os.path.join(_CACHE_DIR, os.path.basename(path)[:-6] + ".ttf")
    if not os.path.exists(target):
        font = TTFont(path)
        font.flavor = None
        font.save(target)
    _TTF_CACHE[path] = target
    return target


class Face:
    """One font at one pixel size."""

    def __init__(self, path: str, size: float):
        self.path = path
        self.size = float(size)
        self.ttf = truetype_path(path)
        self._free = freetype.Face(self.ttf)
        self._free.set_char_size(int(round(self.size * 64)))
        self._hb = hb.Font(hb.Face(hb.Blob.from_file_path(self.ttf)))
        self._hb.scale = (int(round(self.size * 64)), int(round(self.size * 64)))
        self.upem = self._free.units_per_EM or 1000
        self.ascender = self._free.ascender * self.size / self.upem
        self.descender = self._free.descender * self.size / self.upem

    def measure(self, text: str, *, direction: str | None = None,
                letter_spacing: float = 0.0, features: dict | None = None) -> float:
        mask, offset_x, _ = line_mask(self, text, direction=direction,
                                      letter_spacing=letter_spacing, features=features)
        return mask.width

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Face {os.path.basename(self.path)} {self.size:.0f}px>"


# ---------------------------------------------------------------------------- bidi
# ------------------------------------------------------------------------- shaping
def run_mask(face: Face, text: str, *, direction: str | None = None,
             letter_spacing: float = 0.0, features: dict | None = None,
             supersample: int = SUPERSAMPLE):
    """Rasterise one shaped run.

    Returns (mask, offset_x, baseline_from_top, advance). The mask is as wide as
    the run's advance — not as wide as its ink — so the spaces that separate a
    Latin name from Persian words survive run splitting.
    """
    size = face.size * supersample
    big_face = freetype.Face(face.ttf)
    big_face.set_char_size(int(round(size * 64)))
    hb_font = hb.Font(hb.Face(hb.Blob.from_file_path(face.ttf)))
    hb_font.scale = (int(round(size * 64)), int(round(size * 64)))

    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    if direction:
        buf.direction = direction
    hb.shape(hb_font, buf, features or {})

    flags = freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING
    pen_x = pen_y = 0.0
    drawn = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        big_face.load_glyph(info.codepoint, flags)
        slot = big_face.glyph
        bitmap = slot.bitmap
        if bitmap.width and bitmap.rows:
            glyph = Image.frombytes("L", (bitmap.width, bitmap.rows), bytes(bitmap.buffer),
                                    "raw", "L", bitmap.pitch)
            drawn.append((glyph, pen_x + slot.bitmap_left + pos.x_offset / 64,
                          pen_y - slot.bitmap_top - pos.y_offset / 64))
        pen_x += pos.x_advance / 64 + letter_spacing * supersample
        pen_y += pos.y_advance / 64

    advance = pen_x
    if not drawn:
        return Image.new("L", (max(1, round(advance / supersample)), 1), 0), 0.0, 0.0, advance / supersample

    min_x = min(0.0, min(x for _, x, _ in drawn))
    min_y = min(y for _, _, y in drawn)
    width = math.ceil(max(max(x + m.width for m, x, _ in drawn) - min_x, advance - min_x))
    height = math.ceil(max(y + m.height for m, _, y in drawn) - min_y)
    canvas = Image.new("L", (max(1, width), max(1, height)), 0)
    for glyph, x, y in drawn:
        canvas.paste(glyph, (int(round(x - min_x)), int(round(y - min_y))), glyph)

    mask = canvas.resize((max(1, round(canvas.width / supersample)),
                          max(1, round(canvas.height / supersample))), Image.LANCZOS)
    return mask, min_x / supersample, -min_y / supersample, advance / supersample


def line_mask(face: Face, text: str, *, direction: str | None = None,
              letter_spacing: float = 0.0, features: dict | None = None,
              run_gap: float = 0.12):
    """Rasterise a whole (possibly mixed-script) line in visual order.

    `run_gap` is in ems and separates adjacent script runs: without it a Persian
    word and the Latin name beside it (or "۱۴ و ۱۵") collide.
    """
    runs = split_runs(text)
    if not runs:
        return Image.new("L", (1, 1), 0), 0.0, 0.0

    shaped = [run_mask(face, chunk, direction=direction or d,
                       letter_spacing=letter_spacing, features=features)
              for d, chunk in runs]
    gap = letter_spacing + face.size * run_gap

    baseline = max(run[2] for run in shaped)
    cursor = 0.0
    placed = []
    for index, (mask, offset_x, run_baseline, advance) in enumerate(shaped):
        placed.append((mask, cursor + offset_x, baseline - run_baseline))
        cursor += advance + (gap if index < len(shaped) - 1 else 0.0)

    min_x = min(x for _, x, _ in placed)
    max_x = max(max(x + m.width for m, x, _ in placed), cursor)
    min_y = min(y for _, _, y in placed)
    max_y = max(y + m.height for m, _, y in placed)

    canvas = Image.new("L", (max(1, math.ceil(max_x - min_x)), max(1, math.ceil(max_y - min_y))), 0)
    for mask, x, y in placed:
        canvas.paste(mask, (int(round(x - min_x)), int(round(y - min_y))), mask)
    return canvas, min_x, baseline - min_y


# ------------------------------------------------------------------------- drawing
def draw_text(
    image: Image.Image,
    face: Face,
    text: str,
    xy: tuple[float, float],
    *,
    fill=(255, 255, 255),
    anchor: str = "ls",
    direction: str | None = None,
    letter_spacing: float = 0.0,
    alpha: float = 1.0,
    glow: float = 0.0,
    glow_color=None,
    glow_alpha: float = 0.85,
    shadow: tuple[float, float] | None = None,
    shadow_alpha: float = 0.6,
    shadow_blur: float = 16.0,
    features: dict | None = None,
    run_gap: float = 0.12,
):
    """Composite a shaped line onto an RGBA canvas. Returns the drawn width."""
    mask, offset_x, baseline = line_mask(face, text, direction=direction,
                                         letter_spacing=letter_spacing, features=features,
                                         run_gap=run_gap)
    w, h = mask.size
    x, y = xy
    if anchor[0] == "l":
        left = x - offset_x
    elif anchor[0] == "c":
        left = x - w / 2 - offset_x
    else:
        left = x - w - offset_x
    if anchor[1] == "s":                       # baseline
        top = y - baseline
    elif anchor[1] == "t":
        top = y
    elif anchor[1] == "b":
        top = y - h
    else:                                      # vertical centre of the ink
        top = y - h / 2

    pad = int(math.ceil(max(glow * 3, (shadow_blur * 3) if shadow else 0))) + 6
    canvas = Image.new("L", (w + pad * 2, h + pad * 2), 0)
    canvas.paste(mask, (pad, pad))
    origin = (round(left) - pad, round(top) - pad)

    def blurred(source: Image.Image, radius: float) -> Image.Image:
        # blur at 1/3 scale: cheap kernel, no visible banding
        small = source.resize((max(1, source.width // 3), max(1, source.height // 3)), Image.LANCZOS)
        small = small.filter(ImageFilter.GaussianBlur(max(0.5, radius / 3)))
        return small.resize(source.size, Image.LANCZOS)

    def tint(alpha_mask: Image.Image, color, strength: float, offset=(0, 0)) -> None:
        if isinstance(color, int):
            color = (color, color, color)
        solid = Image.new("RGBA", alpha_mask.size, (*color[:3], 255))
        solid.putalpha(alpha_mask.point(lambda v, k=strength: int(v * k)))
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        layer.paste(solid, (origin[0] + offset[0], origin[1] + offset[1]), solid)
        image.alpha_composite(layer)

    if shadow:
        tint(blurred(canvas, shadow_blur), (0, 0, 0), shadow_alpha, (int(shadow[0]), int(shadow[1])))
    if glow > 0:
        tint(blurred(canvas, glow), glow_color or fill, glow_alpha)
    if alpha < 1:
        canvas = canvas.point(lambda v, k=alpha: int(v * k))
    tint(canvas, fill, 1.0)
    return w


def rich_width(face: Face, text: str, *, letter_spacing: float = 0.0,
               run_gap: float = 0.14) -> float:
    """Width of a mixed-script line exactly as draw_rich_text will lay it out."""
    runs = split_runs(text)
    if not runs:
        return 0.0
    gap = letter_spacing + face.size * run_gap
    total = sum(run_mask(face, chunk, direction=kind, letter_spacing=letter_spacing)[3]
                for kind, chunk in runs)
    return total + gap * (len(runs) - 1)


def draw_rich_text(image: Image.Image, face: Face, text: str, xy: tuple[float, float], *,
                   colors: dict, anchor: str = "cs", letter_spacing: float = 0.0,
                   run_gap: float = 0.14, shadow=(0, 4), shadow_blur=12, shadow_alpha=0.6,
                   glow: float = 0.0, glow_alpha: float = 0.5, alpha: float = 1.0):
    """Draw a mixed-script line with one colour per script ("R" Persian, "L" Latin/N).

    Latin names inside a Persian sentence read better in the accent colour, and a
    small extra gap at the script boundary keeps the two alphabets from colliding.
    """
    runs = split_runs(text)
    if not runs:
        return 0.0
    gap = letter_spacing + face.size * run_gap

    shaped = []
    cursor = 0.0
    baseline = 0.0
    for index, (kind, chunk) in enumerate(runs):
        mask, offset_x, run_baseline, advance = run_mask(face, chunk, direction=kind,
                                                         letter_spacing=letter_spacing)
        shaped.append((kind, mask, cursor + offset_x, run_baseline))
        cursor += advance
        if index < len(runs) - 1:
            cursor += gap
        baseline = max(baseline, run_baseline)

    total_w = cursor
    x, y = xy
    left = x - total_w / 2 if anchor[0] == "c" else (x - total_w if anchor[0] == "r" else x)

    for kind, mask, offset_x, run_baseline in shaped:
        color = colors.get(kind, colors.get("R", (255, 255, 255)))
        _blit_mask(image, mask, (left + offset_x, y - baseline), color,
                   shadow=shadow, shadow_blur=shadow_blur, shadow_alpha=shadow_alpha,
                   glow=glow, glow_alpha=glow_alpha, alpha=alpha)
    return total_w


def _blit_mask(image: Image.Image, mask: Image.Image, xy: tuple[float, float], fill,
               *, shadow=None, shadow_blur=12.0, shadow_alpha=0.6,
               glow=0.0, glow_alpha=0.5, alpha=1.0):
    """Composite a tinted mask (with optional glow/shadow) at an exact offset."""
    pad = int(math.ceil(max(glow * 3, (shadow_blur * 3) if shadow else 0))) + 6
    canvas = Image.new("L", (mask.width + pad * 2, mask.height + pad * 2), 0)
    canvas.paste(mask, (pad, pad))
    origin = (round(xy[0]) - pad, round(xy[1]) - pad)

    def blurred(source, radius):
        small = source.resize((max(1, source.width // 3), max(1, source.height // 3)), Image.LANCZOS)
        small = small.filter(ImageFilter.GaussianBlur(max(0.5, radius / 3)))
        return small.resize(source.size, Image.LANCZOS)

    def tint(alpha_mask, color, strength, offset=(0, 0)):
        if isinstance(color, int):
            color = (color, color, color)
        solid = Image.new("RGBA", alpha_mask.size, (*color[:3], 255))
        solid.putalpha(alpha_mask.point(lambda v, k=strength: int(v * k)))
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        layer.paste(solid, (origin[0] + int(offset[0]), origin[1] + int(offset[1])), solid)
        image.alpha_composite(layer)

    if shadow:
        tint(blurred(canvas, shadow_blur), (0, 0, 0), shadow_alpha, shadow)
    if glow > 0:
        tint(blurred(canvas, glow), fill, glow_alpha)
    if alpha < 1:
        canvas = canvas.point(lambda v, k=alpha: int(v * k))
    tint(canvas, fill, 1.0)


def fit_face(path: str, text: str, max_width: float, start: float, minimum: float = 18,
             letter_spacing: float = 0.0) -> Face:
    """Largest size (<= start) at which `text` fits `max_width`."""
    size = start
    while size > minimum:
        face = Face(path, size)
        if face.measure(text, letter_spacing=letter_spacing) <= max_width:
            return face
        size -= 2
    return Face(path, minimum)
