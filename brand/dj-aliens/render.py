#!/usr/bin/env python3
"""DJ Aliens × Viking — Halloween night Story renderer.

Draws one 1080x1920 PNG from `brief.json` + `assets/`. There is no browser in
this pipeline on purpose: the sandbox has no Chromium, and this renderer is
offline, deterministic and reproducible (same input -> same output).

Persian is shaped with HarfBuzz, see `textkit.py`; the photograph is a plate
generated once by an image model (`assets/desert-night.jpg`), never drawn with
code.

    python3 render.py                        # -> deliverables/*.png
    python3 render.py --format story --out /tmp/review
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from textkit import Face, draw_rich_text, draw_text, fit_face, rich_width

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
FONTS = ASSETS / "fonts"

W, H = 1080, 1920                 # Instagram / Telegram Story, 9:16
POST_H = 1350                     # feed frame, 4:5
ORANGE = (243, 154, 43)           # template orange (brand/viking palette)
ORANGE_HOT = (255, 176, 64)
BLACK = (20, 20, 20)
CREAM = (255, 217, 168)
WHITE = (255, 255, 255)
VIOLET = (118, 96, 235)           # campaign accent: alien night
DEEP = (10, 11, 15)

# Critical content stays inside 210..1700 so Instagram's own chrome never covers it.
SAFE_TOP, SAFE_BOTTOM = 210, 1700

F_WORD = str(FONTS / "orbitron-latin-900-normal.woff2")
F_TECH = str(FONTS / "orbitron-latin-700-normal.woff2")
F_TECH_B = str(FONTS / "orbitron-latin-800-normal.woff2")
F_FA_BLACK = str(FONTS / "Vazirmatn-Black.woff2")
F_FA_BOLD = str(FONTS / "Vazirmatn-Bold.woff2")
F_FA_MED = str(FONTS / "Vazirmatn-Medium.woff2")
F_FA_DISPLAY = str(FONTS / "Lalezar.woff2")


# --------------------------------------------------------------------- helpers
def rrect(size, radius, fill=255) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=fill)
    return mask


def soft_glow(mask: Image.Image, color, radius: float, strength: float) -> Image.Image:
    if mask.mode != "L":
        mask = mask.convert("L")
    small = mask.resize((max(1, mask.width // 4), max(1, mask.height // 4)), Image.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(max(0.4, radius / 4)))
    soft = small.resize(mask.size, Image.LANCZOS)
    solid = Image.new("RGBA", mask.size, (*color[:3], 255))
    solid.putalpha(soft.point(lambda v: int(v * strength)))
    return solid


def cover(image: Image.Image, size) -> Image.Image:
    tw, th = size
    scale = max(tw / image.width, th / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def vertical_gradient(size, stops):
    """Continuous vertical gradient. `stops` = [(t, (r,g,b,a)), ...] with t in 0..1."""
    w, h = size
    column = Image.new("RGBA", (1, h))
    px = column.load()
    for row in range(h):
        t = row / max(1, h - 1)
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                px[0, row] = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(4))
                break
        else:
            px[0, row] = stops[-1][1]
    return column.resize((w, h), Image.BICUBIC)


def vignette(size, strength=0.8, power=1.5) -> Image.Image:
    small = Image.new("L", (size[0] // 8, size[1] // 8), 0)
    px = small.load()
    cx, cy = small.width / 2, small.height / 2
    for y in range(small.height):
        for x in range(small.width):
            d = math.hypot((x - cx) / cx, (y - cy) / cy) / math.sqrt(2)
            px[x, y] = int(255 * min(1, max(0, (d - 0.3) / 0.7)) ** power * strength)
    mask = small.resize(size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(24))
    layer = Image.new("RGBA", size, (0, 0, 0, 255))
    layer.putalpha(mask)
    return layer


def grain(size, amount=6, seed=11) -> Image.Image:
    rnd = random.Random(seed)
    small = Image.new("L", (size[0] // 2, size[1] // 2))
    small.putdata([128 + int(rnd.gauss(0, amount)) for _ in range(small.width * small.height)])
    noise = small.resize(size, Image.BILINEAR)
    layer = Image.new("RGBA", size, (255, 255, 255, 255))
    layer.putalpha(noise.point(lambda v: int(abs(v - 128) * 0.5)))
    return layer


def padlock(draw: ImageDraw.ImageDraw, x: float, cy: float, size: float, color):
    """Tiny outline padlock whose body sits on the text's optical centre."""
    body_w = size * 0.82
    body_h = size * 0.60
    bx, by = x, cy - body_h / 2 + size * 0.1
    width = max(2, int(size * 0.12))
    draw.rounded_rectangle([bx, by, bx + body_w, by + body_h], radius=size * 0.16,
                           outline=color, width=width)
    r = body_w * 0.30
    draw.arc([bx + body_w / 2 - r, by - size * 0.5, bx + body_w / 2 + r, by + size * 0.12],
             180, 360, fill=color, width=width)


