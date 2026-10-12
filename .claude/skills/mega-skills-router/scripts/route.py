"""Route a request to matching skills; source_path is relative to the repository root, path is absolute."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path


ALIASES = {
    "tarahi": "design", "طراحی": "design", "graphic": "design", "گرافیک": "design",
    "aks": "image", "عکس": "image", "تصویر": "image", "photo": "image",
    "tahlil": "analysis", "تحلیل": "analysis", "analyze": "analysis",
    "dade": "data", "داده": "data", "اطلاعات": "data",
    "excel": "excel", "اکسل": "excel", "spreadsheet": "excel",
    "site": "website", "سایت": "website", "وبسایت": "website", "web": "website",
    "mohtava": "content", "محتوا": "content", "content": "content",
    "foroosh": "sales", "فروش": "sales", "sale": "sales",
    "roshd": "growth", "رشد": "growth", "growth": "growth",
    "sakht": "create", "ساخت": "create", "بساز": "create", "create": "create",
    "virayesh": "edit", "ویرایش": "edit", "اصلاح": "edit",
    "video": "video", "ویدئو": "video", "ویدیو": "video",
    "instagram": "instagram", "اینستاگرام": "instagram",
    "prompt": "prompt", "پرامپت": "prompt",
    "agent": "agent", "ایجنت": "agent",
    "automation": "automation", "اتوماسیون": "automation", "خودکار": "automation",
    "browser": "browser", "مرورگر": "browser",
    "dashboard": "dashboard", "داشبورد": "dashboard",
    "code": "code", "کد": "code", "برنامه‌نویسی": "code", "برنامه نویسی": "code",
    "research": "research", "پژوهش": "research", "تحقیق": "research",
    "marketing": "marketing", "بازاریابی": "marketing",
    "business": "business", "کسب‌وکار": "business", "کسب و کار": "business",
    "travel": "travel", "سفر": "travel",
    "document": "document", "سند": "document",
    "presentation": "presentation", "ارائه": "presentation", "اسلاید": "presentation",
}
STOPWORDS = {"a", "an", "the", "for", "of", "to", "and", "va", "و", "در", "برای", "با", "از", "رو", "را"}
def _repo_root() -> Path:
    """Repository that holds the indexed skills: MEGA_SKILLS_ROOT, the repo this script lives in, or the current directory."""
    import os
    candidates = [os.environ.get("MEGA_SKILLS_ROOT"), Path(__file__).resolve().parents[4], Path.cwd()]
    for candidate in candidates:
        if candidate and (Path(candidate) / "psk" / "data" / "skills").is_dir():
            return Path(candidate)
    return Path.cwd()


REPO_ROOT = _repo_root()
ARABIC_VARIANTS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})


def _stem(token: str) -> str:
    """Fold common English inflections so "testing", "tests" and "test" match."""
    if not token.isascii() or not token.isalpha():
        return token
    if token.endswith("ing") and len(token) > 5:
        return token[:-3]
    if token.endswith("s") and not token.endswith("ss") and len(token) > 3:
        return token[:-1]
    return token


def _tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKC", value).casefold().translate(ARABIC_VARIANTS)
    raw = re.findall(r"[\w]+", normalized, flags=re.UNICODE)
    return {_stem(ALIASES.get(token, token)) for token in raw if token not in STOPWORDS and len(token) > 1}


def search_index(index_path: Path, query: str, min_score: float = 0.50, *, include_incomplete: bool = False) -> list[dict[str, object]]:
    payload = json.loads(index_path.read_text(encoding="utf-8"))
    query_tokens = _tokens(query)
    if not query_tokens:
        return []
    ranked: list[tuple[tuple[object, ...], dict[str, object]]] = []
    for skill in payload["skills"]:
        if skill.get("incomplete") and not include_incomplete:
            continue
        name_hits = len(query_tokens & _tokens(skill["name"]))
        best_score = name_hits / len(query_tokens)
        best_precision = 0.0
        matched_trigger = skill["name"] if name_hits else ""
        for trigger in skill["triggers"]:
            trigger_tokens = _tokens(trigger)
            if not trigger_tokens:
                continue
            overlap = len(query_tokens & trigger_tokens)
            score = overlap / len(query_tokens)
            if query.casefold().strip() in trigger.casefold():
                score = max(score, 1.0)
            # Among equal coverage, prefer the trigger that is mostly about the query.
            precision = overlap / len(trigger_tokens)
            if (score, precision) > (best_score, best_precision):
                best_score = score
                best_precision = precision
                matched_trigger = trigger
        if best_score >= min_score:
            result = {"name": skill["name"], "domain": skill["domain"], "source_path": skill["source_path"], "path": str(REPO_ROOT / skill["source_path"]), "score": round(best_score, 6), "matched_trigger": matched_trigger}
            ranked.append(((-best_score, -name_hits, -best_precision, skill["domain"], skill["name"]), result))
    return [result for _, result in sorted(ranked, key=lambda pair: pair[0])]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mega-skills-route")
    parser.add_argument("query")
    parser.add_argument("--min-score", type=float, default=0.50)
    parser.add_argument("--index", type=Path)
    parser.add_argument("--include-incomplete", action="store_true", help="Include disabled, incomplete skills for manual review only")
    args = parser.parse_args(argv)
    index = args.index or Path(__file__).resolve().parents[1] / "references" / "triggers.json"
    print(json.dumps(search_index(index, args.query, args.min_score, include_incomplete=args.include_incomplete), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
