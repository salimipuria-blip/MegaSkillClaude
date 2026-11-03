from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401  (puts tools/ on sys.path)
from install_generated_skill import default_skills_dir
from install_generated_skill_common import install_generated_skill
import skill_writer


class GeneratedSkillInstallTest(unittest.TestCase):
    def create_legacy_skill(self, root: Path) -> Path:
        skill_dir = skill_writer.create_skill(
            root,
            "mireille",
            {"character": "relationship", "name": "Mireille"},
            "Work body",
            "Persona body",
        )
        skill_path = skill_dir / "SKILL.md"
        skill_path.write_text(
            skill_path.read_text(encoding="utf-8").replace(
                "name: relationship-mireille",
                "name: relationship_mireille",
                1,
            ),
            encoding="utf-8",
        )
        meta_path = skill_dir / "meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta.pop("artifacts", None)
        meta_path.write_text(json.dumps(meta), encoding="utf-8")
        return skill_dir

    def test_default_skills_dirs_cover_all_documented_hosts(self) -> None:
        home = Path("/example/home")
        expected = {
            "claude-code": home / ".claude" / "skills",
            "openclaw": home / ".openclaw" / "workspace" / "skills",
            "hermes": home / ".hermes" / "skills" / "distilly-generated",
            "codex": home / ".agents" / "skills",
            "deepseek-harness": home / ".dsh" / "skills",
            "pi": home / ".pi" / "agent" / "skills",
            "grok-build": home / ".grok" / "skills",
            "opencode": home / ".config" / "opencode" / "skills",
        }
        self.assertEqual(
            {host: default_skills_dir(host, home, {}) for host in expected},
            expected,
        )
        self.assertEqual(
            default_skills_dir(
                "deepseek-harness",
                home,
                {"DSH_HOME": "/custom/dsh"},
            ),
            Path("/custom/dsh/skills"),
        )

    def test_install_rewrites_only_the_legacy_copy_to_canonical_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            source = self.create_legacy_skill(root / "generated")
            skills_dir = root / ".hermes" / "skills" / "distilly-generated"

            result = install_generated_skill(
                source,
                skills_dir,
                force=True,
                host="hermes",
            )

            installed = result["skill_dir"]
            self.assertEqual(installed.name, "relationship-mireille")
            self.assertEqual(
                {path.name for path in installed.iterdir()},
                {"SKILL.md", ".distilly-install.json"},
            )
            self.assertIn(
                "name: relationship-mireille",
                (installed / "SKILL.md").read_text(encoding="utf-8"),
            )
            self.assertIn(
                "name: relationship_mireille",
                (source / "SKILL.md").read_text(encoding="utf-8"),
            )

    def test_install_rejects_ancestor_or_descendant_destinations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            source = self.create_legacy_skill(root / "generated")

            with self.assertRaisesRegex(ValueError, "must not overlap"):
                install_generated_skill(
                    source,
                    source,
                    force=True,
                    host="test",
                )

            ancestor_install = root / "host" / "relationship-bundle"
            ancestor_install.mkdir(parents=True)
            nested_source = ancestor_install / "bundle"
            source.rename(nested_source)
            with self.assertRaisesRegex(ValueError, "must not overlap"):
                install_generated_skill(
                    nested_source,
                    ancestor_install.parent,
                    force=True,
                    host="test",
                )

            self.assertTrue((nested_source / "meta.json").exists())
            self.assertTrue((nested_source / "work.md").exists())


if __name__ == "__main__":
    unittest.main()
