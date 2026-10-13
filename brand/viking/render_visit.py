#!/usr/bin/env python3
"""Render Viking 'visit by appointment' story (1080x1920) with PIL.

Fallback renderer when Playwright/Chromium is unavailable.
Background: assets/visit-bg.jpg (AI scene inspired by the owner's reference photo).
Output: out/story-visit.png

Note: this environment's PIL has no RAQM/complex-text shaping, and Lalezar
lacks Arabic presentation forms, so this renderer uses Vazirmatn (Black/Bold)
for ALL text with arabic_reshaper + python-bidi. The HTML twin
(story-visit.html) keeps Lalezar for proper browser rendering via render.mjs.

Usage: python3 brand/viking/render_visit.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import arabic_reshaper
from bidi.algorithm import get_display

HERE = Path(__file__).resolve().parent
W, H = 1080, 1920
ORANGE = (243, 154, 43)
INK = (20, 20, 20)
MUTED = (216, 207, 194)

VAZIR_B = HERE / "assets" / "Vazirmatn-Bold.woff2"
VAZIR_X = HERE / "assets" / "Vazirmatn-Black.woff2"
HEAD = VAZIR_X  # headlines + tapes (Lalezar can't shape under PIL without RAQM)


def fa(text):
    return get_display(arabic_reshaper.reshape(text))


def load(size, path=HEAD):
    return ImageFont.truetype(str(path), size)


def fit(path, text, max_width, start):
    shaped = fa(text)
    size = start
    while size > 24:
        f = ImageFont.truetype(str(path), size)
        bb = f.getbbox(shaped)
        if bb[2] - bb[0] <= max_width:
            return f
        size -= 4
    return ImageFont.truetype(str(path), 24)


def vgradient_mask():
    stops = [(0.00, 140), (0.18, 0), (0.40, 0), (0.55, 153), (0.70, 237), (1.00, 255)]
    g = Image.new("L", (1, H))
    px = g.load()
    for row in range(H):
        t = row / (H - 1)
        a = 255
        for (t0, a0), (t1, a1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                a = int(a0 + (a1 - a0) * k)
                break
        px[0, row] = a
    return g.resize((W, H))


def draw_center(img, cx, y_top, text, font, fill, shadow=True, glow=None):
    """Draw centered text; step by full font metrics so lines never overlap."""
    shaped = fa(text)
    w = font.getlength(shaped)
    asc, desc = font.getmetrics()
    x = cx - w / 2
    if glow:
        g = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).text((x, y_top), shaped, font=font, fill=glow + (255,))
        img = Image.alpha_composite(img, g.filter(ImageFilter.GaussianBlur(28)))
    if shadow:
        s = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(s).text((x, y_top + 8), shaped, font=font, fill=(0, 0, 0, 235))
        img = Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(6)))
    ImageDraw.Draw(img).text((x, y_top), shaped, font=font, fill=fill + (255,))
    return img, y_top + asc + desc


def tape(img, text, fill, txt_fill, size, h, center_y, angle):
    strip_w = W + 260
    strip = Image.new("RGBA", (strip_w, h), fill + (255,))
    f = ImageFont.truetype(str(HEAD), size)
    shaped = fa(text)
    d = ImageDraw.Draw(strip)
    bb = d.textbbox((0, 0), shaped, font=f)
    d.text(
        (
            (strip_w - (bb[2] - bb[0])) / 2 - bb[0],
            (h - (bb[3] - bb[1])) / 2 - bb[1],
        ),
        shaped,
        font=f,
        fill=txt_fill + (255,),
    )
    rot = strip.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(rot, ((W - rot.width) // 2, int(center_y - rot.height / 2)), rot)
    return img


def main():
    out = HERE / "out" / "story-visit.png"
    out.parent.mkdir(parents=True, exist_ok=True)

    bg = Image.open(HERE / "assets" / "visit-bg.jpg").convert("RGB")
    s = max(W / bg.width, H / bg.height)
    bg = bg.resize((round(bg.width * s), round(bg.height * s)), Image.LANCZOS)
    x = (bg.width - W) // 2
    y = (bg.height - H) // 2
    bg = bg.crop((x, y, x + W, y + H))
    bg = ImageEnhance.Color(bg).enhance(1.25)
    bg = ImageEnhance.Contrast(bg).enhance(1.08)
    img = bg.convert("RGBA")

    # warm sun glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, R = int(W * 0.62), int(H * 0.30), 450
    for r in range(R, 0, -6):
        a = int(120 * (1 - r / R) ** 1.6)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 170, 60, a))
    img = Image.alpha_composite(img, glow)

    # cinematic shade (dark top + bottom, clear middle)
    black = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    black.putalpha(vgradient_mask())
    img = Image.alpha_composite(img, black)

    # brand tapes
    img = tape(
        img,
        "پایگاه وایکینگ آفرود      پایگاه وایکینگ آفرود",
        ORANGE,
        INK,
        46,
        92,
        142,
        -4,
    )
    img = tape(img, "ممنون از درک و همکاری شما", (255, 255, 255), INK, 40, 80, H - 60, 3)

    # logo (top-right) with shadow
    logo = Image.open(HERE / "assets" / "logo.png").convert("RGBA")
    logo = logo.resize((150, 150), Image.LANCZOS)
    sh = Image.new("RGBA", (150, 150), (0, 0, 0, 255))
    sh.putalpha(logo.split()[3])
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    img.paste(sh, (860, 238), sh)
    img.paste(logo, (860, 230), logo)

    # hook (top area, right-aligned)
    d = ImageDraw.Draw(img)
    fx = load(44, VAZIR_X)
    d.text(
        (830, 245),
        fa("از خانواده بزرگ وایکینگ"),
        font=fx,
        anchor="ra",
        fill=(255, 255, 255, 255),
        stroke_width=2,
        stroke_fill=(0, 0, 0, 200),
    )
    d.text(
        (830, 315),
        fa("یه خواهش کوچیک داریم"),
        font=fx,
        anchor="ra",
        fill=(255, 179, 92, 255),
        stroke_width=2,
        stroke_fill=(0, 0, 0, 200),
    )

    # hero: exact requested sentence
    f1 = fit(VAZIR_X, "لطفا با هماهنگی قبلی", 940, 120)
    img, y = draw_center(img, W // 2, 950, "لطفا با هماهنگی قبلی", f1, (255, 255, 255))
    f2 = fit(VAZIR_X, "تشریف بیارین", 940, 210)
    img, y = draw_center(img, W // 2, y + 14, "تشریف بیارین", f2, ORANGE, glow=ORANGE)
    f3 = load(38, VAZIR_B)
    img, _ = draw_center(img, W // 2, y + 26, "با احترام، تیم وایکینگ آفرود", f3, MUTED)

    img.convert("RGB").save(out, quality=92)
    print("rendered →", out)


if __name__ == "__main__":
    main()
