"""Tests for the skill quality report (backlog task 93).

Task 93 asks for a per-SKILL.md report of length, workflow, checklist and defined output, with the
50 weakest listed, and for a test of the script. These tests pin three things: every signal earns
exactly the points its documented rule says (fixtures, including the fence shapes that broke the
first draft), the committed report is byte-for-byte what a fresh run produces and every number in
its tables can be re-derived from the tree, and the fence rule is the *same function* the link audit
uses, so the two tools cannot drift apart again.
"""
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/report_skill_quality.py'
AUDIT_SCRIPT = ROOT / 'scripts/check_skill_links.py'
REPORT = ROOT / 'library/QUALITY_REPORT.md'
LIBRARY = ROOT / 'library'
CANONICAL = ROOT / '.claude/skills/mega-skills-router/references/triggers.json'

_spec = importlib.util.spec_from_file_location('report_skill_quality', SCRIPT)
quality = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(quality)
_audit_spec = importlib.util.spec_from_file_location('check_skill_links', AUDIT_SCRIPT)
audit = importlib.util.module_from_spec(_audit_spec)
_audit_spec.loader.exec_module(audit)


class FixtureQualityTests(unittest.TestCase):
    """Scoring rules, measured on purpose-built skills in a throwaway tree."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self._real_root = quality.ROOT
        quality.ROOT = self.root
        self.addCleanup(setattr, quality, 'ROOT', self._real_root)

    def write_skill(self, relative: str, body: str, *, name: str = 'demo') -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f'---\nname: {name}\ndescription: a fixture skill\n---\n\n{body}',
                        encoding='utf-8')
        return path

    @staticmethod
    def filler(words: int) -> str:
        return ' '.join(f'w{i}' for i in range(words))

    def write_index(self, entries: list[dict[str, object]]) -> Path:
        path = self.root / 'index.json'
        path.write_text(json.dumps({'counts': {}, 'skills': entries}, ensure_ascii=False),
                        encoding='utf-8')
        return path

    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(SCRIPT), *arguments],
                              capture_output=True, text=True, cwd=str(ROOT))

    # -- length -------------------------------------------------------------

    def test_length_points_follow_the_documented_bands(self):
        for words, expected in ((0, 0), (39, 0), (40, 6), (99, 6), (100, 13), (199, 13),
                                (200, 20), (399, 20), (400, 25), (5000, 25)):
            with self.subTest(words=words):
                path = self.write_skill('library/github-skills/len/SKILL.md', self.filler(words))
                row = quality.measure(path, None)
                self.assertEqual(row['words'], words, 'prose words must exclude frontmatter')
                self.assertEqual(row['points']['length'], expected)

    # -- workflow, checklist, output, structure, example --------------------

    def test_workflow_steps_beat_a_workflow_heading_which_beats_bullets(self):
        bodies = {
            'ordered-steps': '## Anything\n\n1. first step\n2. second step\n3. third step\n',
            'workflow-heading': '## Workflow\n\nDo the thing carefully and completely.\n',
            'bullets-only': '## Anything\n\n- one item\n- two items\n- three items\n',
            'none': '## Anything\n\nDo the thing carefully and completely.\n',
        }
        points = {'ordered-steps': 25, 'workflow-heading': 15, 'bullets-only': 6, 'none': 0}
        for kind, body in bodies.items():
            with self.subTest(workflow=kind):
                row = quality.measure(
                    self.write_skill('library/github-skills/wf/SKILL.md', body), None)
                self.assertEqual(row['workflow'], kind)
                self.assertEqual(row['points']['workflow'], points[kind])

    def test_output_and_checklist_points_follow_the_documented_rules(self):
        outputs = (('## Expected output\n\nHand the JSON back.\n', 'output-heading', 20),
                   ('## Notes\n\nThis step returns the JSON payload.\n', 'output-prose', 12),
                   ('## Notes\n\nNothing more to say here.\n', 'none', 0))
        for body, kind, expected in outputs:
            with self.subTest(output=kind):
                row = quality.measure(self.write_skill('library/github-skills/o/SKILL.md', body), None)
                self.assertEqual((row['output'], row['points']['output']), (kind, expected))
        checklists = (('- [ ] read the docs\n- [x] run the tests\n', 'checkboxes', 15),
                      ('## Checklist\n\nRead the docs before shipping.\n', 'checklist-heading', 10),
                      ('## Notes\n\nRead the docs before shipping.\n', 'none', 0))
        for body, kind, expected in checklists:
            with self.subTest(checklist=kind):
                row = quality.measure(self.write_skill('library/github-skills/c/SKILL.md', body), None)
                self.assertEqual((row['checklist'], row['points']['checklist']), (kind, expected))

    def test_structure_and_example_points_and_the_documented_maximum(self):
        self.assertEqual(sum(quality.WEIGHTS.values()), 100, 'the weights must add up to 100')
        two = quality.measure(self.write_skill('library/github-skills/s/SKILL.md',
                                               '## One\n\ntext\n\n## Two\n\ntext\n'), None)
        one = quality.measure(self.write_skill('library/github-skills/s/SKILL.md',
                                               '## One\n\ntext\n'), None)
        none = quality.measure(self.write_skill('library/github-skills/s/SKILL.md', 'text only\n'), None)
        self.assertEqual([two['points']['structure'], one['points']['structure'],
                          none['points']['structure']], [10, 5, 0])
        with_example = quality.measure(self.write_skill('library/github-skills/e/SKILL.md',
                                                        '## One\n\n```bash\nls\n```\n'), None)
        self.assertEqual([with_example['points']['example'], none['points']['example']], [5, 0])
        full = ('## Workflow\n\n' + self.filler(400) + '\n\n1. one\n2. two\n3. three\n\n'
                '## Checklist\n\n- [ ] verify\n\n## Output\n\n```json\n{}\n```\n')
        best = quality.measure(self.write_skill('library/github-skills/best/SKILL.md', full), None)
        self.assertEqual(best['score'], 100, 'a skill with every signal must reach the maximum')

    # -- the incomplete penalty --------------------------------------------

    def test_an_incomplete_flag_costs_ten_points_and_the_floor_is_zero(self):
        body = '## Workflow\n\n' + self.filler(220) + '\n\n1. one\n2. two\n3. three\n'
        path = self.write_skill('library/github-skills/demo/SKILL.md', body)
        entry = {'name': 'demo', 'domain': 'general', 'incomplete': True,
                 'source_path': 'library/github-skills/demo/SKILL.md'}
        flagged = quality.measure(path, entry)
        clean = quality.measure(path, None)
        self.assertEqual(clean['score'] - flagged['score'], quality.INCOMPLETE_PENALTY)
        self.assertEqual(flagged['domain'], 'general')
        self.assertEqual(flagged['source'], 'imported')
        self.assertIn('incomplete', flagged['missing'])
        stub = self.write_skill('library/github-skills/stub/SKILL.md', 'Call the other skill.')
        self.assertEqual(quality.measure(stub, {'incomplete': True})['score'], 0,
                         'the penalty must not push a score below zero')

    # -- fences -------------------------------------------------------------

    def test_content_inside_a_closed_fence_is_a_sample_not_an_instruction(self):
        body = ('## Title\n\nReal prose.\n\n```markdown\n1. fake step\n2. fake step\n'
                '3. fake step\n- [ ] fake box\n## Fake heading\n```\n')
        row = quality.measure(self.write_skill('library/github-skills/f/SKILL.md', body), None)
        self.assertEqual(row['workflow'], 'none')
        self.assertEqual(row['checklist'], 'none')
        self.assertEqual(row['points']['structure'], 5, 'only the real heading counts')
        self.assertTrue(row['example'])
        self.assertFalse(row['unclosed_fence'])
        self.assertLess(row['words'], 20, 'sample text must not be counted as prose')

    def test_a_four_backtick_fence_is_not_closed_by_three(self):
        body = ('# Real heading\n\n````markdown\n```bash\nrm -rf /tmp/whatever\n```\n````\n\n'
                '1. one step\n2. two steps\n3. three steps\n')
        row = quality.measure(self.write_skill('library/github-skills/f4/SKILL.md', body), None)
        self.assertEqual(row['workflow'], 'ordered-steps', 'the steps are outside the wrapper')
        self.assertFalse(row['unclosed_fence'], 'CommonMark closes a 4-backtick fence with 4')
        self.assertNotIn('rm', json.dumps(row), 'sample content must not leak into the row')

    def test_an_indented_fence_four_spaces_in_is_not_a_fence_at_all(self):
        body = ('```text\nouter sample\n\n    ```\n    still the sample\n    ```\n\n```\n\n'
                '1. one step\n2. two steps\n3. three steps\n')
        row = quality.measure(self.write_skill('library/github-skills/ind/SKILL.md', body), None)
        self.assertFalse(row['unclosed_fence'])
        self.assertEqual(row['workflow'], 'ordered-steps')
        self.assertNotIn('still', ' '.join(str(v) for v in row.values() if isinstance(v, str)))

    def test_an_unclosed_fence_tail_is_excluded_and_flagged(self):
        body = '## Title\n\nReal prose here.\n\n```python\nimport os\n1. not a step\n'
        row = quality.measure(self.write_skill('library/github-skills/u/SKILL.md', body), None)
        self.assertTrue(row['unclosed_fence'])
        self.assertIn('unclosed-fence', row['missing'])
        self.assertEqual(row['workflow'], 'none', 'an ambiguous tail earns nothing')
        self.assertFalse(row['example'], 'nothing was closed')

    def test_a_whole_body_wrapper_fence_is_peeled_and_recorded(self):
        inner = '# Create Cards\n\n' + self.filler(120) + '\n\n1. one\n2. two\n3. three\n'
        row = quality.measure(
            self.write_skill('library/github-skills/wrapped/SKILL.md', '````prompt\n' + inner + '````\n'),
            None)
        self.assertEqual(row['wrapper'], 'prompt')
        self.assertGreater(row['words'], 100, 'converter artefacts must not measure as empty')
        self.assertEqual(row['workflow'], 'ordered-steps')
        self.assertFalse(row['unclosed_fence'])
        partial = quality.measure(
            self.write_skill('library/github-skills/half/SKILL.md',
                             'Lead-in prose.\n\n````prompt\nwrapped only in part\n````\n'), None)
        self.assertEqual(partial['wrapper'], '', 'a wrapper is peeled only when it is the whole body')

    # -- index join, ordering, CLI -----------------------------------------

    def test_the_index_join_uses_source_path_not_the_folder_name(self):
        body = '## Workflow\n\n1. one\n2. two\n3. three\n'
        self.write_skill('library/skills/twin/SKILL.md', body)
        self.write_skill('library/github-skills/twin/SKILL.md', body)
        index = self.write_index([
            {'name': 'twin', 'domain': 'skill-development', 'source_path': 'library/skills/twin/SKILL.md'},
            {'name': 'mp-twin', 'domain': 'web-development', 'incomplete': True,
             'source_path': 'library/github-skills/twin/SKILL.md'},
        ])
        result = quality.survey(self.root / 'library', index, limit=10)
        rows = {row['path']: row for row in result['rows']}
        self.assertEqual(rows['library/skills/twin/SKILL.md']['domain'], 'skill-development')
        self.assertEqual(rows['library/skills/twin/SKILL.md']['source'], 'curated')
        self.assertEqual(rows['library/github-skills/twin/SKILL.md']['domain'], 'web-development')
        self.assertEqual(rows['library/github-skills/twin/SKILL.md']['source'], 'imported')
        self.assertTrue(rows['library/github-skills/twin/SKILL.md']['incomplete'],
                        'two folders may share a name; the join must not confuse them')
        self.assertEqual(result['coverage']['unindexed'], 0)

    def test_weakest_rows_are_ordered_by_score_then_words_then_path(self):
        for folder, words in (('ccc', 50), ('bbb', 40), ('aaa', 40)):
            self.write_skill(f'library/github-skills/{folder}/SKILL.md', self.filler(words))
        result = quality.survey(self.root / 'library', None, limit=10)
        self.assertEqual([row['path'] for row in result['weakest']],
                         ['library/github-skills/aaa/SKILL.md',
                          'library/github-skills/bbb/SKILL.md',
                          'library/github-skills/ccc/SKILL.md'])

    def test_the_command_line_rejects_bad_input_and_emits_json(self):
        self.assertEqual(self.run_cli('--target', 'library/does-not-exist').returncode, 2)
        empty = self.root / 'nothing'
        empty.mkdir()
        self.assertEqual(self.run_cli('--target', str(empty)).returncode, 2)
        self.assertEqual(self.run_cli('--target', str(self.root), '--limit', '0').returncode, 2)
        self.write_skill('library/github-skills/one/SKILL.md', '## Workflow\n\n1. one\n2. two\n3. three\n')
        done = self.run_cli('--target', str(self.root / 'library'), '--json')
        self.assertEqual(done.returncode, 0, done.stderr)
        payload = json.loads(done.stdout)
        self.assertEqual(payload['scanned'], 1)
        self.assertNotIn('rows', payload, 'full rows need --verbose')
        verbose = json.loads(self.run_cli('--target', str(self.root / 'library'), '--json',
                                          '--verbose').stdout)
        self.assertEqual(len(verbose['rows']), 1)

    def test_check_mode_fails_on_a_one_byte_change(self):
        self.write_skill('library/github-skills/one/SKILL.md', '## Workflow\n\n1. one\n2. two\n3. three\n')
        report = self.root / 'QUALITY_REPORT.md'
        wrote = self.run_cli('--target', str(self.root / 'library'), '--report', str(report))
        self.assertEqual(wrote.returncode, 0, wrote.stderr)
        self.assertEqual(self.run_cli('--target', str(self.root / 'library'), '--report',
                                      str(report), '--check').returncode, 0)
        report.write_bytes(report.read_bytes() + b' ')
        drifted = self.run_cli('--target', str(self.root / 'library'), '--report',
                               str(report), '--check')
        self.assertEqual(drifted.returncode, 1, 'a hand-edited report must fail the drift gate')
        self.assertIn('DRIFT', drifted.stderr)


class RealLibraryReportTests(unittest.TestCase):
    """The committed report, checked against a fresh measurement of the real tree."""

    @classmethod
    def setUpClass(cls):
        cls.result = quality.survey(LIBRARY, CANONICAL, limit=50)
        cls.committed = REPORT.read_text(encoding='utf-8')
        cls.counts = json.loads(CANONICAL.read_text(encoding='utf-8'))['counts']

    def test_the_population_is_every_library_skill_and_all_of_it_is_indexed(self):
        on_disk = sorted(str(path.relative_to(ROOT)) for path in LIBRARY.rglob('SKILL.md'))
        self.assertEqual(self.result['scanned'], len(on_disk))
        self.assertEqual(self.result['scanned'], 3029, 'library/skills (18) + library/github-skills (3,011)')
        self.assertEqual([row['path'] for row in sorted(self.result['rows'],
                                                        key=lambda row: row['path'])], on_disk)
        self.assertEqual(self.result['coverage']['unindexed'], 0,
                         'every library skill must be joinable to the router index')

    def test_the_committed_report_is_what_a_fresh_run_produces(self):
        self.assertEqual(self.committed, quality.render_report(self.result))
        checked = subprocess.run([sys.executable, str(SCRIPT), '--check'],
                                 capture_output=True, text=True, cwd=str(ROOT))
        self.assertEqual(checked.returncode, 0, checked.stderr)

    def test_every_reported_number_can_be_re_derived_from_the_tree(self):
        """No table in the report may carry a number the tree does not produce."""
        scope = dict(re.findall(r'^\| ([^|]+?) \| ([^|]+?) \|$', self.committed, re.M))
        self.assertEqual(scope['SKILL.md files'], f"{self.result['scanned']:,}")
        self.assertEqual(scope['bytes'], f"{self.result['bytes']:,}")
        self.assertEqual(scope['score (min / median / mean / max)'],
                         f"{self.result['scores']['min']} / {self.result['scores']['median']} / "
                         f"{self.result['scores']['mean']} / {self.result['scores']['max']}")
        coverage = {label: int(count.replace(',', '')) for label, count in re.findall(
            r'^\| ([^|]+?) \| ([\d,]+) \| [\d.]+% \|$', self.committed, re.M)}
        self.assertGreaterEqual(len(coverage), 12, 'the coverage table must stay complete')
        self.assertEqual(coverage['frontmatter `name`'], self.result['coverage']['frontmatter_name'])
        self.assertEqual(coverage['workflow: ordered steps'], self.result['coverage']['workflow_ordered'])
        self.assertEqual(coverage['checklist: `- [ ]` items'], self.result['coverage']['checklist_boxes'])
        self.assertEqual(coverage['defined output: heading'], self.result['coverage']['output_heading'])
        self.assertEqual(coverage['flagged `incomplete` (penalised)'], self.result['coverage']['incomplete'])
        self.assertEqual(coverage['ends inside an open fence'], self.result['coverage']['unclosed_fence'])
        self.assertIn(f"all {self.result['index_skills']:,} indexed skills", self.committed,
                      'the widened-scope sentence must quote the index, not a remembered number')
        peeled = max(int(row['words']) for row in self.result['rows'] if row['wrapper'])
        self.assertIn(f'{peeled:,} words of prose inside the largest of them', self.committed)
        bands = {band: int(count.replace(',', '')) for band, count in re.findall(
            r'^\| `(\w+)` \| [\d–]+ \| ([\d,]+) \| [\d.]+% \|$', self.committed, re.M)}
        self.assertEqual(bands, self.result['bands'])
        self.assertEqual(sum(bands.values()), self.result['scanned'], 'bands must partition the population')

    def test_every_path_the_report_names_exists(self):
        """A report that cites a file is making a claim; this checks each one."""
        named = set(re.findall(r'`((?:library|scripts|\.claude|docs|mobile)/[^`\s]+)`', self.committed))
        self.assertGreaterEqual(len(named), 5, 'the report should cite the tools and trees it used')
        for token in sorted(named):
            candidate = token.split(':')[0].rstrip('.')
            with self.subTest(path=candidate):
                self.assertTrue((ROOT / candidate).exists(),
                                'the report names a path that is not in the repository')

    def test_the_weakest_table_lists_real_files_in_ascending_order(self):
        rows = re.findall(r'^\| (\d+) \| (\d+) \| `(\w+)` \| ([\d,]+) \| .*? \| `([^`]+)` \| (.*) \|$',
                          self.committed, re.M)
        self.assertEqual(len(rows), 50, 'task 93 asks for the 50 weakest')
        scores = []
        for position, score, band, words, path, missing in rows:
            with self.subTest(skill=path):
                self.assertTrue((ROOT / path).is_file(), 'every listed skill must exist')
                self.assertEqual(int(position), len(scores) + 1)
                self.assertEqual(band, quality.band_of(int(score)))
                scores.append(int(score))
        self.assertEqual(scores, sorted(scores), 'weakest first')
        self.assertEqual(scores, [int(row['score']) for row in self.result['weakest']])
        self.assertEqual([path for _, _, _, _, path, _ in rows],
                         [row['path'] for row in self.result['weakest']])
        self.assertIn('short', rows[0][5], 'the top row must say what is missing')

    def test_every_score_is_the_sum_of_its_own_points(self):
        for row in self.result['rows']:
            expected = sum(row['points'].values())
            if row['incomplete']:
                expected -= quality.INCOMPLETE_PENALTY
            with self.subTest(skill=row['path']):
                self.assertEqual(row['score'], max(0, expected))
                self.assertLessEqual(row['score'], sum(quality.WEIGHTS.values()))
                for signal, points in row['points'].items():
                    self.assertLessEqual(points, quality.WEIGHTS[signal])

    def test_the_incomplete_column_agrees_with_the_link_audit(self):
        self.assertEqual(self.result['coverage']['incomplete'], self.counts['incomplete_skills'],
                         'the report must not carry its own idea of what incomplete means')
        self.assertEqual(self.counts['incomplete_skills'], 284)
        self.assertEqual(self.counts['skills'] - self.counts['incomplete_skills'],
                         self.counts['routable_skills'])

    def test_the_fence_rule_is_imported_from_the_link_audit_and_agrees_with_it(self):
        """One definition, proven two ways: where it was loaded from, and how it behaves."""
        loaded = sys.modules.get(getattr(quality.CODE_REGIONS, '__module__', ''))
        self.assertIsNotNone(loaded, 'the shared fence module must be registered')
        self.assertEqual(Path(loaded.__file__).resolve(), AUDIT_SCRIPT.resolve())
        shapes = [
            ['# Real heading', '', '````markdown', '```bash', 'rm -rf /tmp/x', '```', '````', '', '1. one'],
            ['```text', 'sample', '', '    ```', '    nested sample', '    ```', '', '```', '', 'prose'],
            ['## Title', '', '```python', 'import os', '1. never closed'],
            ['~~~', 'tilde sample', '~~~', '', '```', 'backtick sample', '```'],
            ['```', 'opens', '~~~', 'a different marker is content', '```', 'closes'],
        ]
        for lines in shapes:
            with self.subTest(shape=lines[0]):
                self.assertEqual(quality.CODE_REGIONS(lines), audit.code_regions(lines))
        self.assertIs(quality.FENCE_RE, audit.FENCE)
        # Measured reality, pinned so a regression in the shared rule cannot slip through by moving
        # the report and the survey together: 16 imported skills really do end inside an open fence
        # (`runbook-creation` swallows 215 lines that way) and 3 really are whole-body wrappers.
        self.assertEqual(self.result['coverage']['unclosed_fence'], 16)
        self.assertEqual(self.result['coverage']['wrapped_body'], 3)
        self.assertIn('library/github-skills/runbook-creation/SKILL.md',
                      {row['path'] for row in self.result['rows'] if row['unclosed_fence']})
        self.assertIn('library/github-skills/mcp-create-adaptive-cards/SKILL.md',
                      {row['path'] for row in self.result['rows'] if row['wrapper']})

    def test_a_stub_is_weaker_than_the_curated_skills_and_both_halves_are_measured(self):
        by_path = {row['path']: row for row in self.result['rows']}
        stub = by_path['library/github-skills/grill-me/SKILL.md']
        self.assertEqual(stub['score'], 0, 'a one-line hand-off skill has no structure to measure')
        self.assertIn(stub['path'], [row['path'] for row in self.result['weakest']])
        self.assertEqual(self.result['by_source']['curated']['skills'], 18)
        self.assertEqual(self.result['by_source']['imported']['skills'], 3011)
        self.assertLess(self.result['by_source']['imported']['mean'],
                        self.result['by_source']['curated']['mean'],
                        'the 18 skills this repo wrote are the structural benchmark for the imports')


if __name__ == '__main__':
    unittest.main()
