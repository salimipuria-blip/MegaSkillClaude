"""Ranking tests for both copies of the Mega Skills Router (project skill and plugin)."""

from __future__ import annotations

import functools
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COPIES = {
    "project": ROOT / ".claude/skills/mega-skills-router",
    "plugin": ROOT / "plugins/mega-skills-router/skills/mega-skills-router",
}


@functools.lru_cache(maxsize=None)
def _load(skill_dir: Path):
    """One module per copy, so the router's per-process index cache is shared across tests."""
    spec = importlib.util.spec_from_file_location(f"route_{skill_dir.parent.name}", skill_dir / "scripts" / "route.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RouterRankingTest(unittest.TestCase):
    def search(self, copy: str, query: str) -> list[str]:
        skill_dir = COPIES[copy]
        results = _load(skill_dir).search_index(skill_dir / "references" / "triggers.json", query)
        return [item["name"] for item in results]

    def test_exact_skill_name_ranks_first(self):
        for copy in COPIES:
            with self.subTest(copy=copy):
                self.assertEqual(self.search(copy, "react performance")[0], "react-performance")

    def test_inflected_words_match_skill_names(self):
        for copy in COPIES:
            with self.subTest(copy=copy):
                self.assertIn(self.search(copy, "write a python test")[0], {"python-testing", "python-testing-patterns"})

    def test_persian_query_routes(self):
        for copy in COPIES:
            with self.subTest(copy=copy):
                # «لوگو» folds to "logo", so Persian and English logo skills compete on equal terms.
                results = self.search(copy, "طراحی لوگو")
                self.assertEqual(results[0], "pro-brand-identity")
                self.assertIn("visual-design-brief", results[:10])

    def test_pro_pack_routes_persian_and_english_intents(self):
        expected = {
            "بازبینی کد": "pro-code-review", "دیباگ": "pro-debugging", "write tests": "pro-testing-strategy",
            "react typescript": "pro-frontend-engineering", "امنیت سایت": "pro-security-review",
            "دیزاین سیستم": "pro-ui-design-system", "طراحی تجربه کاربری": "pro-ux-design",
            "هویت بصری": "pro-brand-identity", "حل تعارض گیت": "pro-git-workflow",
        }
        for copy in COPIES:
            for query, name in expected.items():
                with self.subTest(copy=copy, query=query):
                    self.assertEqual(self.search(copy, query)[0], name)
        for name in set(expected.values()) | {"pro-backend-api-design"}:
            self.assertTrue((ROOT / "library/skills" / name / "SKILL.md").is_file(), name)

    def test_copies_return_the_same_ranking(self):
        for query in ("instagram content", "excel dashboard", "تحلیل داده فروش"):
            with self.subTest(query=query):
                self.assertEqual(self.search("project", query), self.search("plugin", query))

    def test_incomplete_skills_are_opt_in_only(self):
        for copy, directory in COPIES.items():
            with self.subTest(copy=copy):
                module = _load(directory)
                path = directory / "references/triggers.json"
                default = module.search_index(path, "configure-ecc")
                self.assertNotIn("configure-ecc", [s["name"] for s in default])
                reviewed = module.search_index(path, "configure-ecc", include_incomplete=True)
                self.assertEqual(reviewed[0]["name"], "configure-ecc")

    def test_both_indexes_mirror_the_canonical_incomplete_flags(self):
        github = json.loads((ROOT / "library/github-skills/INDEX.json").read_text())
        expected = {s["name"] for s in github if s.get("incomplete")}
        self.assertEqual(len(expected), 284)
        for directory in COPIES.values():
            index = json.loads((directory / "references/triggers.json").read_text())
            self.assertEqual({s["name"] for s in index["skills"] if s.get("incomplete")}, expected)
            self.assertEqual(index["counts"]["routable_skills"], len(index["skills"]) - len(expected))

    def test_matt_pocock_pack_survives_canonical_portable_synchronization(self):
        github = json.loads((ROOT / "library/github-skills/INDEX.json").read_text())
        pack = {s["name"] for s in github if s["repo"] == "mattpocock/skills"}
        self.assertGreaterEqual(len(pack), 31)
        self.assertTrue({"ask-matt", "mp-code-review", "tdd", "to-tickets"} <= pack)
        for directory in COPIES.values():
            index = json.loads((directory / "references/triggers.json").read_text())
            self.assertTrue(pack <= {s["name"] for s in index["skills"]})
        for name in pack:
            canonical = ROOT / "library/github-skills" / name / "SKILL.md"
            portable = COPIES["plugin"] / "references/skills" / name / "INSTRUCTIONS.md"
            self.assertEqual(canonical.read_bytes(), portable.read_bytes())
        license_name = "mattpocock__skills__LICENSE"
        self.assertEqual((ROOT / "library/github-skills/_licenses" / license_name).read_bytes(),
                         (COPIES["plugin"] / "references/licenses" / license_name).read_bytes())

    def test_phrase_match_is_word_bounded(self):
        """A short query used to substring-match unrelated triggers ("ai" in "maintain", "art" in "start")."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            for query in ("ai", "art", "test"):
                with self.subTest(copy=copy, query=query):
                    results = module.search_index(path, query)
                    self.assertTrue(results)
                    for item in results:
                        self.assertTrue(module._tokens(query) & module._tokens(item["matched_trigger"]), item)

    def test_multiword_and_zwnj_aliases_fold(self):
        for copy, directory in COPIES.items():
            module = _load(directory)
            with self.subTest(copy=copy):
                self.assertEqual(module._tokens("برنامه‌نویسی"), {"code"})
                self.assertEqual(module._tokens("برنامه نویسی"), {"code"})
                self.assertEqual(module._tokens("کسب و کار"), {"business"})
                self.assertEqual(module._tokens("کسب‌وکار"), {"business"})
                self.assertEqual(module._tokens("اينستاگرام"), {"instagram"})

    def test_brand_aliases_fold_in_persian_and_english(self):
        """The four contract brands must keep their brand token in both languages (backlog task 4).

        The router stems tokens ("hermes" -> "herme"), so the expectation is derived through the
        router's own `_stem` instead of hardcoding a stemmed spelling here.
        """
        brands = (("هرمس", "Hermes"), ("چام", "Cham"), ("وایکینگ", "Viking"), ("آفرود", "offroad"))
        for copy, directory in COPIES.items():
            module = _load(directory)
            for persian, english in brands:
                with self.subTest(copy=copy, brand=english):
                    self.assertEqual(module._tokens(persian), module._tokens(english),
                                     "the Persian and English brand names must tokenize identically")
                    self.assertEqual(module._tokens(english), {module._stem(english.lower())},
                                     "the brand token must survive aliasing and stemming")
            # a brand must not swallow the rest of the query: «ربات تلگرام هرمس» keeps all three tokens
            with self.subTest(copy=copy, query="ربات تلگرام هرمس"):
                self.assertEqual(module._tokens("ربات تلگرام هرمس"),
                                 {module._stem(word) for word in ("bot", "telegram", "hermes")})

    def test_caption_query_with_unknown_modifiers_still_routes(self):
        """«کپشن خنده دار هالووین» returned [] while «caption funny halloween» matched (backlog task 5).

        Both queries carry exactly one indexed token (caption). The Persian one used to add three
        unknown tokens (خنده/دار/هالووین) against two in English, which pushed its score under
        FALLBACK_MIN_SCORE (0.25), so even the CLI's partial-match pass returned nothing. Folding
        the light-verb phrase to a single token equalizes the two shapes. The acceptance is the
        CLI's answer, so the test drives `main` exactly like `route.py "<query>"` does; all three
        queries sit in the partial band (nothing reaches the strict 0.50 threshold).
        """
        import contextlib
        import io
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            # the mechanism, not just the outcome: the Persian query must end up with the very
            # same token shape as the English query that always worked
            english = module._tokens("caption funny halloween")
            for persian in ("کپشن خنده دار هالووین", "کپشن خنده‌دار هالووین"):
                with self.subTest(copy=copy, persian=persian):
                    self.assertEqual(module._tokens(persian), english)
            for query in ("کپشن خنده دار هالووین", "کپشن خنده‌دار هالووین", "caption funny halloween"):
                with self.subTest(copy=copy, query=query):
                    self.assertEqual(module.search_index(path, query, module.DEFAULT_MIN_SCORE), [],
                                     "these are partial matches; the strict threshold must stay empty")
                    out = io.StringIO()
                    with contextlib.redirect_stdout(out):
                        module.main([query, "--index", str(path)])
                    top = [item["name"] for item in json.loads(out.getvalue())][:3]
                    self.assertTrue(top, f"{query!r} returned no skill at all")
                    self.assertTrue(any("caption" in name for name in top),
                                    f"{query!r} put no caption skill in the top 3: {top}")

    def test_rare_words_outweigh_generic_ones(self):
        """In "سئو سایت" a skill that only matches the generic "site" must not pass as an SEO match."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            with self.subTest(copy=copy):
                results = module.search_index(directory / "references/triggers.json", "سئو سایت")
                self.assertEqual(results[0]["name"], "seo")
                for item in results:
                    matched = module._tokens(item["matched_trigger"]) | module._tokens(item["name"])
                    self.assertIn("seo", matched, item)

    def test_cli_falls_back_to_partial_matches(self):
        import contextlib
        import io
        query = "کپشن اینستاگرام تور آفرود"
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            with self.subTest(copy=copy):
                self.assertEqual(module.search_index(path, query), [])
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    module.main([query, "--index", str(path)])
                self.assertTrue(json.loads(out.getvalue()))
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    module.main([query, "--index", str(path), "--min-score", "0.5"])
                self.assertEqual(json.loads(out.getvalue()), [])

    def test_cli_limits_output(self):
        import contextlib
        import io
        for copy, directory in COPIES.items():
            module = _load(directory)
            with self.subTest(copy=copy):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    module.main(["ai", "--limit", "3", "--index", str(directory / "references/triggers.json")])
                self.assertEqual(len(json.loads(out.getvalue())), 3)
                with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                    module.main(["ai", "--index", str(directory / "missing.json")])

    def test_persian_stack_names_route_to_their_skills(self):
        """Persian names of the contract projects' stack used to miss: «ربات تلگرام» → telegram-channel-export,
        «تست واحد» → bottoms-up-model-sheet (unit of measure), «برنامه‌نویسی پایتون» → openpyxl."""
        expected = {
            "ربات تلگرام": {"telegram-bot-builder", "telegram-automation"},
            "تست واحد": {"pro-testing-strategy", "unit-testing-test-generate"},
            "برنامه‌نویسی پایتون": {"python-code-style", "python-anti-patterns", "python-patterns"},
            "دیتابیس سوپابیس": {"supabase-automation", "supabase", "postgres-patterns"},
            "ایمیل مارکتینگ": {"email-marketing"},
        }
        for copy in COPIES:
            for query, names in expected.items():
                with self.subTest(copy=copy, query=query):
                    self.assertIn(self.search(copy, query)[0], names)

    def test_route_copies_differ_only_in_path_resolution(self):
        """The two route.py files are maintained by hand; any algorithm change must land in both."""
        def body(copy: str) -> list[str]:
            lines = (COPIES[copy] / "scripts/route.py").read_text(encoding="utf-8").splitlines()
            start = next(i for i, line in enumerate(lines) if line.startswith("DEFAULT_MIN_SCORE"))
            return [line.replace("REPO_ROOT", "BASE").replace("SKILL_DIR", "BASE") for line in lines[start:]]
        self.assertEqual(body("project"), body("plugin"))

    def test_index_cache_reloads_an_edited_index(self):
        import os
        import tempfile
        module = _load(COPIES["plugin"])
        skill = {"name": "alpha-skill", "domain": "general", "source_path": "x/SKILL.md", "triggers": ["alpha"]}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "triggers.json"
            path.write_text(json.dumps({"skills": [skill]}), encoding="utf-8")
            self.assertEqual([r["name"] for r in module.search_index(path, "alpha")], ["alpha-skill"])
            path.write_text(json.dumps({"skills": [dict(skill, name="beta-skill", triggers=["beta"])]}), encoding="utf-8")
            os.utime(path, ns=(path.stat().st_atime_ns, path.stat().st_mtime_ns + 1_000_000_000))
            self.assertEqual(module.search_index(path, "alpha"), [])
            self.assertEqual([r["name"] for r in module.search_index(path, "beta")], ["beta-skill"])

    def test_indexed_paths_exist(self):
        project = _load(COPIES["project"])
        results = project.search_index(COPIES["project"] / "references" / "triggers.json", "code", min_score=0.0)
        self.assertTrue(results)
        for item in results[:200]:
            self.assertTrue(Path(item["path"]).is_file(), item["path"])

    # Backlog task 10. These 15 Persian requests returned [] before the synonym retry, measured on
    # 2026-10-22 against references/triggers.json (6,029 skills / 30,203 triggers): the index simply
    # carries no «قبض», «بلیط», «هواپیما», «انبارگردانی», «تنخواه», «اظهارنامه», «مودیان», «مرخصی»,
    # «شیفت», «ترازنامه», «نقدینگی», «استهلاک» or «خاطرات» token. Each value lists the substrings an
    # honest answer must contain in the top 3; «استهلاک دارایی» can only reach asset management because
    # "depreciation" appears in 0 skills, and that limitation is documented in SYNONYMS itself.
    SYNONYM_FIXTURES = {
        "قبض برق رو پرداخت کن": ("invoice", "account", "payment"),
        "انبارگردانی": ("stock-count", "inventory"),
        "بلیط هواپیما رزرو کن": ("flight", "ticket", "booking"),
        "دفترچه خاطرات": ("diary", "notebook", "journal"),
        "خاطرات سفر را بنویس": ("diary", "journal", "travel"),
        "متن آگهی استخدام": ("recruitment", "hiring", "job"),
        "تنخواه گردان": ("petty-cash", "cash"),
        "اظهارنامه مالیاتی": ("tax", "financial", "filing"),
        "سامانه مودیان": ("invoice", "tax", "payment"),
        "مرخصی کارمند": ("leave", "hr", "employee"),
        "شیفت کاری": ("roster", "shift"),
        "ترازنامه": ("financial", "balance", "sheet"),
        "سود و زیان": ("loss", "margin", "closing", "profit"),
        "نقدینگی": ("cash", "liquidity"),
        "استهلاک دارایی": ("asset",),
    }

    def _cli(self, module, path, *argv):
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            module.main([*argv, "--index", str(path)])
        return out.getvalue()

    def test_queries_that_used_to_return_nothing_retry_with_measured_synonyms(self):
        """Backlog task 10: an empty answer triggers exactly one retry through the synonym map."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            for query, wanted in self.SYNONYM_FIXTURES.items():
                with self.subTest(copy=copy, query=query):
                    # the premise is asserted, not assumed: without the retry these match nothing
                    self.assertEqual(module.search_index(path, query, module.FALLBACK_MIN_SCORE), [],
                                     f"{query!r} matches the index directly now; refresh the synonym fixtures")
                    top = json.loads(self._cli(module, path, query, "--limit", "3"))
                    self.assertTrue(top, f"{query!r} still returns nothing")
                    self.assertEqual({item.get("fallback") for item in top}, {"synonym"},
                                     "a retried answer must say so")
                    names = [item["name"] for item in top]
                    self.assertTrue(any(any(token in name for token in wanted) for name in names),
                                    f"{query!r} returned nothing relevant: {names}")

    def test_the_synonym_retry_never_fires_when_something_matched(self):
        """Task 10 must not touch queries that already work, and must not soften an explicit threshold."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            with self.subTest(copy=copy):
                direct = json.loads(self._cli(module, path, "پشتیبانی مشتریان", "--limit", "3"))
                self.assertTrue(direct)
                self.assertNotIn("fallback", direct[0], "a direct hit must not be labelled as a retry")
                # no synonym applies => no second search at all
                self.assertEqual(module._synonym_query("react performance"), "")
                self.assertEqual(module._synonym_query("کپشن خنده دار هالووین"), "")
                # an explicit --min-score is a contract: the retry must honour it, not undercut it
                strict = json.loads(self._cli(module, path, "انبارگردانی", "--min-score", "0.9"))
                self.assertEqual(strict, [])
                self.assertTrue(module._synonym_query("انبارگردانی"), "the retry is available, the threshold blocked it")

    def test_explain_reports_matched_tokens_and_their_idf_weights(self):
        """Backlog task 11: --explain shows which tokens matched and what each one weighed."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            with self.subTest(copy=copy):
                plain = json.loads(self._cli(module, path, "سئو سایت", "--limit", "1"))
                self.assertNotIn("explain", plain[0], "the default output shape must not change")
                explained = json.loads(self._cli(module, path, "سئو سایت", "--limit", "1", "--explain"))[0]["explain"]
                for key in ("query_tokens", "token_weights", "matched_tokens", "unmatched_tokens",
                            "trigger_tokens", "coverage", "phrase_match", "name_hits"):
                    self.assertIn(key, explained)
                self.assertEqual(explained["query_tokens"], ["seo", "website"], "aliases fold before explaining")
                self.assertEqual(set(explained["token_weights"]), set(explained["query_tokens"]))
                # the whole point of IDF: the rare token must outweigh the generic one
                self.assertGreater(explained["token_weights"]["seo"], explained["token_weights"]["website"])
                self.assertTrue(all(weight > 0 for weight in explained["token_weights"].values()))
                self.assertEqual(set(explained["matched_tokens"]) | set(explained["unmatched_tokens"]),
                                 set(explained["query_tokens"]))
                self.assertTrue(set(explained["matched_tokens"]) <= set(explained["query_tokens"]))
                self.assertLessEqual(explained["coverage"], 1.0)
                self.assertIsInstance(explained["phrase_match"], bool)

    def test_json_lines_and_fields_are_cheap_output_modes(self):
        """Backlog task 16: one compact object per line, and only the fields the caller pays for."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            with self.subTest(copy=copy):
                lines = self._cli(module, path, "react performance", "--limit", "4", "--json-lines",
                                  "--fields", "name,score").splitlines()
                self.assertEqual(len(lines), 4)
                rows = [json.loads(line) for line in lines]
                for line, row in zip(lines, rows):
                    self.assertEqual(list(row), ["name", "score"], "field order and nothing else")
                    self.assertNotIn(" ", line.replace(row["name"], ""), "compact separators, no pretty printing")
                array = json.loads(self._cli(module, path, "react performance", "--limit", "4"))
                self.assertEqual([row["name"] for row in rows], [item["name"] for item in array],
                                 "--json-lines must not reorder or re-rank")
                self.assertEqual(rows[0]["name"], "react-performance")
                # --fields wins over --explain, so a cheap caller never pays for the diagnostics
                self.assertEqual(list(json.loads(self._cli(module, path, "react performance", "--limit", "1",
                                                           "--fields", "name", "--explain"))[0]), ["name"])
                import contextlib
                import io
                err = io.StringIO()
                with self.assertRaises(SystemExit) as raised, contextlib.redirect_stderr(err):
                    module.main(["react performance", "--index", str(path), "--fields", "name,bogus"])
                self.assertEqual(raised.exception.code, 2)
                self.assertIn("unknown field(s) bogus", err.getvalue())
                self.assertIn("matched_trigger", err.getvalue())


if __name__ == "__main__":
    unittest.main()
