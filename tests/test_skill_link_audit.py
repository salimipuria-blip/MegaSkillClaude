"""Tests for the skill link audit (backlog task 90).

The audit replaces the ad-hoc snippet in `library/CLAUDE.md` whose 2026-10-18 baseline was
"114 skills with a dead local link, 67 not flagged". Its acceptance line is `unflagged: []`, so the
tests here pin three things: the real library is clean, the flags that make it clean are complete
(INDEX.json + SOURCE.md + the canonical router index + the generated domain marker all agree), and
the classifier cannot be fooled — a fixture skill with a dead companion goes red, a dead link inside
a *closed* code fence is excused as a sample, and one inside a fence the file never closes is not.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/check_skill_links.py'
LIBRARY = ROOT / 'library/github-skills'
CANONICAL = ROOT / '.claude/skills/mega-skills-router/references/triggers.json'

# Flagged by this round after reading each skill: the SKILL.md promises a file inside its own folder
# that was never copied, so the router must not hand it out by default.
NEWLY_FLAGGED = {
    'git-guardrails-claude-code': ['scripts/block-dangerous-git.sh'],
    'qdrant-search-quality': ['diagnosis/SKILL.md', 'search-strategies/SKILL.md'],
    'wizard': ['template.sh'],
}

_spec = importlib.util.spec_from_file_location('check_skill_links', SCRIPT)
audit_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit_module)


class RealLibraryAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = audit_module.audit()

    def test_the_acceptance_line_is_empty_and_no_finding_remains(self):
        self.assertEqual(self.report['unflagged'], [],
                         'a github skill still links to a companion file that is absent and is not '
                         'flagged incomplete: read it, then supply the file or flag the skill')
        for key in audit_module.PROBLEM_KEYS:
            with self.subTest(finding=key):
                self.assertEqual(self.report[key], [])

    def test_every_link_is_accounted_for_by_exactly_one_bucket(self):
        # every link occurrence lands in exactly one bucket; `missing_files` counts distinct
        # promised files, which is lower when one skill links to the same absent file twice
        buckets = ('resolved', 'external', 'placeholder', 'upstream', 'code_sample', 'justified', 'missing')
        self.assertEqual(sum(self.report[key] for key in buckets), self.report['links'])
        self.assertLessEqual(self.report['missing_files'], self.report['missing'])
        self.assertEqual(self.report['skills_scanned'],
                         sum(1 for folder in LIBRARY.iterdir() if (folder / 'SKILL.md').is_file()))

    def test_the_flags_agree_with_both_indexes(self):
        entries = json.loads((LIBRARY / 'INDEX.json').read_text(encoding='utf-8'))
        router = json.loads(CANONICAL.read_text(encoding='utf-8'))
        flagged = {entry['name'] for entry in entries if entry.get('incomplete')}
        self.assertEqual(self.report['flagged_incomplete'], len(flagged))
        self.assertEqual(router['counts']['incomplete_skills'], len(flagged))
        self.assertEqual(router['counts']['routable_skills'], len(router['skills']) - len(flagged))
        self.assertEqual({skill['name'] for skill in router['skills']
                          if skill.get('origin') == 'github' and skill.get('incomplete')}, flagged)

    def test_the_three_skills_flagged_this_round_carry_the_whole_flag_triplet(self):
        entries = {entry['name']: entry
                   for entry in json.loads((LIBRARY / 'INDEX.json').read_text(encoding='utf-8'))}
        router = {skill['name']: skill
                  for skill in json.loads(CANONICAL.read_text(encoding='utf-8'))['skills']}
        for name, missing in NEWLY_FLAGGED.items():
            with self.subTest(skill=name):
                self.assertTrue(entries[name].get('incomplete'), f'{name} lost its INDEX.json flag')
                self.assertEqual(entries[name].get('missing_files'), missing)
                for path in missing:
                    self.assertFalse((LIBRARY / name / path).exists(),
                                     f'{name}/{path} exists now, so the incomplete flag is stale')
                source = (LIBRARY / name / 'SOURCE.md').read_text(encoding='utf-8')
                self.assertEqual(source.rstrip('\n').splitlines()[-1],
                                 'INCOMPLETE: SKILL.md references files not present here (they live '
                                 'elsewhere in the upstream repo or do not exist upstream): ' + ', '.join(missing))
                self.assertTrue(router[name].get('incomplete'), f'{name} is not flagged in the router index')
                domain = (ROOT / f".claude/skills/mega-skills-router/references/domains/{router[name]['domain']}.md")
                line = next(line for line in domain.read_text(encoding='utf-8').splitlines()
                            if f'`{name}`' in line)
                self.assertIn('[incomplete: excluded from default routing]', line)

    def test_every_justification_is_still_true_and_still_needed(self):
        for (name, target), (line, kind, reason) in sorted(audit_module.JUSTIFIED.items()):
            with self.subTest(skill=name, target=target):
                self.assertIn(kind, ('illustrative', 'sibling'))
                self.assertTrue(reason.strip(), 'a justification without a reason is not a justification')
                instructions = (LIBRARY / name / 'SKILL.md').read_text(encoding='utf-8', errors='replace').splitlines()
                self.assertLessEqual(line, len(instructions))
                self.assertIn(target, instructions[line - 1],
                              f'{name}: the justified link moved off line {line}; re-read the skill')
                self.assertFalse((LIBRARY / name / target).exists(),
                                 f'{name}/{target} exists now, so the justification is obsolete')
                entries = json.loads((LIBRARY / 'INDEX.json').read_text(encoding='utf-8'))
                entry = next(item for item in entries if item['name'] == name)
                self.assertFalse(entry.get('incomplete'),
                                 f'{name} is both justified and flagged; pick one and say why')


class ClassifierTests(unittest.TestCase):
    def test_closed_fences_are_code_samples_and_an_unclosed_fence_fails_closed(self):
        lines = [
            '# title',                     # 1 prose
            '```txt',                      # 2 opens
            '- [template](README.md)',     # 3 code sample
            '```',                         # 4 closes
            'see [file](notes.md)',        # 5 prose
            '```',                         # 6 opens and never closes
            '- [tail](tail.md)',           # 7 inside an unclosed fence
        ]
        closed, unclosed = audit_module.code_regions(lines)
        self.assertEqual(closed, {2, 3, 4})
        self.assertEqual(unclosed, {6, 7})
        self.assertNotIn(7, closed, 'a dead link must not hide behind a fence the file never closes')

    def test_a_longer_marker_run_is_not_closed_by_a_shorter_one(self):
        """CommonMark 4.5: the closer needs the same character and at least as many markers.

        `library/github-skills/aws-cost-optimize/SKILL.md` nests a bash sample inside a four-backtick
        markdown block. Pairing on the marker character alone closed the outer block at the inner
        fence, then read the real closer as a new opener and called the file unclosed. Across the
        3,011 imported skills that mistake mis-paired 37 files (1,435 lines on the wrong side of a
        fence) and called 26 of them broken where the spec says 16.
        """
        lines = [
            'prose',                       # 1
            '````markdown',                # 2 opens with four backticks
            '```bash',                     # 3 three markers and an info string: content
            'rm -rf /tmp/x',               # 4
            '```',                         # 5 three markers: too short to close line 2
            '````',                        # 6 four markers, no info string: closes
            '1. a real step',              # 7 prose
        ]
        closed, unclosed = audit_module.code_regions(lines)
        self.assertEqual(closed, {2, 3, 4, 5, 6})
        self.assertEqual(unclosed, set())
        self.assertNotIn(7, closed, 'prose after the wrapper must stay prose')

    def test_a_fence_indented_four_spaces_is_an_indented_code_block_not_a_fence(self):
        """`markdown-to-html` shows nested samples this way; counting them as fences mis-pairs files."""
        lines = [
            '```text',                     # 1 opens
            '    ```markdown',             # 2 four spaces: content of the outer block
            '    your code here',          # 3
            '    ```',                     # 4 four spaces: content
            '```',                         # 5 closes
            'see [notes](notes.md)',       # 6 prose
        ]
        closed, unclosed = audit_module.code_regions(lines)
        self.assertEqual(closed, {1, 2, 3, 4, 5})
        self.assertEqual(unclosed, set())
        self.assertNotIn(6, closed)

    def test_placeholders_and_external_targets_are_not_paths(self):
        self.assertEqual(audit_module.classify('{slug}/notes.md'), 'placeholder')
        self.assertEqual(audit_module.classify('chapters/ch01-<slug>.md'), 'placeholder')
        self.assertEqual(audit_module.classify('src'), 'placeholder')
        self.assertEqual(audit_module.classify('https://example.com/a.md'), 'external')
        self.assertEqual(audit_module.classify('../../DESIGN.md'), 'upstream')
        self.assertEqual(audit_module.classify('references/notes.md'), 'local')

    def test_leading_dot_slash_is_the_same_promised_file(self):
        self.assertEqual(audit_module.normalize('./assets/example.tm7'), 'assets/example.tm7')
        self.assertEqual(audit_module.normalize('assets/example.tm7'), 'assets/example.tm7')


class FixtureTests(unittest.TestCase):
    """The classifier is only trustworthy if a dead companion on a synthetic tree goes red."""

    def build(self, root: Path) -> tuple[Path, Path, Path]:
        library = root / 'library'
        (library / 'broken-skill').mkdir(parents=True)
        (library / 'broken-skill' / 'SKILL.md').write_text(
            '# broken\n\nRun the bundled helper: [helper](scripts/helper.sh)\n', encoding='utf-8')
        (library / 'broken-skill' / 'SOURCE.md').write_text(
            'Source: https://github.com/example/repo\nRepository: example/repo\n', encoding='utf-8')
        (library / 'flagged-skill').mkdir()
        (library / 'flagged-skill' / 'SKILL.md').write_text(
            '# flagged\n\nSee [notes](references/notes.md)\n', encoding='utf-8')
        (library / 'flagged-skill' / 'SOURCE.md').write_text(
            'Source: https://github.com/example/repo\n\nINCOMPLETE: SKILL.md references files not '
            'present here (they live elsewhere in the upstream repo or do not exist upstream): '
            'references/notes.md\n', encoding='utf-8')
        (library / 'sample-skill').mkdir()
        (library / 'sample-skill' / 'SKILL.md').write_text(
            '# sample\n\n```markdown\n- [Generated](README.md)\n```\n', encoding='utf-8')
        (library / 'sample-skill' / 'SOURCE.md').write_text('Source: https://github.com/example/repo\n',
                                                            encoding='utf-8')
        index = library / 'INDEX.json'
        index.write_text(json.dumps([
            {'name': 'broken-skill', 'repo': 'example/repo', 'incomplete': False},
            {'name': 'flagged-skill', 'repo': 'example/repo', 'incomplete': True,
             'missing_files': ['references/notes.md']},
            {'name': 'sample-skill', 'repo': 'example/repo', 'incomplete': False},
        ], ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        canonical = root / 'triggers.json'
        canonical.write_text(json.dumps({
            'counts': {'skills': 3, 'incomplete_skills': 1, 'routable_skills': 2},
            'skills': [
                {'name': 'broken-skill', 'origin': 'github', 'domain': 'general'},
                {'name': 'flagged-skill', 'origin': 'github', 'domain': 'general', 'incomplete': True},
                {'name': 'sample-skill', 'origin': 'github', 'domain': 'general'},
            ],
        }, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        return library, index, canonical

    def test_an_unflagged_dead_companion_is_reported_and_the_sample_is_excused(self):
        with tempfile.TemporaryDirectory() as tmp:
            library, index, canonical = self.build(Path(tmp))
            report = audit_module.audit(library=library, index=index, canonical=canonical)
            self.assertEqual(report['unflagged'], ['broken-skill'])
            self.assertEqual(report['code_sample'], 1, 'the fenced sample link must not be flagged')
            self.assertEqual(report['missing'], 2)
            self.assertEqual(report['missing_files'], 2)
            self.assertEqual(report['stale_flag'], [])
            self.assertEqual(report['source_line_mismatch'], [])

    def test_flagging_the_fixture_skill_clears_the_finding(self):
        with tempfile.TemporaryDirectory() as tmp:
            library, index, canonical = self.build(Path(tmp))
            entries = json.loads(index.read_text(encoding='utf-8'))
            entries[0]['incomplete'] = True
            entries[0]['missing_files'] = ['scripts/helper.sh']
            index.write_text(json.dumps(entries, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
            source = library / 'broken-skill' / 'SOURCE.md'
            source.write_text(source.read_text(encoding='utf-8') +
                              'INCOMPLETE: SKILL.md references files not present here (they live '
                              'elsewhere in the upstream repo or do not exist upstream): '
                              'scripts/helper.sh\n', encoding='utf-8')
            payload = json.loads(canonical.read_text(encoding='utf-8'))
            payload['skills'][0]['incomplete'] = True
            payload['counts'] = {'skills': 3, 'incomplete_skills': 2, 'routable_skills': 1}
            canonical.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
            report = audit_module.audit(library=library, index=index, canonical=canonical)
            self.assertEqual(report['unflagged'], [])
            self.assertEqual([report[key] for key in audit_module.PROBLEM_KEYS],
                             [[] for _ in audit_module.PROBLEM_KEYS])

    def test_a_recorded_missing_file_that_reappears_is_a_stale_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            library, index, canonical = self.build(Path(tmp))
            (library / 'flagged-skill' / 'references').mkdir()
            (library / 'flagged-skill' / 'references' / 'notes.md').write_text('# back\n', encoding='utf-8')
            report = audit_module.audit(library=library, index=index, canonical=canonical)
            self.assertEqual(len(report['stale_flag']), 1)
            self.assertIn('references/notes.md exist now', report['stale_flag'][0])


class CommandLineTests(unittest.TestCase):
    def run_script(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(SCRIPT), *args],
                              capture_output=True, text=True, timeout=300, cwd=ROOT)

    def test_the_cli_prints_the_acceptance_line_and_exits_zero(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('unflagged: []', result.stdout)
        self.assertIn('never downloads, rewrites or deletes', result.stdout)

    def test_check_and_json_modes_agree_with_the_report(self):
        checked = self.run_script('--check')
        self.assertEqual(checked.returncode, 0)
        self.assertEqual(checked.stdout.strip(), 'unflagged: [] · findings: 0')
        payload = json.loads(self.run_script('--json').stdout)
        report = audit_module.audit()
        for key in ('skills_scanned', 'links', 'missing', 'missing_files', 'flagged_incomplete', 'code_sample'):
            self.assertEqual(payload[key], report[key], key)
        self.assertEqual(payload['unflagged'], [])


if __name__ == '__main__':
    unittest.main()
