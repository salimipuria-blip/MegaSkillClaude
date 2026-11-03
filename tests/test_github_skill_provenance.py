"""Naming and license provenance of the imported GitHub skill collection (backlog tasks 91 and 92).

Task 91 asks for a documented naming policy for the `mp-*` skills, whose upstream frontmatter name
has no prefix; task 92 asks for `_licenses/` to be cleaned up *or* justified. Deletion needs the
owner's approval, so both are settled by measurement plus a rule that a test can hold:

* the router looks skills up by folder name = `INDEX.json` name = router index name, and that
  namespace is unique (`colliding_triggers` is 0);
* the upstream frontmatter `name:` stays byte-identical to its origin, so exactly the 10 skills of
  `mattpocock/skills` diverge, and each `mp-` prefix is *necessary* because another indexed skill
  from a different repository already owns the unprefixed name;
* all 28 source repositories have their license text in `_licenses/`; 44 of their 45 notices are
  referenced by an imported skill's `SOURCE.md`, and the one leftover is named in the README with
  the reason it stays;
* the 25 further notices belong to the original repositories that supplied restored companion files
  (2026-10-23); each is cited by a `SOURCE.md` and listed in the README.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'library/github-skills'
README = LIBRARY / 'README.md'
LICENSES = LIBRARY / '_licenses'
CANONICAL_INDEX = ROOT / '.claude/skills/mega-skills-router/references/triggers.json'
PLUGIN_LICENSES = ROOT / 'plugins/mega-skills-router/skills/mega-skills-router/references/licenses'

LEFTOVER_NOTICE = 'sickn33__agentic-awesome-skills__skills_remote-gpu-trainer_LICENSE'
LICENSE_REFERENCE = re.compile(r'_licenses/([^\s)]+)')


def frontmatter_name(instructions: Path) -> str | None:
    """The `name:` of the YAML frontmatter block, or None when the file has none."""
    lines = instructions.read_text(encoding='utf-8', errors='replace').splitlines()
    if not lines or lines[0].strip() != '---':
        return None
    for line in lines[1:]:
        if line.strip() == '---':
            return None
        match = re.match(r'^name:\s*(.+?)\s*$', line)
        if match:
            return match.group(1).strip('"\'')
    return None


class NamingPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = json.loads((LIBRARY / 'INDEX.json').read_text(encoding='utf-8'))
        cls.by_name = {entry['name']: entry for entry in cls.entries}
        cls.router = json.loads(CANONICAL_INDEX.read_text(encoding='utf-8'))
        cls.readme = README.read_text(encoding='utf-8')

    def divergent(self):
        found = []
        for entry in self.entries:
            instructions = LIBRARY / entry['name'] / 'SKILL.md'
            if not instructions.is_file():
                continue
            name = frontmatter_name(instructions)
            self.assertIsNotNone(name, f"{entry['name']}: SKILL.md has no frontmatter name")
            if name != entry['name']:
                found.append((entry['name'], name, entry['repo']))
        return found

    def test_the_router_namespace_is_unique_and_no_trigger_collides(self):
        names = [skill['name'] for skill in self.router['skills']]
        self.assertEqual(len(names), len(set(names)), 'two indexed skills share a name')
        self.assertEqual(len(names), self.router['counts']['skills'])
        self.assertEqual(self.router['counts']['colliding_triggers'], 0)
        self.assertEqual({entry['name'] for entry in self.entries},
                         {skill['name'] for skill in self.router['skills'] if skill.get('origin') == 'github'})

    def test_only_the_matt_pocock_pack_diverges_from_its_frontmatter_name(self):
        divergent = self.divergent()
        self.assertEqual(len(divergent), 10, f'unexpected frontmatter divergence: {divergent}')
        for folder, name, repo in divergent:
            with self.subTest(skill=folder):
                self.assertTrue(folder.startswith('mp-'), f'{folder} diverges without the mp- prefix')
                self.assertEqual(folder[3:], name, f'{folder} is not simply the prefixed upstream name')
                self.assertEqual(repo, 'mattpocock/skills')

    def test_every_mp_prefix_is_necessary_because_the_name_is_already_taken(self):
        divergent = {folder: (name, repo) for folder, name, repo in self.divergent()}
        self.assertEqual(len(divergent), 10)
        for folder, (name, repo) in sorted(divergent.items()):
            with self.subTest(skill=folder):
                twin = self.by_name.get(name)
                self.assertIsNotNone(twin, f'{folder}: the prefix is decorative, {name} is free')
                self.assertNotEqual(twin['repo'], repo,
                                    f'{folder}: the twin comes from the same repository, so the two '
                                    f'folders are a duplicate import rather than a name collision')

    def test_the_readme_table_matches_the_index_row_for_row(self):
        rows = re.findall(r'^\| `(mp-[a-z0-9-]+)` \| `([a-z0-9-]+)` \| `([^`]+)` \|$',
                          self.readme, re.M)
        measured = {}
        for folder, name, _repo in self.divergent():
            measured[folder] = (name, self.by_name[name]['repo'])
        self.assertEqual(len(rows), len(measured), 'the README table lost or gained a row')
        for folder, name, repo in rows:
            with self.subTest(skill=folder):
                self.assertEqual(measured.get(folder), (name, repo),
                                 f'{folder}: the documented twin or repository is not what INDEX.json says')

    def test_the_readme_states_the_lookup_rule_and_the_import_rule(self):
        for phrase in ('the folder name is canonical', 'never used for lookup',
                       'prefix the *folder*', 'never rename inside an imported file',
                       'colliding_triggers'):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.readme)


class LicenseNoticeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = json.loads((LIBRARY / 'INDEX.json').read_text(encoding='utf-8'))
        cls.notices = sorted(path.name for path in LICENSES.iterdir() if path.is_file())
        cls.readme = README.read_text(encoding='utf-8')
        cls.referenced = set()
        for entry in cls.entries:
            source = LIBRARY / entry['name'] / 'SOURCE.md'
            if source.is_file():
                for match in LICENSE_REFERENCE.findall(source.read_text(encoding='utf-8')):
                    cls.referenced.add(match)

    def _companion_notices(self):
        """Notices of repositories that are not indexed sources but supplied restored companion files."""
        prefixes = tuple(entry['repo'].replace('/', '__') + '__' for entry in self.entries)
        return sorted(notice for notice in self.notices if not notice.startswith(prefixes))

    def test_every_source_repository_has_its_license_text_here(self):
        repos = {entry['repo'] for entry in self.entries}
        self.assertEqual(len(repos), 28)
        self.assertEqual(len(self.notices), 70)
        self.assertEqual(len(self.notices) - len(self._companion_notices()), 45)
        covered = set()
        for notice in self.notices:
            for repo in repos:
                if notice.startswith(repo.replace('/', '__') + '__'):
                    covered.add(repo)
                    break
        self.assertEqual(covered, repos, 'a repository was imported without its license text')

    def test_every_companion_source_notice_is_used_and_documented(self):
        # 2026-10-23: 219 incomplete skills were repaired; files that the indexed repository no longer
        # shipped came from the skill's own original repository, whose license travels with them.
        companions = self._companion_notices()
        self.assertEqual(len(companions), 25)
        for notice in companions:
            with self.subTest(notice=notice):
                self.assertIn(notice, self.referenced, 'a companion-source notice no SOURCE.md cites')
                self.assertIn(f'`{notice}`', self.readme, 'list every companion-source notice in the README')

    def test_every_license_reference_in_a_source_file_resolves(self):
        self.assertEqual(len(self.referenced), 69)
        missing = sorted(self.referenced - set(self.notices))
        self.assertEqual(missing, [], 'SOURCE.md points at a license notice that is not in _licenses/')

    def test_the_single_leftover_notice_is_named_and_justified_in_the_readme(self):
        leftover = sorted(set(self.notices) - self.referenced)
        self.assertEqual(leftover, [LEFTOVER_NOTICE],
                         'the set of unreferenced license notices changed: update the README section '
                         'and this test together, and never delete a notice without the owner')
        self.assertIn(LEFTOVER_NOTICE, self.readme)
        self.assertIn('kept on purpose', self.readme)
        # the notice is path scoped, and no indexed skill comes from that path
        self.assertNotIn('skills/remote-gpu-trainer',
                         [entry.get('path', '') for entry in self.entries])

    def test_the_documented_per_repository_counts_are_the_real_ones(self):
        repos = {entry['repo'] for entry in self.entries}
        per_repository = {}
        for notice in self.notices:
            for repo in repos:
                if notice.startswith(repo.replace('/', '__') + '__'):
                    per_repository[repo] = per_repository.get(repo, 0) + 1
                    break
        documented = {repo: int(count) for repo, count in
                      re.findall(r'^\| `([^`]+)` \| (\d+) \|$', self.readme, re.M)}
        self.assertEqual(len(documented), 5, 'the README should list exactly the repositories that '
                                             'contribute more than one license notice')
        for repo, count in documented.items():
            with self.subTest(repository=repo):
                self.assertEqual(per_repository.get(repo), count)
                self.assertGreater(count, 1)
        singles = sorted(repo for repo, count in per_repository.items() if count == 1)
        self.assertEqual(len(singles), 23)
        self.assertIn('the other 23 repositories | 1 each', self.readme)
        self.assertEqual(sum(per_repository.values()), len(self.notices) - len(self._companion_notices()))

    def test_the_portable_plugin_ships_the_same_notice_set(self):
        portable = sorted(path.name for path in PLUGIN_LICENSES.iterdir() if path.is_file())
        self.assertEqual(portable, self.notices)


if __name__ == '__main__':
    unittest.main()
