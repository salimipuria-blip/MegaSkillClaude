#!/usr/bin/env python3
"""Post cover (1080x1350): owner's photo + ONLY the requested text, nothing else.

Usage:
  python3 brand/viking/render_post_cover.py [photo.jpg]
Default photo: brand/viking/assets/cover-photo.jpg
Env FOCAL_Y (0..1): vertical position of the 4:5 crop window (default 0.45).

Output: brand/viking/post-cover.png (committed) + out/post-cover.png
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import arabic_reshaper
from bidi.algorithm import get_display

HERE = Path(__file__).resolve().parent
W, H = 1080, 1350
ORANGE = (243, 154, 43)

VAZIR_X = HERE / "assets" / "Vazirmatn-Black.woff2"


def fa(text):
    return get_display(arabic_reshaper.reshape(text))


def fit(text, max_width, start):
    shaped = fa(text)
    size = start
    while size > 24:
        f = ImageFont.truetype(str(VAZIR_X), size)
        bb = f.getbbox(shaped)
        if bb[2] - bb[0] <= max_width:
            return f
        size -= 4
    return ImageFont.truetype(str(VAZIR_X), 24)


def scrim_mask():
    stops = [(0.00, 0), (0.45, 0), (0.62, 120), (0.80, 210), (1.00, 245)]
    g = Image.new("L", (1, H))
    px = g.load()
    for row in range(H):
        t = row / (H - 1)
        a = 245
        for (t0, a0), (t1, a1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                a = int(a0 + (a1 - a0) * k)
                break
        px[0, row] = a
    return g.resize((W, H))


def draw_center(img, cx, y_top, text, font, fill, shadow=True, glow=None):
    shaped = fa(text)
    w = font.getlength(shaped)
    asc, desc = font.getmetrics()
    x = cx - w / 2
    if glow:
        g = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).text((x, y_top), shaped, font=font, fill=glow + (255,))
        img = Image.alpha_composite(img, g.filter(ImageFilter.GaussianBlur(26)))
    if shadow:
        s = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(s).text((x, y_top + 7), shaped, font=font, fill=(0, 0, 0, 235))
        img = Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(6)))
    ImageDraw.Draw(img).text((x, y_top), shaped, font=font, fill=fill + (255,))
    return img, y_top + asc + desc


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "assets" / "cover-photo.jpg"
    if not src.exists():
        print(f"photo not found: {src}")
        print("Put the owner's photo at brand/viking/assets/cover-photo.jpg and re-run.")
        sys.exit(1)
    focal = float(os.environ.get("FOCAL_Y", "0.45"))

    photo = Image.open(src).convert("RGB")
    s = max(W / photo.width, H / photo.height)
    rs = photo.resize((round(photo.width * s), round(photo.height * s)), Image.LANCZOS)
    left = (rs.width - W) // 2
    top = int((rs.height - H) * min(max(focal, 0.0), 1.0)) if rs.height > H else 0
    bg = rs.crop((left, top, left + W, top + H))
    bg = ImageEnhance.Color(bg).enhance(1.15)
    bg = ImageEnhance.Contrast(bg).enhance(1.05)
    img = bg.convert("RGBA")

    black = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    black.putalpha(scrim_mask())
    img = Image.alpha_composite(img, black)

    # ONLY the requested text: «لطفا با هماهنگی قبلی تشریف بیارین»
    f1 = fit("لطفا با هماهنگی قبلی", 920, 100)
    f2 = fit("تشریف بیارین", 920, 165)
    a1, d1 = f1.getmetrics()
    a2, d2 = f2.getmetrics()
    block = (a1 + d1) + 12 + (a2 + d2)
    y = H - 110 - block
    img, y = draw_center(img, W // 2, y, "لطفا با هماهنگی قبلی", f1, (255, 255, 255))
    img, _ = draw_center(img, W // 2, y + 12, "تشریف بیارین", f2, ORANGE, glow=ORANGE)

    final = HERE / "post-cover.png"
    out = HERE / "out" / "post-cover.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    rgb.save(final, quality=92)
    rgb.save(out, quality=92)
    print(f"rendered → {final}")


if __name__ == "__main__":
    main()
