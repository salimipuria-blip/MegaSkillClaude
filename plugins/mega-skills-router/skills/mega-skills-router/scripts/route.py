"""Route a request to matching skills; source_path is relative to this skill directory, path is absolute."""

from __future__ import annotations

import argparse
import functools
import json
import math
import re
import unicodedata
from collections import Counter
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
    "seo": "seo", "سئو": "seo", "logo": "logo", "لوگو": "logo", "brand": "brand", "برند": "brand",
    "caption": "caption", "کپشن": "caption", "story": "story", "استوری": "story", "reel": "reel", "ریلز": "reel", "ریل": "reel",
    "اینستا": "instagram", "landing": "landing", "لندینگ": "landing", "debug": "debug", "دیباگ": "debug", "باگ": "bug",
    "test": "test", "تست": "test", "tour": "tour", "تور": "tour", "camp": "camp", "کمپ": "camp", "آفرود": "offroad", "offroad": "offroad",
    "shop": "shop", "فروشگاه": "shop", "ad": "ad", "تبلیغ": "ad", "تبلیغات": "ad", "advertising": "ad",
    # Persian names of tools and stacks the contract projects use (Hermes: Telegram bot; Cham: database; all: Python/JS).
    "ربات": "bot", "بات": "bot", "تلگرام": "telegram", "واتساپ": "whatsapp", "یوتیوب": "youtube",
    "پایتون": "python", "جاوااسکریپت": "javascript", "تایپ‌اسکریپت": "typescript", "تایپ اسکریپت": "typescript",
    "دیتابیس": "database", "پایگاه داده": "database", "سرور": "server", "ایمیل": "email",
    "سوپابیس": "supabase", "ورسل": "vercel", "کلادفلر": "cloudflare", "کلودفلر": "cloudflare", "ری‌اکت": "react", "ریکت": "react",
    "مارکتینگ": "marketing",
    # Contract-project brand names, in Persian and English (backlog task 4). «آفرود»/«offroad»
    # already existed; these three brands did not, so a brand query lost its brand token entirely.
    "هرمس": "hermes", "hermes": "hermes", "چام": "cham", "cham": "cham",
    "وایکینگ": "viking", "viking": "viking",
    # «کپشن خنده دار هالووین» used to return [] while «caption funny halloween» matched. Both
    # queries have one known token (caption); the Persian one carried three unknown tokens
    # (خنده/دار/هالووین) against two unknown ones in English, which pushed its score under
    # FALLBACK_MIN_SCORE (0.25), so even the CLI's partial-match pass found nothing. Folding the
    # light-verb phrase to a single token gives the Persian query the same shape as the working
    # English one (backlog task 5). Mapping it to "funny humor" instead would re-add a second
    # unknown token and keep failing.
    "خنده دار": "funny", "خنده‌دار": "funny", "خنده": "funny", "funny": "funny",
    "هالووین": "halloween", "halloween": "halloween",
    # Phrase aliases may expand to several words: «تست واحد» is a unit test, not a unit of measure.
    "تست واحد": "unit test", "یونیت تست": "unit test",
}
# Multi-word aliases ("کسب و کار", "برنامه‌نویسی" split at ZWNJ) are folded on the normalized text before tokenizing.
PHRASE_ALIASES = {" ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", key).casefold())): value for key, value in ALIASES.items() if len(re.findall(r"\w+", unicodedata.normalize("NFKC", key))) > 1}
PHRASE_ALIAS_RE = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(key) for key in sorted(PHRASE_ALIASES, key=len, reverse=True)) + r")(?!\w)") if PHRASE_ALIASES else None
STOPWORDS = {"a", "an", "the", "for", "of", "to", "and", "va", "و", "در", "برای", "با", "از", "رو", "را"}
# Second-chance vocabulary (backlog task 10). ALIASES folds one token onto another *always*; these are
# only consulted when a query matched nothing at all, and each value lists English tokens the index
# actually carries — measured, not guessed. Tokens whose English equivalent is absent from the index
# were deliberately left out (depreciation, memoir, taxpayer, reservation, stocktaking, advertisement
# all appear in 0 skills, so "translating" into them would still return []).
# Counts below are skills carrying that token in name or triggers, measured over references/triggers.json.
SYNONYMS = {
    "قبض": "bill invoice payment",            # invoice 80, payment 101, bill 2 — «قبض» appears in 0
    "انبارگردانی": "inventory count cycle",   # inventory 126, count 23, cycle 28 (stock-count-cycle-plan)
    "انبارداری": "inventory stock",           # warehouse 9 is mostly data-warehouse, so inventory first
    "بلیط": "ticket", "بلیت": "ticket",       # ticket 8 (bus-ticket-iran-guide)
    "هواپیما": "flight",                      # flight 7 (domestic-flight-notes-ir)
    "رزرو": "booking",                        # booking 35; "reservation" is not in the index
    "دفترچه": "notebook journal",             # notebook 17, journal 6
    "خاطرات": "diary journal", "خاطره": "diary journal",   # diary 7 (a skill literally named `diary`)
    "استخدام": "hiring recruitment job",      # hiring 12, recruitment 6, job 43
    "آگهی": "posting job ad",                 # posting 13; «آگهی» itself appears in 0 skills
    "تنخواه": "petty cash accounting",        # petty 6, cash 25, accounting 42
    "اظهارنامه": "tax filing financial",     # tax 17, financial 36
    "مالیاتی": "tax financial",
    "سامانه": "system platform tax",
    "مودیان": "tax invoice",                  # "taxpayer" is not in the index
    "مرخصی": "leave vacation",                # leave 18; "absence" is not in the index
    "کارمند": "employee staff hr",            # employee 43, staff 7, hr 14
    "شیفت": "shift roster",                   # roster 19 (cafe/camp/clinic/dental-roster), shift 1; "schedule"
                                              # pulled in hydration-schedule-maker, measured before choosing
    "کاری": "work",                           # "job" 43 is mostly hiring, a different sense of «کاری»
    "ترازنامه": "balance sheet financial",    # balance 16, sheet 67
    "سود": "profit margin", "زیان": "loss",   # profit 4, loss 13
    "نقدینگی": "liquidity cash flow",         # liquidity 2, cash 25
    "استهلاک": "asset value cost",            # "depreciation" is not in the index; asset 32
    "دارایی": "asset",
}
SKILL_DIR = Path(__file__).resolve().parents[1]
DEFAULT_MIN_SCORE = 0.50
FALLBACK_MIN_SCORE = 0.25
NAME_BOOST = 1.2
BRAND_TOKENS = frozenset({"viking", "hermes", "cham", "offroad"})
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


