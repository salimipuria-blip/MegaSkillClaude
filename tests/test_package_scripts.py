"""Every npm script in library/ and plugins/ must point at a file that exists.

A package.json script that references a missing runner is invisible until someone runs it: the
skill looks installed, `npm test` fails with MODULE_NOT_FOUND, and the failure is blamed on the
machine instead of the checkout. This walks every vendored package and resolves each script's
file arguments relative to the package directory.

Known exceptions are declared, dated and printed - never silently swallowed. An exception means
"this package is vendored as source/reference only; its upstream tooling is not part of this
repository", which is a decision, not an oversight.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

# File arguments inside an npm script: absolute-ish repo paths, or relative to the package.
ARGUMENT = re.compile(
    r"(?<![\w./-])"
    r"((?:scripts|src|bin|tools|test|tests|docs|examples)/[\w./-]+\.(?:mjs|cjs|js|py|sh)"
    r"|\.\.?/[\w./-]+\.(?:mjs|cjs|js|py|sh))"
)

# (package path suffix, reason) - reviewed 2026-10-14.
KNOWN_SOURCE_ONLY = {
    "archify": (
        "vendored from upstream as reference/source only; its ../scripts/*.mjs tooling is not part "
        "of this repository, so npm scripts inside the package are not runnable here"
    ),
}


def packages() -> list[Path]:
    found = set(ROOT.glob("library/**/package.json")) | set(ROOT.glob("plugins/**/package.json"))
    return sorted(found, key=str)


def broken_references() -> list[tuple[str, str, str]]:
    """(package, script name, missing relative path) for every unresolved file argument."""
    problems = []
    for package in packages():
        try:
            document = json.loads(package.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            problems.append((str(package.relative_to(ROOT)), "(unreadable)", str(error)))
            continue
        base = package.parent
        for name, command in (document.get("scripts") or {}).items():
            for token in sorted(set(ARGUMENT.findall(command))):
                if not (base / token).is_file():
                    problems.append((str(package.relative_to(ROOT)), name, token))
    return problems


class PackageScriptTests(unittest.TestCase):
    def test_every_script_target_exists(self):
        problems = broken_references()
        unexplained = []
        for package, script, target in problems:
            package_name = Path(package).parent.name
            if package_name not in KNOWN_SOURCE_ONLY:
                unexplained.append(f"{package} :: {script} -> {target}")
        self.assertEqual(
            unexplained,
            [],
            "npm scripts reference files that are not committed; add the missing runner or "
            "record the package in KNOWN_SOURCE_ONLY with a dated reason:\n  "
            + "\n  ".join(unexplained),
        )

    def test_declared_exceptions_are_really_broken_and_still_documented(self):
        """An exception that no longer applies must be removed, not left to rot."""
        problems = {(Path(p).parent.name, s, t) for p, s, t in broken_references()}
        for name, reason in KNOWN_SOURCE_ONLY.items():
            with self.subTest(package=name):
                self.assertTrue(reason.strip(), f"{name}: the exception needs a written reason")
                self.assertTrue(
                    any(pkg == name for pkg, _script, _target in problems),
                    f"{name} is listed as source-only but nothing is broken any more; "
                    "restore its scripts or drop the exception",
                )

    def test_packages_are_scanned_at_all(self):
        found = packages()
        self.assertGreaterEqual(len(found), 20, f"only {len(found)} packages found - did library/ move?")
        for package in found:
            self.assertTrue(package.is_file())
            self.assertNotIn("node_modules", package.parts, "installed dependencies are not ours to check")


if __name__ == "__main__":
    unittest.main()
