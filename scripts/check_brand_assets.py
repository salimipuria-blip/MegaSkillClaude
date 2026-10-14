#!/usr/bin/env python3
"""Dependency-free structural checks for Viking sticker and content assets."""
from __future__ import annotations

import argparse
import re
import struct
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
STICKERS = ROOT / "brands/viking-offroad/stickers"
CONTENT = ROOT / "brand/viking"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PACK_PATTERN = re.compile(r"^pack-(\d{2})-([a-z0-9-]+)$")
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)
HTML_SRC = re.compile(r"\bsrc\s*=\s*(['\"])(.*?)\1", re.IGNORECASE)


class AssetCheckError(Exception):
    """Raised when a committed visual asset violates its documented contract."""


def png_info(path: Path) -> tuple[int, int, int]:
    try:
        with path.open("rb") as source:
            header = source.read(29)
    except OSError as error:
        raise AssetCheckError(f"cannot read {path.relative_to(ROOT)}: {error}") from error
    if len(header) < 29 or header[:8] != PNG_SIGNATURE:
        raise AssetCheckError(f"not a valid PNG header: {path.relative_to(ROOT)}")
    chunk_length = struct.unpack(">I", header[8:12])[0]
    if chunk_length != 13 or header[12:16] != b"IHDR":
        raise AssetCheckError(f"missing PNG IHDR: {path.relative_to(ROOT)}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height, header[25]  # PNG color type: 6 = RGBA.


def require_file(path: Path) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise AssetCheckError(f"missing or empty file: {path.relative_to(ROOT)}")


def check_stickers() -> tuple[int, int]:
    packs_dir = STICKERS / "packs"
    if not packs_dir.is_dir():
        raise AssetCheckError("missing brands/viking-offroad/stickers/packs/")

    packs = sorted(path for path in packs_dir.iterdir() if path.is_dir() and path.name.startswith("pack-"))
    if len(packs) != 12:
        raise AssetCheckError(f"expected 12 numbered sticker packs, found {len(packs)}")

    sticker_count = 0
    for expected_number, pack in enumerate(packs, start=1):
        match = PACK_PATTERN.fullmatch(pack.name)
        if not match or int(match.group(1)) != expected_number:
            raise AssetCheckError(f"pack names must be sequential pack-01..pack-12: {pack.name}")

        expected_files = {f"{number:02d}.png" for number in range(1, 31)}
        actual_files = {path.name for path in pack.glob("*.png")}
        if actual_files != expected_files:
            missing = sorted(expected_files - actual_files)
            extra = sorted(actual_files - expected_files)
            details = []
            if missing:
                details.append("missing=" + ",".join(missing[:5]))
            if extra:
                details.append("unexpected=" + ",".join(extra[:5]))
            raise AssetCheckError(f"{pack.name} must contain exactly 30 numbered PNGs ({'; '.join(details)})")

        for image_name in sorted(expected_files):
            path = pack / image_name
            width, height, color_type = png_info(path)
            if (width, height, color_type) != (512, 512, 6):
                raise AssetCheckError(
                    f"{path.relative_to(ROOT)} must be 512x512 RGBA; got {width}x{height}, color type {color_type}"
                )
        sticker_count += len(expected_files)

        preview = packs_dir / f"preview-{match.group(1)}-{match.group(2)}.png"
        require_file(preview)
        png_info(preview)

    cover = STICKERS / "cover/viking-cover-sticker.png"
    require_file(cover)
    png_info(cover)
    return len(packs), sticker_count


def local_references(template: Path) -> set[Path]:
    text = template.read_text(encoding="utf-8")
    references = {match.group(2).strip() for match in CSS_URL.finditer(text)}
    references.update(match.group(2).strip() for match in HTML_SRC.finditer(text))
    resolved: set[Path] = set()

    for reference in references:
        parsed = urlsplit(reference)
        if parsed.scheme or parsed.netloc or reference.startswith(("#", "data:")):
            continue
        relative = unquote(parsed.path)
        target = (template.parent / relative).resolve()
        if not target.is_relative_to(template.parent.resolve()):
            raise AssetCheckError(f"local asset path escapes template directory: {template.name}: {reference}")
        require_file(target)
        resolved.add(target)
    return resolved


def check_content_templates() -> int:
    for name in ("README.md", "render.mjs", "post.html", "story.html"):
        require_file(CONTENT / name)
    references: set[Path] = set()
    for name in ("post.html", "story.html"):
        references.update(local_references(CONTENT / name))
    return len(references)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--stickers", action="store_true", help="check only the sticker-pack project")
    scope.add_argument("--templates", action="store_true", help="check only brand/viking content templates")
    args = parser.parse_args()
    check_both = not (args.stickers or args.templates)

    try:
        if check_both or args.stickers:
            pack_count, sticker_count = check_stickers()
            print(f"stickers: {pack_count} packs × 30 valid 512×512 RGBA PNGs ({sticker_count}); 12 previews + cover verified")
        if check_both or args.templates:
            reference_count = check_content_templates()
            print(f"brand/viking: post/story templates and {reference_count} local image/font references verified")
    except (AssetCheckError, OSError) as error:
        print(f"brand asset check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
