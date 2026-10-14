#!/usr/bin/env python3
"""محاسبه و در صورت نیاز، مقایسهٔ SHA-256 فایل‌های SKILL.md.

نمونه:
  python3 scripts/verify_skills.py
  python3 scripts/verify_skills.py --registry psk/data/skills-registry.json
  python3 scripts/verify_skills.py --registry path/to/registry.json --strict

فرمت‌های پشتیبانی‌شدهٔ registry:
  - آرایه‌ای از رکوردها
  - شیء دارای کلید skills
  - شیء دارای raw.skills

برای مقایسه، شناسهٔ هش را از sha256، sha، skill_id، id یا hash می‌خواند.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = (
    Path("library/skills"),
    Path("plugins"),
    Path(".claude"),
    Path("psk"),
)
SHA256_RE = re.compile(r"^(?:sha256:)?([0-9a-fA-F]{64})$")


@dataclass(frozen=True)
class RegistryEntry:
    name: str | None
    source_paths: tuple[str, ...]
    digest: str | None


def sha256_of_file(path: Path) -> str:
    """Return a prefixed SHA-256 digest without loading the full file into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def find_skill_files() -> list[Path]:
    """Find SKILL.md files below the configured repository directories."""
    root = ROOT.resolve()
    found: set[Path] = set()
    for relative_base in SCAN_DIRS:
        base = ROOT / relative_base
        if not base.is_dir():
            continue
        for path in base.rglob("SKILL.md"):
            try:
                resolved = path.resolve()
                if resolved.is_file() and resolved.is_relative_to(root):
                    found.add(path)
            except OSError:
                # The caller reports unreadable files while hashing; ignore broken links here.
                continue
    return sorted(found, key=lambda item: item.relative_to(ROOT).as_posix())


def _registry_rows(data: Any) -> list[Any]:
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = data.get("skills")
        if rows is None:
            raw = data.get("raw")
            rows = raw.get("skills") if isinstance(raw, dict) else None
    else:
        rows = None

    if not isinstance(rows, list):
        raise ValueError("registry JSON must be an array or contain a skills array")
    return rows


