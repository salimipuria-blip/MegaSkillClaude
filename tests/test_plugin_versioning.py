"""Plugin versioning and changelog consistency (backlog task 18).

The plugin's version is published in `.claude-plugin/plugin.json` and mirrored by the repository-root
marketplace entry; `plugins/mega-skills-router/CLAUDE.md` already required the two to agree, but
nothing enforced it and no changelog existed. These tests pin the semver shape, the three places that
must carry the same version, the ordering and dating of the changelog, and — for the current release
only — that the entry describes what the canonical index actually says, so a count change cannot ship
without a version bump and a changelog entry.
"""
from __future__ import annotations

import datetime
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugins/mega-skills-router'
PLUGIN_JSON = PLUGIN / '.claude-plugin/plugin.json'
MARKETPLACE = ROOT / '.claude-plugin/marketplace.json'
CHANGELOG = PLUGIN / 'CHANGELOG.md'
CANONICAL_INDEX = ROOT / '.claude/skills/mega-skills-router/references/triggers.json'

SEMVER = re.compile(
    r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)'
    r'(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)'
    r'(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$')
RELEASE = re.compile(r'^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\] - (\d{4}-\d{2}-\d{2})$')
SECTION = re.compile(r'^### (Added|Changed|Fixed|Removed|Deprecated|Security)\s*$', re.M)
ANY_VERSION = re.compile(r'\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b')


def parse_semver(value: str) -> tuple[int, ...]:
    core = value.split('-', 1)[0]
    return tuple(int(part) for part in core.split('.'))


def releases(text: str) -> list[tuple[str, str, str]]:
    """(version, date, body) for every `## [x.y.z] - yyyy-mm-dd` block, in file order."""
    found = []
    lines = text.splitlines()
    for position, line in enumerate(lines):
        match = RELEASE.match(line)
        if not match:
            continue
        end = next((index for index in range(position + 1, len(lines))
                    if RELEASE.match(lines[index])), len(lines))
        found.append((match.group(1), match.group(2), '\n'.join(lines[position + 1:end])))
    return found


class VersionConsistencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plugin_version = json.loads(PLUGIN_JSON.read_text(encoding='utf-8'))['version']
        cls.marketplace = json.loads(MARKETPLACE.read_text(encoding='utf-8'))
        cls.changelog = CHANGELOG.read_text(encoding='utf-8')
        cls.releases = releases(cls.changelog)

    def marketplace_version(self) -> str:
        entries = [plugin for plugin in self.marketplace['plugins']
                   if plugin['name'] == 'mega-skills-router']
        self.assertEqual(len(entries), 1, 'the marketplace must list the router exactly once')
        return entries[0]['version']

    def test_plugin_and_marketplace_carry_the_same_valid_semver(self):
        for label, value in (('plugin.json', self.plugin_version),
                             ('marketplace.json', self.marketplace_version())):
            with self.subTest(source=label):
                self.assertIsNotNone(SEMVER.match(value), f'{label} version {value!r} is not semver')
        self.assertEqual(self.plugin_version, self.marketplace_version(),
                         'plugin.json and marketplace.json disagree: a consumer installing through the '
                         'marketplace would get a different version than the manifest states')

    def test_the_changelog_exists_and_its_newest_release_is_the_published_version(self):
        self.assertTrue(CHANGELOG.is_file(), 'plugins/mega-skills-router/CHANGELOG.md is missing')
        self.assertGreaterEqual(len(self.releases), 2,
                                'the changelog must record the current release and the one before it')
        version, date, _body = self.releases[0]
        self.assertEqual(version, self.plugin_version)
        parsed = datetime.date.fromisoformat(date)
        self.assertLessEqual(parsed, datetime.date.today(), 'a release cannot be dated in the future')

    def test_releases_are_unique_dated_and_strictly_descending(self):
        seen = set()
        previous = None
        for version, date, _body in self.releases:
            with self.subTest(version=version):
                self.assertIsNotNone(SEMVER.match(version))
                self.assertNotIn(version, seen, 'the same version is documented twice')
                seen.add(version)
                datetime.date.fromisoformat(date)
                if previous is not None:
                    self.assertLess(parse_semver(version), parse_semver(previous),
                                    'releases must be listed newest first')
                previous = version

    def test_every_release_documents_at_least_one_populated_section(self):
        for version, _date, body in self.releases:
            with self.subTest(version=version):
                sections = SECTION.findall(body)
                self.assertTrue(sections, f'{version} has no Keep a Changelog section')
                for section in sections:
                    block = body.split(f'### {section}', 1)[1]
                    block = block.split('### ', 1)[0]
                    self.assertTrue(re.search(r'^- \S', block, re.M),
                                    f'{version}: the {section} section is empty')

    def test_the_policy_and_the_missing_older_history_are_stated(self):
        for phrase in ('semantic versioning', 'Keep a Changelog', '**MAJOR**', '**MINOR**',
                       '**PATCH**', 'tests/test_plugin_versioning.py', 'no git tags'):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.changelog)

    def test_the_current_entry_describes_what_the_canonical_index_says(self):
        counts = json.loads(CANONICAL_INDEX.read_text(encoding='utf-8'))['counts']
        _version, _date, body = self.releases[0]
        # Needles name what the *current* release (1.4.0) is about; 1.3.0's flags stay in its own entry.
        for needle in (f"{counts['routable_skills']:,}", str(counts['incomplete_skills']),
                       'shared-references', '_licenses/', 'polis-protocol',
                       'git-guardrails-claude-code', 'qdrant-search-quality', 'wizard'):
            with self.subTest(needle=needle):
                self.assertIn(needle, body,
                              'the current release entry no longer matches the repository: bump the '
                              'version and write a new entry instead of editing this test')

    def test_plugin_docs_quote_only_the_current_version(self):
        # PROGRESS.md is a dated log and legitimately mentions older versions; the standing
        # documents must not.
        for relative in ('CLAUDE.md', 'README.md', 'PROFESSIONAL_GUIDE.md'):
            path = PLUGIN / relative
            if not path.is_file():
                continue
            for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                for found in ANY_VERSION.findall(line):
                    with self.subTest(document=relative, line=number, version=found):
                        self.assertEqual(found, self.plugin_version,
                                         f'{relative}:{number} quotes version {found}; bump it with '
                                         f'plugin.json or the reader is told the wrong version')


if __name__ == '__main__':
    unittest.main()
