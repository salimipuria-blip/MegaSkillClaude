from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from _paths import REPO_ROOT, TOOLS_DIR
from hosts import HOSTS
from install_distilly import default_destination, install_skill


class DistillyInstallTest(unittest.TestCase):
    def test_default_destination_per_host(self) -> None:
        home = Path("/home/tester")
        self.assertEqual(
            default_destination("openclaw", home),
            home / ".openclaw" / "workspace" / "skills" / "distilly",
        )
        self.assertEqual(
            default_destination("hermes", home),
            home / ".hermes" / "skills" / "openclaw-imports" / "distilly",
        )
        self.assertEqual(default_destination("codex", home), home / ".agents" / "skills" / "distilly")
        with self.assertRaisesRegex(ValueError, "unsupported host"):
            default_destination("unknown", home)

    def test_install_skill_copies_only_the_package_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "source"
            destination = Path(tmp_dir) / "dest" / "distilly"
            (source / "prompts").mkdir(parents=True)
            (source / "tests").mkdir()
            (source / "package.json").write_text(
                json.dumps({"files": ["bin/", "SKILL.md", "prompts/"]}), encoding="utf-8"
            )
            (source / "SKILL.md").write_text("name: distilly\n", encoding="utf-8")
            (source / "prompts" / "intake.md").write_text("# Intake\n", encoding="utf-8")
            (source / "README.md").write_text("# Distilly\n", encoding="utf-8")
            (source / "tests" / "test_x.py").write_text("", encoding="utf-8")

            installed = install_skill(source, destination)
            self.assertEqual(installed, destination)
            self.assertEqual(
                sorted(path.name for path in destination.iterdir()), ["SKILL.md", "prompts"]
            )
            self.assertTrue((destination / "prompts" / "intake.md").exists())

    def test_installed_copy_without_package_json_reinstalls_whole(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "installed" / "distilly"
            destination = Path(tmp_dir) / "other" / "distilly"
            (source / "tools" / "__pycache__").mkdir(parents=True)
            (source / "SKILL.md").write_text("name: distilly\n", encoding="utf-8")
            (source / "tools" / "hosts.json").write_text("{}", encoding="utf-8")

            install_skill(source, destination)
            self.assertTrue((destination / "SKILL.md").exists())
            self.assertTrue((destination / "tools" / "hosts.json").exists())
            self.assertFalse((destination / "tools" / "__pycache__").exists())

    def test_install_skill_refuses_incomplete_payload_without_touching_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "source"
            destination = Path(tmp_dir) / "dest" / "distilly"
            source.mkdir()
            destination.mkdir(parents=True)
            (destination / "keep.txt").write_text("old install\n", encoding="utf-8")
            (source / "package.json").write_text(
                json.dumps({"files": ["SKILL.md", "prompts/"]}), encoding="utf-8"
            )
            (source / "SKILL.md").write_text("name: distilly\n", encoding="utf-8")

            with self.assertRaisesRegex(FileNotFoundError, "prompts"):
                install_skill(source, destination, force=True)
            self.assertTrue((destination / "keep.txt").exists())

    def test_real_install_for_every_host_matches_npm_cli(self) -> None:
        for host in HOSTS:
            with self.subTest(host=host), tempfile.TemporaryDirectory() as tmp_dir:
                env = {"HOME": tmp_dir, "PATH": "/usr/bin:/bin"}
                python = subprocess.run(
                    [sys.executable, str(TOOLS_DIR / "install_distilly.py"), "--host", host],
                    env=env, capture_output=True, text=True, check=True,
                )
                target = Path(python.stdout.strip())
                self.assertEqual(target, default_destination(host, Path(tmp_dir)))
                python_files = sorted(p.relative_to(target).as_posix() for p in target.rglob("*"))
                self.assertIn("SKILL.md", python_files)
                self.assertFalse(any(name.startswith(("tests", "docs", ".github", "bin")) for name in python_files))

                node_bin = shutil.which("node")
                if node_bin is None:
                    continue
                node = subprocess.run(
                    [node_bin, str(REPO_ROOT / "bin" / "distilly.mjs"), "install", host, "--force"],
                    env=env, capture_output=True, text=True,
                )
                self.assertEqual(node.returncode, 0, node.stderr)
                # A dev checkout has tools/__pycache__ that npm would ship but the Python installer skips.
                node_files = sorted(
                    p.relative_to(target).as_posix()
                    for p in target.rglob("*")
                    if "__pycache__" not in p.parts
                )
                self.assertEqual(node_files, python_files)

    def test_install_skill_dry_run_does_not_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "source"
            destination = Path(tmp_dir) / "dest" / "distilly"
            source.mkdir()
            (source / "SKILL.md").write_text("name: distilly\n", encoding="utf-8")

            install_skill(source, destination, dry_run=True)
            self.assertFalse(destination.exists())

    def test_install_skill_dry_run_allows_existing_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "source"
            destination = Path(tmp_dir) / "dest" / "distilly"
            source.mkdir(parents=True)
            destination.mkdir(parents=True)
            (source / "SKILL.md").write_text("name: distilly\n", encoding="utf-8")

            result = install_skill(source, destination, dry_run=True)
            self.assertEqual(result, destination)
            self.assertTrue(destination.exists())

    def test_install_skill_does_not_delete_source_when_it_is_already_the_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "distilly"
            source.mkdir()
            skill_file = source / "SKILL.md"
            skill_file.write_text("name: distilly\n", encoding="utf-8")

            result = install_skill(source, source, force=True)

            self.assertEqual(result, source)
            self.assertTrue(skill_file.exists())

    def test_install_skill_rejects_nested_or_ancestor_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            source = root / "parent" / "source"
            source.mkdir(parents=True)
            skill_file = source / "SKILL.md"
            skill_file.write_text("name: distilly\n", encoding="utf-8")
            nested = source / ".hermes" / "skills" / "distilly"

            with self.assertRaisesRegex(ValueError, "must not overlap"):
                install_skill(source, nested, force=True)
            with self.assertRaisesRegex(ValueError, "must not overlap"):
                install_skill(source, source.parent, force=True)

            self.assertTrue(skill_file.exists())
            self.assertFalse(nested.exists())


if __name__ == "__main__":
    unittest.main()