def _normalize(value: str) -> str:
    """NFKC + casefold, unify Arabic/Persian letter variants, treat ZWNJ as a word break, fold phrase aliases."""
    text = unicodedata.normalize("NFKC", value).casefold().translate(ARABIC_VARIANTS)
    text = " ".join(re.findall(r"\w+", text, flags=re.UNICODE))
    return PHRASE_ALIAS_RE.sub(lambda match: PHRASE_ALIASES[match.group(0)], text) if PHRASE_ALIASES else text


def _token_list(value: str) -> list[str]:
    """Ordered, alias-folded and stemmed tokens; order is kept so phrase matches respect word boundaries."""
    return [_stem(ALIASES.get(token, token)) for token in _normalize(value).split() if token not in STOPWORDS and len(token) > 1]


def _tokens(value: str) -> set[str]:
    return set(_token_list(value))


# Compared after normalization: the English stemmer reads "viking" as "vik".
BRAND_STEMS = frozenset(token for brand in BRAND_TOKENS for token in _token_list(brand))

def _contains_phrase(haystack: list[str], needle: list[str]) -> bool:
    size = len(needle)
    return any(haystack[i:i + size] == needle for i in range(len(haystack) - size + 1))


def _synonym_query(query: str) -> str:
    """Retry form for a query that matched nothing: swap Persian tokens the index lacks for the English
    tokens it carries (backlog task 10). Empty string means "no synonym applies, do not retry"."""
    expanded: list[str] = []
    applied = False
    for token in _token_list(query):
        synonyms = SYNONYMS.get(token)
        if synonyms:
            applied = True
            expanded.extend(_token_list(synonyms))
        else:
            expanded.append(token)
    if not applied:
        return ""
    ordered = list(dict.fromkeys(expanded))
    return " ".join(ordered) if ordered else ""


