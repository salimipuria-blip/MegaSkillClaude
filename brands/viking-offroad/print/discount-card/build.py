"""Build print-ready files for the Viking Offroad 10% discount card.

Spec: finished 60 x 60 mm, 3 mm bleed (66 x 66 mm), 8 mm corner radius,
600 ppi, CMYK ISO Coated v2 (FOGRA39), die line as spot colour "CutContour".

Usage (from repo root):  python3 brands/viking-offroad/print/discount-card/build.py
Requires: pillow, numpy, opencv-python-headless, reportlab, pikepdf, pymupdf
"""
from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path

import cv2
import numpy as np
import pikepdf
from PIL import Image, ImageCms
from reportlab.lib.colors import CMYKColorSep, CMYKColor
from reportlab.lib.units import mm
from reportlab import rl_config
from reportlab.pdfgen import canvas

rl_config.useA85 = 0

HERE = Path(__file__).resolve().parent
SRC = HERE / "source"
OUT = HERE / "output"
ICC = HERE / "icc" / "ISOcoated_v2_eci.icc"

TRIM_MM = 60.0
BLEED_MM = 3.0
RADIUS_MM = 8.0  # source art corner is ~7.2 mm; 8 mm keeps the cut inside the original art
PPI = 600
MARK_MARGIN_MM = 10.0  # extra paper around bleed for crop marks on the proof sheet

px = lambda m: int(round(m / 25.4 * PPI))
TRIM_PX = px(TRIM_MM)          # 1417
BLEED_PX = px(BLEED_MM)        # 71
FULL_PX = TRIM_PX + 2 * BLEED_PX

SIDES = {"front": "front-rgb.jpg", "back": "back-rgb.jpg"}


