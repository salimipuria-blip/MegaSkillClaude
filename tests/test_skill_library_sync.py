"""The portable plugin is generated data, never a second independently edited library."""
import json
import tempfile
import unittest
from pathlib import Path

from scripts.sync_skill_library import PROJECT, PLUGIN, annotate, synchronize


def fixture(root):
    skills = [
        {'name': 'core-fixture', 'domain': 'general', 'source_path': 'psk/data/skills/core-fixture/SKILL.md', 'triggers': ['core']},
        {'name': 'github-fixture', 'domain': 'general', 'source_path': 'library/github-skills/github-fixture/SKILL.md', 'triggers': ['github'], 'origin': 'github'},
    ]
    index = root / PROJECT / 'references/triggers.json'
    index.parent.mkdir(parents=True)
    index.write_text(json.dumps({'counts': {'skills': 2, 'triggers': 2}, 'skills': skills}))
    for skill in skills:
        path = root / skill['source_path']
        path.parent.mkdir(parents=True)
        path.write_text(f"# {skill['name']}\nfixture instructions\n")
    library = root / 'library/github-skills'
    (library / 'INDEX.json').write_text(json.dumps([{'name': 'github-fixture', 'incomplete': True}]))
    (library / 'github-fixture/SOURCE.md').write_text('fixture provenance\n')
    (library / 'github-fixture/scripts').mkdir()
    (library / 'github-fixture/scripts/tool.py').write_text("raise RuntimeError('must never be executed by the generator')\n")
    (library / '_licenses').mkdir()
    (library / '_licenses/fixture_LICENSE').write_text('fixture license\n')
    return index


class SkillLibrarySyncTest(unittest.TestCase):
    def test_annotation_is_pure_and_counts_routable_skills(self):
        source = {'counts': {'skills': 2}, 'skills': [
            {'name': 'broken', 'origin': 'github'}, {'name': 'good', 'origin': 'github', 'incomplete': True},
        ]}
        result = annotate(source, [{'name': 'broken', 'incomplete': True}, {'name': 'good', 'incomplete': False}])
        self.assertTrue(result['skills'][0]['incomplete'])
        self.assertNotIn('incomplete', result['skills'][1])
        self.assertEqual(result['counts']['routable_skills'], 1)
        self.assertNotIn('incomplete', source['skills'][0])

    def test_check_is_read_only_and_generation_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = fixture(root)
            original = index.read_bytes()
            self.assertTrue(synchronize(root, check=True))
            self.assertEqual(index.read_bytes(), original)
            self.assertFalse((root / PLUGIN).exists())
            self.assertTrue(synchronize(root))
            self.assertEqual(synchronize(root, check=True), [])
            self.assertEqual(synchronize(root), [])
            instructions = root / PLUGIN / 'references/skills/github-fixture/INSTRUCTIONS.md'
            self.assertEqual(instructions.read_bytes(), (root / 'library/github-skills/github-fixture/SKILL.md').read_bytes())
            self.assertTrue((instructions.parent / 'scripts/tool.py').is_file())
            self.assertTrue((root / PLUGIN / 'references/licenses/fixture_LICENSE').is_file())
            self.assertIn('incomplete: excluded', (root / PLUGIN / 'references/domains/general.md').read_text())

    def test_drift_is_detected_repaired_and_unrecognized_files_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            synchronize(root)
            target = root / PLUGIN / 'references/skills/github-fixture/SOURCE.md'
            target.write_text('stale copy')
            custom = target.parent / 'custom.keep'
            custom.write_text('do not delete')
            self.assertIn(str(target.relative_to(root)), synchronize(root, check=True))
            synchronize(root)
            self.assertEqual(target.read_text(), 'fixture provenance\n')
            self.assertEqual(custom.read_text(), 'do not delete')

    def test_invalid_sources_are_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            index = fixture(root)
            data = json.loads(index.read_text())
            for path in ['../outside/SKILL.md', 'psk/data/skills/../../../.git/SKILL.md']:
                data['skills'][0]['source_path'] = path
                index.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, 'invalid canonical source|path escapes repository'):
                    synchronize(root)
            self.assertFalse((root / PLUGIN).exists())


if __name__ == '__main__':
    unittest.main()