def chat_icon(size: float, color) -> Image.Image:
    """Outline speech bubble with a tail — the 'send a DM' affordance."""
    scale = 4
    side = int(size * scale)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    stroke = max(3, int(side * 0.075))
    box = [side * 0.08, side * 0.12, side * 0.92, side * 0.80]
    d.rounded_rectangle(box, radius=int(side * 0.26), outline=(*color, 255), width=stroke)
    # tail: filled triangle hanging off the bottom edge, level with the border
    tx = side * 0.30
    d.polygon([(tx, box[3] - stroke), (tx + side * 0.02, side * 0.95),
               (tx + side * 0.26, box[3] - stroke)], fill=(*color, 255))
    d.line([(tx + stroke * 0.6, box[3]), (tx + side * 0.245, box[3])],
           fill=(0, 0, 0, 0), width=stroke + 2)
    return canvas.resize((int(size), int(size)), Image.LANCZOS)


def equalizer(draw: ImageDraw.ImageDraw, cx: float, top: float, width: float,
              bars: int, max_h: float, seed: int = 3):
    """Rounded audio bars with a musical envelope — the poster's signature mark."""
    rnd = random.Random(seed)
    gap = width / (bars * 1.85)
    bar_w = gap * 0.92
    total = bars * bar_w + (bars - 1) * gap
    x = cx - total / 2
    for i in range(bars):
        t = i / (bars - 1)
        envelope = 0.30 + 0.70 * (math.sin(math.pi * t) ** 0.7)
        height = max_h * envelope * rnd.uniform(0.8, 1.0)
        mix = t ** 0.8
        color = tuple(int(ORANGE_HOT[k] + (ORANGE[k] - ORANGE_HOT[k]) * mix) for k in range(3))
        draw.rounded_rectangle([x, top + (max_h - height), x + bar_w, top + max_h],
                               radius=bar_w / 2, fill=color)
        x += bar_w + gap


# ---------------------------------------------------------------------- pieces
def background(brief: dict) -> Image.Image:
    canvas = Image.new("RGBA", (W, H), (*DEEP, 255))

    plate = cover(Image.open(ASSETS / brief["plate"]).convert("RGB"), (W, H))
    plate = plate.transpose(Image.FLIP_LEFT_RIGHT)   # move the light shaft off the text axis
    plate = ImageEnhance.Color(plate).enhance(1.15)
    plate = ImageEnhance.Contrast(plate).enhance(1.05)
    plate = plate.convert("RGBA")
    canvas.alpha_composite(plate)

    # cold night wash from above, warmth off the horizon, and the two legibility
    # scrims — all continuous gradients so no band edge lands on the artwork
    canvas.alpha_composite(vertical_gradient((W, H), [
        (0.0, (*VIOLET, 46)), (0.30, (*VIOLET, 26)), (0.62, (*VIOLET, 0)), (1.0, (0, 0, 0, 0))]))
    horizon = 0.56
    canvas.alpha_composite(vertical_gradient((W, H), [
        (0.0, (0, 0, 0, 0)), (horizon, (0, 0, 0, 0)), (horizon + 0.10, (255, 148, 44, 26)),
        (0.86, (255, 120, 30, 18)), (1.0, (0, 0, 0, 0))]))
    canvas.alpha_composite(vertical_gradient((W, H), [
        (0.0, (3, 4, 7, 232)), (0.10, (3, 4, 7, 150)), (0.19, (3, 4, 7, 0)),
        (0.55, (3, 4, 7, 0)), (0.74, (3, 4, 7, 120)), (0.88, (3, 4, 7, 205)), (1.0, (3, 4, 7, 226))]))
    canvas.alpha_composite(vignette((W, H), 0.78))
    return canvas