@functools.lru_cache(maxsize=4)
def _prepared_index(index_path: str, _mtime_ns: int, _size: int) -> tuple[tuple[dict[str, object], set[str], list[tuple[str, list[str]]], set[str]], ...]:
    """Tokenize the index once per process; the key includes mtime and size so an edited index is reloaded."""
    payload = json.loads(Path(index_path).read_text(encoding="utf-8"))
    prepared = []
    for skill in payload["skills"]:
        name_tokens = _tokens(skill["name"])
        triggers = [(trigger, _token_list(trigger)) for trigger in skill["triggers"]]
        prepared.append((skill, name_tokens, triggers, name_tokens.union(*(sequence for _, sequence in triggers))))
    return tuple(prepared)


def search_index(index_path: Path, query: str, min_score: float = 0.50, *, include_incomplete: bool = False, explain: bool = False) -> list[dict[str, object]]:
    query_sequence = _token_list(query)
    query_tokens = set(query_sequence)
    if not query_tokens:
        return []
    stat = Path(index_path).stat()
    prepared = []
    document_frequency: Counter[str] = Counter()
    for skill, name_tokens, triggers, seen in _prepared_index(str(Path(index_path).resolve()), stat.st_mtime_ns, stat.st_size):
        if skill.get("incomplete") and not include_incomplete:
            continue
        document_frequency.update(seen & query_tokens)
        prepared.append((skill, name_tokens, triggers))
    # Rare words carry the intent: in "سئو سایت" a skill that only says "site" must not tie with an SEO skill.
    # A contract-brand name says who the work is for, not what it is. While no skill carries it, it got
    # the largest IDF and sank every match: «تور آفرود وایکینگ» found nothing. Other unknown words stay
    # weighted, because they usually are the intent («قبض برق») and the synonym retry depends on that.
    weight = {token: 0.0 if token in BRAND_STEMS and not document_frequency[token]
              else math.log(1 + len(prepared) / (1 + document_frequency[token])) for token in query_tokens}
    total_weight = sum(weight.values())
    if not total_weight:
        return []

    def coverage(tokens: set[str]) -> float:
        return sum(weight[token] for token in query_tokens & tokens) / total_weight

    ranked: list[tuple[tuple[object, ...], dict[str, object]]] = []
    token_weights = {token: round(weight[token], 6) for token in query_sequence}
    for skill, name_tokens, triggers in prepared:
        name_hits = len(query_tokens & name_tokens)
        # A skill named after the request ("python-testing" for "write a python test") is the strongest signal.
        best_score = min(1.0, NAME_BOOST * coverage(name_tokens))
        best_precision = name_hits / len(name_tokens) if name_tokens else 0.0
        matched_trigger = skill["name"] if name_hits else ""
        # Why this skill won (backlog task 11): kept for the best trigger only, so --explain stays small.
        best_detail = {"matched_tokens": sorted(query_tokens & name_tokens), "trigger_tokens": sorted(name_tokens),
                       "coverage": round(coverage(name_tokens), 6), "phrase_match": False}
        for trigger, trigger_sequence in triggers:
            trigger_tokens = set(trigger_sequence)
            if not trigger_tokens:
                continue
            overlap = len(query_tokens & trigger_tokens)
            score = coverage(trigger_tokens)
            # The whole query as a word-bounded phrase ("ai" must not match "maintain" or "art" "start").
            phrase_match = _contains_phrase(trigger_sequence, query_sequence)
            if phrase_match:
                score = max(score, 1.0)
            # Among equal coverage, prefer the trigger that is mostly about the query.
            precision = overlap / len(trigger_tokens)
            if (score, precision) > (best_score, best_precision):
                best_score = score
                best_precision = precision
                matched_trigger = trigger
                best_detail = {"matched_tokens": sorted(query_tokens & trigger_tokens),
                               "trigger_tokens": sorted(trigger_tokens), "coverage": round(score, 6),
                               "phrase_match": phrase_match}
        if best_score >= min_score:
            result = {"name": skill["name"], "domain": skill["domain"], "source_path": skill["source_path"], "path": str(SKILL_DIR / skill["source_path"]), "score": round(best_score, 6), "matched_trigger": matched_trigger}
            if explain:
                result["explain"] = {"query_tokens": query_sequence, "token_weights": token_weights,
                                     "name_hits": name_hits, "unmatched_tokens": sorted(query_tokens - set(best_detail["matched_tokens"])),
                                     **best_detail}
            ranked.append(((-best_score, -best_precision, -name_hits, skill["domain"], skill["name"]), result))
    return [result for _, result in sorted(ranked, key=lambda pair: pair[0])]


