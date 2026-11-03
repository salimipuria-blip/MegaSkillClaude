from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401  (puts tools/ on sys.path)
from install_distilly import install_skill
from install_generated_skill_common import install_generated_skill
import skill_writer


class OpenClawAndCodexInstallTest(unittest.TestCase):
    def test_openclaw_and_codex_repo_installers_copy_repo_layout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            source = tmp_root / "source"
            source.mkdir()
            (source / "SKILL.md").write_text("name: distilly\n", encoding="utf-8")
            (source / "package.json").write_text('{"files": ["SKILL.md"]}', encoding="utf-8")

            openclaw_dest = tmp_root / "openclaw" / "distilly"
            codex_dest = tmp_root / "agents" / "distilly"

            installed_openclaw = install_skill(source, openclaw_dest)
            installed_codex = install_skill(source, codex_dest)

            self.assertEqual(installed_openclaw, openclaw_dest)
            self.assertEqual(installed_codex, codex_dest)
            self.assertTrue((openclaw_dest / "SKILL.md").exists())
            self.assertTrue((codex_dest / "SKILL.md").exists())

    def test_repo_installers_do_not_delete_source_when_it_is_already_the_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "distilly"
            source.mkdir()
            skill_file = source / "SKILL.md"
            skill_file.write_text("name: distilly\n", encoding="utf-8")

            self.assertEqual(install_skill(source, source, force=True), source)
            self.assertTrue(skill_file.exists())

    def test_repo_installers_reject_nested_or_ancestor_destinations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            source = root / "parent" / "source"
            source.mkdir(parents=True)
            skill_file = source / "SKILL.md"
            skill_file.write_text("name: distilly\n", encoding="utf-8")
            nested = source / ".agents" / "skills" / "distilly"

            with self.assertRaisesRegex(ValueError, "must not overlap"):
                install_skill(source, nested, force=True)
            with self.assertRaisesRegex(ValueError, "must not overlap"):
                install_skill(source, source.parent, force=True)

            self.assertTrue(skill_file.exists())
            self.assertFalse(nested.exists())

    def test_openclaw_generated_skill_installer_writes_host_skill_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            generated_root = tmp_root / "skills" / "relationship"
            openclaw_skills = tmp_root / ".openclaw" / "workspace" / "skills"

            skill_dir = skill_writer.create_skill(
                generated_root,
                "mireille",
                {
                    "character": "relationship",
                    "name": "Mireille",
                },
                "Work body",
                "Persona body",
            )

            result = install_generated_skill(
                skill_dir,
                openclaw_skills,
                force=True,
                host="openclaw",
            )

            installed_file = openclaw_skills / "relationship-mireille" / "SKILL.md"
            metadata_file = openclaw_skills / "relationship-mireille" / ".distilly-install.json"

            self.assertEqual(result["command_name"], "relationship-mireille")
            self.assertTrue(installed_file.exists())
            self.assertTrue(metadata_file.exists())
            self.assertIn(
                "name: relationship-mireille",
                installed_file.read_text(encoding="utf-8"),
            )

    def test_codex_generated_skill_installer_writes_host_skill_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            generated_root = tmp_root / "skills" / "celebrity"
            codex_skills = tmp_root / ".agents" / "skills"

            skill_dir = skill_writer.create_skill(
                generated_root,
                "zhou-qimo",
                {
                    "character": "celebrity",
                    "name": "周奇墨",
                    "classification": {"language": "zh-CN"},
                },
                "Work body",
                "Persona body",
            )

            result = install_generated_skill(
                skill_dir,
                codex_skills,
                force=True,
                host="codex",
            )

            installed_file = codex_skills / "celebrity-zhou-qimo" / "SKILL.md"
            metadata_file = codex_skills / "celebrity-zhou-qimo" / ".distilly-install.json"

            self.assertEqual(result["command_name"], "celebrity-zhou-qimo")
            self.assertTrue(installed_file.exists())
            self.assertTrue(metadata_file.exists())
            self.assertIn(
                "name: celebrity-zhou-qimo",
                installed_file.read_text(encoding="utf-8"),
            )


if __name__ == "__main__":
    unittest.main()