def hud(canvas: Image.Image):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    inset = 40
    d.rectangle([inset, inset, W - inset, H - inset], outline=(255, 255, 255, 18), width=1)
    arm = 44
    for (x, y, dx, dy) in [(inset, inset, 1, 1), (W - inset, inset, -1, 1),
                           (inset, H - inset, 1, -1), (W - inset, H - inset, -1, -1)]:
        d.line([(x, y), (x + arm * dx, y)], fill=(*ORANGE, 165), width=3)
        d.line([(x, y), (x, y + arm * dy)], fill=(*ORANGE, 165), width=3)
    canvas.alpha_composite(layer)


def header(canvas: Image.Image, brief: dict):
    badge = Image.open(ASSETS / brief["badge"]).convert("RGBA").resize((124, 124), Image.LANCZOS)
    ring = Image.new("RGBA", (156, 156), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([6, 6, 149, 149], outline=(*ORANGE, 200), width=3)
    canvas.alpha_composite(soft_glow(ring, ORANGE, 26, 0.55), (48, 168))
    canvas.alpha_composite(badge, (64, 184))
    canvas.alpha_composite(ring, (48, 168))

    label = brief["capsule"]
    face = Face(F_TECH, 22)
    text_w = face.measure(label, letter_spacing=3.6)
    cap_h = 60
    cap_w = text_w + 112
    cap_x = W - 76 - cap_w
    cap_y = 216

    capsule = Image.new("RGBA", (int(cap_w), cap_h), (0, 0, 0, 0))
    capsule.paste(Image.new("RGBA", capsule.size, (8, 9, 12, 175)), (0, 0), rrect(capsule.size, cap_h // 2))
    cd = ImageDraw.Draw(capsule)
    cd.rounded_rectangle([1, 1, cap_w - 2, cap_h - 2], radius=cap_h // 2, outline=(*CREAM, 90), width=2)
    padlock(cd, 26, cap_h / 2, 26, (*CREAM, 225))
    canvas.alpha_composite(capsule, (int(cap_x), cap_y))
    draw_text(canvas, face, label, (cap_x + 68, cap_y + cap_h / 2 + 1), anchor="ls",
              fill=(250, 238, 218), letter_spacing=3.6)


def eyebrow(canvas: Image.Image, brief: dict, baseline: float):
    text = brief["eyebrow"]
    face = Face(F_FA_BOLD, 35)
    draw_text(canvas, face, text, (W / 2, baseline), anchor="cs", fill=(255, 230, 200), alpha=0.96)
    width = face.measure(text)
    for side in (-1, 1):
        start = W / 2 + side * (width / 2 + 40)
        end = start + side * 84
        draw = ImageDraw.Draw(canvas)
        draw.line([(start, baseline - 13), (end, baseline - 13)], fill=(*ORANGE, 110), width=2)
        draw.regular_polygon((end + side * 7, baseline - 13, 4), n_sides=4, rotation=45,
                             fill=(*ORANGE, 210))


def wordmark(canvas: Image.Image, brief: dict, baseline: float):
    word = brief["wordmark"]
    spacing = 4
    face = fit_face(F_WORD, word, W - 200, 212, letter_spacing=spacing)
    width = face.measure(word, letter_spacing=spacing)

    # halo: an ellipse of light behind the mark, plus a thin "orbit" arc
    halo = Image.new("L", (W, H), 0)
    ImageDraw.Draw(halo).ellipse([W / 2 - width * 0.66, baseline - 235, W / 2 + width * 0.66, baseline + 150],
                                 fill=90)
    halo = halo.filter(ImageFilter.GaussianBlur(110))
    canvas.alpha_composite(Image.merge("RGBA", (
        Image.new("L", (W, H), 96), Image.new("L", (W, H), 66), Image.new("L", (W, H), 150),
        halo.point(lambda v: int(v * 0.6)))))
    canvas.alpha_composite(Image.merge("RGBA", (
        Image.new("L", (W, H), 243), Image.new("L", (W, H), 138), Image.new("L", (W, H), 40),
        halo.point(lambda v: int(v * 0.5)))))

    # chromatic split, then the crisp white face
    draw_text(canvas, face, word, (W / 2 - 4, baseline), anchor="cs", fill=(255, 70, 92),
              letter_spacing=spacing, alpha=0.32)
    draw_text(canvas, face, word, (W / 2 + 4, baseline), anchor="cs", fill=(86, 214, 255),
              letter_spacing=spacing, alpha=0.28)
    draw_text(canvas, face, word, (W / 2, baseline), anchor="cs", fill=WHITE,
              letter_spacing=spacing, glow=30, glow_color=(255, 198, 122), glow_alpha=0.42,
              shadow=(0, 12), shadow_blur=28, shadow_alpha=0.5)


def handle_lockup(canvas: Image.Image, baseline: float):
    """'VIKING × ALIENS · @DJ.ALIENS', centred, with the DJ handle in orange."""
    face = Face(F_TECH, 22)
    left, right = "VIKING × ALIENS", "@DJ.ALIENS"
    ls, gap = 6.5, 26
    w1 = face.measure(left, letter_spacing=ls)
    w2 = face.measure(right, letter_spacing=4.5)
    total = w1 + gap * 2 + 12 + w2
    start = W / 2 - total / 2
    draw_text(canvas, face, left, (start, baseline), anchor="ls", fill=(255, 234, 208),
              letter_spacing=ls, alpha=0.95)
    dot = ImageDraw.Draw(canvas)
    cx = start + w1 + gap + 6
    dot.ellipse([cx - 5, baseline - 12, cx + 5, baseline - 2], fill=(*CREAM, 190))
    draw_text(canvas, face, right, (start + w1 + gap * 2 + 12, baseline), anchor="ls",
              fill=ORANGE, letter_spacing=4.5, alpha=0.95)


def headline(canvas: Image.Image, brief: dict):
    fa_line, latin_line = brief["headline"]

    haze = Image.new("L", (W, H), 0)
    ImageDraw.Draw(haze).ellipse([80, 860, W - 80, 1240], fill=115)
    haze = haze.filter(ImageFilter.GaussianBlur(90))
    canvas.alpha_composite(Image.merge("RGBA", (
        Image.new("L", (W, H), 255), Image.new("L", (W, H), 138), Image.new("L", (W, H), 38),
        haze.point(lambda v: int(v * 0.17)))))

    f1 = fit_face(F_FA_DISPLAY, fa_line, W - 170, 104)
    draw_text(canvas, f1, fa_line, (W / 2, 986), anchor="cs", fill=ORANGE_HOT,
              glow=30, glow_color=ORANGE, glow_alpha=0.5,
              shadow=(0, 9), shadow_blur=24, shadow_alpha=0.6)

    f2 = fit_face(F_TECH_B, latin_line, W - 240, 86, letter_spacing=3)
    draw_text(canvas, f2, latin_line, (W / 2, 1104), anchor="cs", fill=WHITE, letter_spacing=3,
              glow=24, glow_color=(255, 168, 88), glow_alpha=0.4,
              shadow=(0, 8), shadow_blur=22, shadow_alpha=0.55)


def body(canvas: Image.Image, brief: dict):
    """Two-line supporting copy, auto-fitted so a long line never clips the frame."""
    colors = {"R": (239, 232, 225), "L": ORANGE_HOT, "N": ORANGE_HOT}
    max_width = W - 132
    size = 40
    while size > 24:
        face = Face(F_FA_BOLD, size)
        if all(rich_width(face, line) <= max_width for line in brief["body"]):
            break
        size -= 1
    face = Face(F_FA_BOLD, size)
    leading = size * 1.62
    for i, line in enumerate(brief["body"]):
        draw_rich_text(canvas, face, line, (W / 2, 1196 + i * leading), colors=colors,
                       anchor="cs", shadow=(0, 4), shadow_blur=14, shadow_alpha=0.65)


def meta_card(canvas: Image.Image, brief: dict, top: float, height: float):
    card_w = W - 128
    left = (W - card_w) / 2
    card = Image.new("RGBA", (int(card_w), int(height)), (0, 0, 0, 0))
    mask = rrect(card.size, 26)
    card.paste(Image.new("RGBA", card.size, (11, 11, 14, 212)), (0, 0), mask)

    border = Image.new("RGBA", card.size, (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle([1, 1, card_w - 2, height - 2], radius=26,
                                             outline=(*ORANGE, 92), width=2)
    card.alpha_composite(border)

    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle([0, 24, 7, height - 24], radius=4, fill=(*ORANGE, 235))

    tag_r = 44
    tag_cx, tag_cy = card_w - 92, height / 2
    draw.ellipse([tag_cx - tag_r, tag_cy - tag_r, tag_cx + tag_r, tag_cy + tag_r],
                 outline=(*CREAM, 100), width=2)
    draw_text(card, Face(F_TECH_B, 29), "4:20", (tag_cx, tag_cy - 9), anchor="cs", fill=CREAM)
    draw_text(card, Face(F_TECH, 11), "PM", (tag_cx, tag_cy + 22), anchor="cs",
              fill=(*CREAM, 200), letter_spacing=2)

    right = card_w - 170
    draw_text(card, Face(F_FA_BLACK, 39), brief["card"]["title"], (right, height / 2 - 28),
              anchor="rs", fill=WHITE, shadow=(0, 3), shadow_blur=8, shadow_alpha=0.5)
    draw_text(card, Face(F_FA_MED, 26), brief["card"]["subtitle"], (right, height / 2 + 34),
              anchor="rs", fill=(214, 205, 195))

    canvas.alpha_composite(card, (int(left), int(top)))


def cta(canvas: Image.Image, label: str, top: float, height: float):
    width = W - 128
    left = int((W - width) / 2)

    button = Image.new("RGBA", (width, int(height)), (0, 0, 0, 0))
    mask = rrect(button.size, 30)
    grad = Image.new("RGBA", button.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for row in range(int(height)):
        t = row / (height - 1)
        gd.line([(0, row), (width, row)],
                fill=(int(255 - 38 * t), int(179 - 48 * t), int(74 - 44 * t), 255))
    button.paste(grad, (0, 0), mask)

    gloss = Image.new("L", button.size, 0)
    ImageDraw.Draw(gloss).rounded_rectangle([4, 4, width - 5, height * 0.52], radius=26, fill=48)
    gloss = gloss.filter(ImageFilter.GaussianBlur(9))
    button.alpha_composite(Image.merge("RGBA", (
        Image.new("L", button.size, 255), Image.new("L", button.size, 255),
        Image.new("L", button.size, 255), gloss)))

    canvas.alpha_composite(soft_glow(mask, ORANGE, 40, 0.5), (left, int(top + 8)))
    canvas.alpha_composite(button, (left, int(top)))

    face = Face(F_FA_BLACK, 43)
    text_w = face.measure(label)
    centre = W / 2
    draw_text(canvas, face, label, (centre + 34, top + height / 2 + 1), anchor="cs",
              fill=(16, 16, 16))
    icon = chat_icon(52, (18, 18, 18))
    canvas.alpha_composite(icon, (int(centre - text_w / 2 - 70), int(top + height / 2 - 27)))


def footer(canvas: Image.Image, total: str):
    draw_text(canvas, Face(F_TECH, 18), total, (W / 2, 1756), anchor="cs",
              fill=(*CREAM, 255), alpha=0.4, letter_spacing=6)


# ---------------------------------------------------------------------- render
def build(brief: dict) -> Image.Image:
    """1080x1920 Story frame."""
    canvas = background(brief)
    hud(canvas)
    header(canvas, brief)
    eyebrow(canvas, brief, baseline=372)
    wordmark(canvas, brief, baseline=600)
    equalizer(ImageDraw.Draw(canvas), W / 2, 672, 520, 25, 86)
    handle_lockup(canvas, 826)
    headline(canvas, brief)
    carbon = Image.new("L", (W, H), 0)
    ImageDraw.Draw(carbon).ellipse([30, 1120, W - 30, 1310], fill=120)
    carbon = carbon.filter(ImageFilter.GaussianBlur(70))
    canvas.alpha_composite(Image.merge("RGBA", (
        Image.new("L", (W, H), 4), Image.new("L", (W, H), 5), Image.new("L", (W, H), 8),
        carbon.point(lambda v: int(v * 0.55)))))
    body(canvas, brief)
    meta_card(canvas, brief, top=1318, height=168)
    cta(canvas, brief["cta"], top=1558, height=124)
    footer(canvas, "@DJ.ALIENS × @VIKING.OFFROAD")

    canvas.alpha_composite(grain((W, H)))
    bloom = canvas.filter(ImageFilter.GaussianBlur(16))
    canvas = Image.blend(canvas, Image.composite(bloom, canvas, Image.new("L", (W, H), 52)), 0.18)
    return canvas.convert("RGB")


def build_post(brief: dict) -> Image.Image:
    """1080x1350 feed frame: the same night, cut for the grid."""
    global H
    story_height = H
    H = POST_H
    try:
        canvas = background(brief)
        hud(canvas)
        header(canvas, brief)

        # wordmark rides higher and smaller on the feed crop
        word = brief["wordmark"]
        face = fit_face(F_WORD, word, W - 210, 168, letter_spacing=4)
        draw_text(canvas, face, word, (W / 2, 500), anchor="cs", fill=WHITE,
                  letter_spacing=4, glow=28, glow_color=(255, 198, 122), glow_alpha=0.42,
                  shadow=(0, 10), shadow_blur=24, shadow_alpha=0.5)
        eyebrow(canvas, brief, baseline=368)
        equalizer(ImageDraw.Draw(canvas), W / 2, 548, 470, 23, 74)
        handle_lockup(canvas, 682)

        f1 = fit_face(F_FA_DISPLAY, brief["headline"][0], W - 170, 92)
        draw_text(canvas, f1, brief["headline"][0], (W / 2, 776), anchor="cs", fill=ORANGE_HOT,
                  glow=28, glow_color=ORANGE, glow_alpha=0.5,
                  shadow=(0, 8), shadow_blur=22, shadow_alpha=0.6)
        f2 = fit_face(F_TECH_B, brief["headline"][1], W - 240, 74, letter_spacing=3)
        draw_text(canvas, f2, brief["headline"][1], (W / 2, 878), anchor="cs", fill=WHITE,
                  letter_spacing=3, glow=22, glow_color=(255, 168, 88), glow_alpha=0.35,
                  shadow=(0, 8), shadow_blur=20, shadow_alpha=0.55)

        meta_card(canvas, brief, top=980, height=158)
        cta(canvas, brief["cta"], top=1182, height=118)

        canvas.alpha_composite(grain((W, H)))
        bloom = canvas.filter(ImageFilter.GaussianBlur(16))
        canvas = Image.blend(canvas, Image.composite(bloom, canvas, Image.new("L", (W, H), 52)), 0.18)
        return canvas.convert("RGB")
    finally:
        H = story_height


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(HERE / "deliverables"))
    parser.add_argument("--format", choices=["story", "post", "both"], default="both")
    args = parser.parse_args()

    brief = json.loads((HERE / "brief.json").read_text(encoding="utf-8"))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    jobs = []
    if args.format in ("story", "both"):
        jobs.append(("story", "dj-aliens-halloween-story.png", build))
    if args.format in ("post", "both"):
        jobs.append(("post", "dj-aliens-halloween-post.png", build_post))

    for kind, name, builder in jobs:
        image = builder(brief)
        target = out_dir / name
        image.save(target, "PNG", optimize=True)
        print(f"rendered {kind} → {target} ({image.width}x{image.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