def _normalise_digest(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    match = SHA256_RE.fullmatch(value.strip())
    if not match:
        return None
    return "sha256:" + match.group(1).lower()


def _normalise_registry_path(value: str) -> str:
    value = value.strip().replace("\\", "/")
    while value.startswith("./"):
        value = value[2:]
    value = str(PurePosixPath(value))
    prefix = "mega-skills-3000/"
    if value.startswith(prefix):
        value = value[len(prefix):]
    return value


def load_registry(path: Path) -> tuple[list[RegistryEntry], dict[str, list[RegistryEntry]], dict[str, list[RegistryEntry]]]:
    """Load supported registry shapes and index entries by source path and skill name."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read registry {path}: {exc}") from exc

    rows = _registry_rows(data)
    if not rows:
        raise ValueError("registry contains no skill entries")

    entries: list[RegistryEntry] = []
    by_path: dict[str, list[RegistryEntry]] = {}
    by_name: dict[str, list[RegistryEntry]] = {}

    for index, item in enumerate(rows):
        if not isinstance(item, dict):
            raise ValueError(f"registry skill at index {index} must be an object")

        raw_name = item.get("name")
        name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else None

        source_paths: list[str] = []
        for field in ("source_path", "path", "source"):
            value = item.get(field)
            if isinstance(value, str) and value.strip():
                source_path = _normalise_registry_path(value)
                if source_path not in source_paths:
                    source_paths.append(source_path)

        digest = None
        for field in ("sha256", "sha", "skill_id", "id", "hash"):
            digest = _normalise_digest(item.get(field))
            if digest:
                break

        if not name and not source_paths:
            raise ValueError(f"registry skill at index {index} has no name or source path")

        entry = RegistryEntry(name=name, source_paths=tuple(source_paths), digest=digest)
        entries.append(entry)

        if name:
            by_name.setdefault(name, []).append(entry)
        for source_path in source_paths:
            aliases = {source_path}
            path_obj = PurePosixPath(source_path)
            if path_obj.name == "SKILL.md":
                aliases.add(path_obj.parent.name)
            for alias in aliases:
                by_path.setdefault(alias, []).append(entry)

    return entries, by_path, by_name


def _local_path_keys(path: Path) -> list[str]:
    """Build stable aliases so repository paths can match upstream registry paths."""
    relative = path.relative_to(ROOT).as_posix()
    keys: list[str] = [relative]

    # The registry commonly uses mega-skills-3000/skills/<name>/SKILL.md while
    # this repository stores the same file under psk/data/skills/<name>/SKILL.md.
    parts = PurePosixPath(relative).parts
    for index, part in enumerate(parts):
        if part == "skills" and index + 2 < len(parts) and parts[-1] == "SKILL.md":
            key = PurePosixPath(*parts[index:]).as_posix()
            if key not in keys:
                keys.append(key)

    # Also allow direct registry paths rooted beneath one of these directories.
    for prefix in ("psk/data/", "library/", "plugins/", ".claude/"):
        if relative.startswith(prefix):
            key = relative[len(prefix):]
            if key not in keys:
                keys.append(key)

    return keys


def _find_registry_entries(
    path: Path,
    by_path: dict[str, list[RegistryEntry]],
    by_name: dict[str, list[RegistryEntry]],
) -> list[RegistryEntry]:
    for key in _local_path_keys(path):
        if key in by_path:
            return by_path[key]
    # Source-path-only registries may not provide a separate `name` field.
    if path.parent.name in by_path:
        return by_path[path.parent.name]
    return by_name.get(path.parent.name, [])


def _expected_digest(entries: list[RegistryEntry]) -> tuple[str | None, str]:
    digests = {entry.digest for entry in entries if entry.digest}
    if not digests:
        return None, "NO HASH IN REGISTRY"
    if len(digests) > 1:
        return None, "AMBIGUOUS REGISTRY HASH"
    return next(iter(digests)), ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="محاسبه و مقایسهٔ SHA-256 فایل‌های SKILL.md")
    parser.add_argument(
        "--registry", "-r", type=Path,
        help="مسیر اختیاری فایل JSON برای مقایسهٔ هش‌ها",
    )
    parser.add_argument(
        "--strict", action="store_true",
        help="در صورت نبودن فایل در registry یا نداشتن هش معتبر نیز خروجی ناموفق باشد",
    )
    args = parser.parse_args(argv)

    by_path: dict[str, list[RegistryEntry]] = {}
    by_name: dict[str, list[RegistryEntry]] = {}
    if args.registry:
        try:
            registry_entries, by_path, by_name = load_registry(args.registry)
        except ValueError as exc:
            print(f"خطا: {exc}", file=sys.stderr)
            return 2
        print(f"تعداد ورودی‌های registry: {len(registry_entries)}")

    skills = find_skill_files()
    if not skills:
        print("هیچ فایلی با نام SKILL.md در مسیرهای بررسی‌شده پیدا نشد.")
        return 1

    print(f"تعداد فایل‌های پیدا‌شده: {len(skills)}\n")
    counts: dict[str, int] = {}
    mismatches = 0
    strict_unverified = 0

    for path in skills:
        relative = path.relative_to(ROOT).as_posix()
        try:
            actual_digest = sha256_of_file(path)
        except OSError as exc:
            status = "READ ERROR"
            actual_digest = "(unavailable)"
            print(f"{relative}\n  sha: {actual_digest}\n  status: {status} ({exc})\n")
            counts[status] = counts.get(status, 0) + 1
            mismatches += 1
            continue

        if not args.registry:
            status = "HASHED"
        else:
            entries = _find_registry_entries(path, by_path, by_name)
            if not entries:
                status = "NOT IN REGISTRY"
                strict_unverified += 1
            else:
                expected, issue = _expected_digest(entries)
                if issue:
                    status = issue
                    strict_unverified += 1
                elif expected == actual_digest:
                    status = "VERIFIED"
                else:
                    status = "MISMATCH"
                    mismatches += 1

        print(f"{relative}\n  sha: {actual_digest}\n  status: {status}")
        if args.registry and status in {"MISMATCH", "AMBIGUOUS REGISTRY HASH"}:
            expected_hashes = sorted({entry.digest for entry in _find_registry_entries(path, by_path, by_name) if entry.digest})
            print(f"  registry sha: {', '.join(expected_hashes)}")
        print()
        counts[status] = counts.get(status, 0) + 1

    summary = ", ".join(f"{status}: {count}" for status, count in sorted(counts.items()))
    print(f"Summary: {summary}")

    if mismatches:
        return 1
    if args.strict and strict_unverified:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