def card_bounds(rgb: np.ndarray) -> tuple[int, int, int, int]:
    """Find the card rectangle inside the white canvas along the centre lines."""
    nonwhite = rgb.min(axis=2) < 200
    h, w = nonwhite.shape
    row, col = nonwhite[h // 2], nonwhite[:, w // 2]
    left, right = int(row.argmax()), int(w - row[::-1].argmax())
    top, bottom = int(col.argmax()), int(h - col[::-1].argmax())
    inset = 2  # drop the anti-aliased edge pixels
    return left + inset, top + inset, right - inset, bottom - inset


def fill_corners(rgb: np.ndarray) -> np.ndarray:
    """Inpaint the white areas outside the rounded corners so nothing white can print."""
    h, w = rgb.shape[:2]
    r = int(0.14 * w)  # generous: covers the source's ~12% radius plus anti-aliasing
    mask = np.zeros((h, w), np.uint8)
    nearwhite = (rgb.min(axis=2) > 170).astype(np.uint8)
    for cy, cx in ((0, 0), (0, w - r), (h - r, 0), (h - r, w - r)):
        mask[cy:cy + r, cx:cx + r] = nearwhite[cy:cy + r, cx:cx + r]
    # only touch pixels connected to the corner, never white artwork inside the card
    n, lab = cv2.connectedComponents(mask)
    keep = np.zeros_like(mask)
    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if lab[y, x]:
            keep[lab == lab[y, x]] = 1
    keep = cv2.dilate(keep, np.ones((5, 5), np.uint8))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    out = cv2.inpaint(bgr, keep * 255, 9, cv2.INPAINT_TELEA)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def build_side(name: str) -> tuple[Image.Image, Image.Image]:
    rgb = np.asarray(Image.open(SRC / SIDES[name]).convert("RGB"))
    l, t, r, b = card_bounds(rgb)
    card = fill_corners(rgb[t:b, l:r].copy())
    card = cv2.resize(card, (TRIM_PX, TRIM_PX), interpolation=cv2.INTER_LANCZOS4)
    full = cv2.copyMakeBorder(card, BLEED_PX, BLEED_PX, BLEED_PX, BLEED_PX, cv2.BORDER_REFLECT_101)
    rgb_img = Image.fromarray(full)
    srgb = ImageCms.createProfile("sRGB")
    cmyk_prof = ImageCms.getOpenProfile(str(ICC))
    xf = ImageCms.buildTransform(srgb, cmyk_prof, "RGB", "CMYK",
                                 renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                 flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
    cmyk = ImageCms.applyTransform(rgb_img, xf)
    return rgb_img, cmyk


def rounded_rect_path(c: canvas.Canvas, x: float, y: float, s: float, r: float):
    p = c.beginPath()
    p.roundRect(x, y, s, s, r)
    return p


def write_pdf(path: Path, images: dict[str, Path], with_marks: bool, with_art: bool = True):
    margin = MARK_MARGIN_MM * mm if with_marks else 0
    page = (TRIM_MM + 2 * BLEED_MM) * mm + 2 * margin
    c = canvas.Canvas(str(path), pagesize=(page, page), pageCompression=1)
    c.setTitle("Viking Offroad - 10% discount card - print")
    c.setAuthor("Viking Offroad")
    c.setSubject("60x60 mm, 3 mm bleed, R8 mm die, CMYK FOGRA39")
    cut = CMYKColorSep(0, 1, 0, 0, spotName="CutContour", density=1)
    trim_x = margin + BLEED_MM * mm
    for side in ("front", "back"):
        if with_art:
            c.drawImage(str(images[side]), margin, margin,
                        width=(TRIM_MM + 2 * BLEED_MM) * mm, height=(TRIM_MM + 2 * BLEED_MM) * mm)
        if with_marks:
            # die line (spot colour, overprint) — not to be printed
            c.setStrokeColor(cut)
            c.setStrokeOverprint(True)
            c.setLineWidth(0.25)
            c.drawPath(rounded_rect_path(c, trim_x, trim_x, TRIM_MM * mm, RADIUS_MM * mm), stroke=1, fill=0)
            # crop marks in registration-safe 4-colour black, outside the bleed
            c.setStrokeOverprint(False)
            c.setStrokeColor(CMYKColor(1, 1, 1, 1))
            c.setLineWidth(0.25)
            a, b = trim_x, trim_x + TRIM_MM * mm
            gap, ln = BLEED_MM * mm + 1 * mm, 6 * mm
            for v in (a, b):
                c.line(v, a - gap, v, a - gap - ln)
                c.line(v, b + gap, v, b + gap + ln)
                c.line(a - gap, v, a - gap - ln, v)
                c.line(b + gap, v, b + gap + ln, v)
            c.setFillColor(CMYKColor(0, 0, 0, 1))
            c.setFont("Helvetica", 4.5)
            label = f"VIKING 10% | {side.upper()} | trim 60x60 mm | bleed 3 mm | die R8 mm (CutContour) | CMYK FOGRA39"
            c.drawString(margin, 0.8 * mm, label)
        c.showPage()
    c.save()
    set_boxes(path, margin)


def set_boxes(path: Path, margin: float):
    with pikepdf.open(path, allow_overwriting_input=True) as pdf:
        for pg in pdf.pages:
            full = (TRIM_MM + 2 * BLEED_MM) * mm
            b0, b1 = margin, margin + full
            t0, t1 = margin + BLEED_MM * mm, margin + BLEED_MM * mm + TRIM_MM * mm
            pg.obj.BleedBox = pikepdf.Array([b0, b0, b1, b1])
            pg.obj.TrimBox = pikepdf.Array([t0, t0, t1, t1])
        icc = pikepdf.Stream(pdf, ICC.read_bytes())
        icc.N = 4
        pdf.Root.OutputIntents = pikepdf.Array([pikepdf.Dictionary(
            Type=pikepdf.Name.OutputIntent, S=pikepdf.Name.GTS_PDFX,
            OutputConditionIdentifier="FOGRA39", RegistryName="http://www.color.org",
            Info="ISO Coated v2 (ECI)", DestOutputProfile=icc)])
        pdf.save(path)


def main():
    OUT.mkdir(exist_ok=True)
    tmp = OUT / "_tmp"
    tmp.mkdir(exist_ok=True)
    jpgs = {}
    for side in SIDES:
        rgb_img, cmyk = build_side(side)
        icc_bytes = ICC.read_bytes()
        cmyk.save(OUT / f"viking-card-{side}-66x66mm-CMYK-600ppi.tif", compression="tiff_lzw",
                  dpi=(PPI, PPI), icc_profile=icc_bytes)
        jp = OUT / f"viking-card-{side}-66x66mm-CMYK-600ppi.jpg"
        cmyk.save(jp, quality=100, subsampling=0, dpi=(PPI, PPI), icc_profile=icc_bytes)
        jpgs[side] = jp
        rgb_img.save(tmp / f"{side}-rgb-preview.png")
    write_pdf(OUT / "viking-card-PRINT-66x66mm-bleed.pdf", jpgs, with_marks=False)
    write_pdf(OUT / "viking-card-PROOF-cropmarks-dieline.pdf", jpgs, with_marks=True)
    write_pdf(OUT / "viking-card-DIELINE-only.pdf", jpgs, with_marks=True, with_art=False)
    shutil.copy(HERE / "PRINT-SPEC-FA.txt", OUT / "PRINT-SPEC-FA.txt")
    with zipfile.ZipFile(OUT / "viking-card-print-package.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.iterdir()):
            if f.is_file() and f.suffix != ".zip":
                z.write(f, f.name)
    print("built:", *sorted(p.name for p in OUT.iterdir()), sep="\n  ")


if __name__ == "__main__":
    main()