RESULT_FIELDS = ("name", "domain", "source_path", "path", "score", "matched_trigger", "fallback", "explain")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mega-skills-route")
    parser.add_argument("query")
    parser.add_argument("--min-score", type=float, default=None, help="Minimum query coverage (default 0.50, relaxed to 0.25 when nothing matches)")
    parser.add_argument("--index", type=Path)
    parser.add_argument("--include-incomplete", action="store_true", help="Include disabled, incomplete skills for manual review only")
    parser.add_argument("--limit", type=int, default=30, help="Return at most this many best matches (0 = all)")
    parser.add_argument("--explain", action="store_true", help="Add why each skill won: matched tokens, the IDF weight of every query token, coverage and phrase match")
    parser.add_argument("--json-lines", action="store_true", help="One compact JSON object per line instead of an indented array")
    parser.add_argument("--fields", default=None, help="Comma-separated subset of result fields: " + ", ".join(RESULT_FIELDS))
    args = parser.parse_args(argv)
    if args.limit < 0:
        parser.error("--limit must be 0 or greater")
    index = args.index or Path(__file__).resolve().parents[1] / "references" / "triggers.json"
    if not index.is_file():
        parser.error(f"index not found: {index}")
    # An explicit --min-score is a contract: the synonym retry below honours it instead of quietly
    # returning weaker matches than the caller asked for.
    threshold = FALLBACK_MIN_SCORE if args.min_score is None else args.min_score
    results = search_index(index, args.query, threshold, include_incomplete=args.include_incomplete, explain=args.explain)
    if args.min_score is None:
        # Long, specific requests rarely sit in one trigger: keep strong matches when there are any, otherwise
        # fall back to partial ones. One pass at the lower threshold, filtered, gives the same ranking as two passes.
        results = [item for item in results if float(item["score"]) >= DEFAULT_MIN_SCORE] or results
    if not results:
        # Nothing matched at any threshold: one automatic retry with the measured Persian<->English synonym
        # map (backlog task 10), marked so a caller can tell a direct hit from a second-chance one.
        retry_query = _synonym_query(args.query)
        if retry_query:
            results = search_index(index, retry_query, threshold, include_incomplete=args.include_incomplete, explain=args.explain)
            for item in results:
                item["fallback"] = "synonym"
    if args.fields:
        wanted = [field.strip() for field in args.fields.split(",") if field.strip()]
        unknown = [field for field in wanted if field not in RESULT_FIELDS]
        if unknown or not wanted:
            parser.error(f"--fields: {'unknown field(s) ' + ', '.join(unknown) if unknown else 'no field selected'}; valid fields: {', '.join(RESULT_FIELDS)}")
        results = [{field: item[field] for field in wanted if field in item} for item in results]
    payload = results[:args.limit] if args.limit else results
    if args.json_lines:
        for item in payload:
            print(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
