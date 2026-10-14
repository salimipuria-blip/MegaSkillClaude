"""Dependency-free safety regressions for PR 1; never use real secrets/services."""
import json
import os
from pathlib import Path
import re
import shutil
import shlex
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
HEALTH = ROOT / 'scripts/repo_health_check.sh'
CI = ROOT / '.github/workflows/ci.yml'


class HealthCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='repo health ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'repo with spaces'
        self.root.mkdir()
        # Materialize only prerequisites, not a checkout or real application code.
        files = [
            'README.md', '.env.example', '.github/workflows/ci.yml',
            '.github/dependabot.yml', '.github/CODEOWNERS',
            '.github/RELEASE_CHECKLIST.md', '.github/PROJECT_MANAGEMENT.md',
            '.github/ISSUE_TEMPLATE/bug_report.md',
            '.github/ISSUE_TEMPLATE/feature_request.md',
            '.github/ISSUE_TEMPLATE/tasks.md', '.github/ISSUE_TEMPLATE/config.yml',
            'docs/ROADMAP_90D.md', 'psk/package.json', 'lithos/package.json',
            'fjcod/package.json', 'fjcod/package-lock.json',
            'bison-brand-book/package.json', 'bison-brand-book/package-lock.json',
            'hermes/package.json', 'hermes/package-lock.json', 'hermes/setup.sh',
            'orchestrator/scripts/audit/check_repository_contract.py',
            'viking-team/team/index.html', 'viking-team/team/styles.css',
            'viking-team/team/app.js',
        ]
        for name in files:
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('# fixture\n')
        self.script = self.root / 'scripts/repo_health_check.sh'
        self.script.parent.mkdir()
        shutil.copyfile(HEALTH, self.script)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        self.bin = Path(self.temp.name) / 'bin'
        self.bin.mkdir()
        self.trace = Path(self.temp.name) / 'calls'
        # Minimal PATH: a missing runtime must not fall back to a system copy.
        for tool in ['bash', 'dirname', 'git']:
            (self.bin / tool).symlink_to(shutil.which(tool))
        for tool in ['node', 'npm', 'python3']:
            stub = self.bin / tool
            stub.write_text('''#!/bin/bash
name=${0##*/}
printf '%s|%s|%s\\n' "$name" "$PWD" "$*" >> "$TRACE"
if [[ "$name" == "${FAIL_TOOL:-}" && "${PWD##*/}" == "${FAIL_DIR:-}" ]]; then
  exit 9
fi
''')
            stub.chmod(0o755)
        self.env = {**os.environ, 'PATH': str(self.bin), 'TRACE': str(self.trace)}
        self.env.pop('FAIL_TOOL', None)
        self.env.pop('FAIL_DIR', None)

    def run_health(self, cwd=None, **env):
        return subprocess.run(
            [str(self.bin / 'bash'), str(self.script)],
            cwd=cwd or self.root, env={**self.env, **env},
            text=True, capture_output=True, timeout=20,
        )

    def test_independent_of_cwd_and_no_installation(self):
        result = self.run_health(cwd=self.temp.name)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        calls = self.trace.read_text().splitlines()
        self.assertIn(f'npm|{self.root}/hermes|--ignore-scripts run check', calls)
        self.assertIn(f'npm|{self.root}/psk|--ignore-scripts run check', calls)
        self.assertIn(f'python3|{self.root}/orchestrator|scripts/audit/check_repository_contract.py', calls)
        for call in calls:
            self.assertNotRegex(call, r'\b(install|ci|pip|postinstall|sync-secrets)\b')
            self.assertNotIn('--prefix', call)
        # Actual bash -n above also verifies setup.sh is relative to hermes, not hermes/hermes.
        self.assertFalse((self.root / 'hermes/hermes').exists())

    def test_all_failed_checks_are_counted_and_later_checks_still_run(self):
        for tool, directory in [('npm', 'psk'), ('npm', 'hermes'),
                                ('node', 'lithos'), ('node', 'viking-team'),
                                ('python3', 'orchestrator')]:
            with self.subTest(tool=tool, directory=directory):
                result = self.run_health(FAIL_TOOL=tool, FAIL_DIR=directory)
                self.assertEqual(result.returncode, 2)
                self.assertIn(f'[FAIL] {directory} check failed', result.stderr)
                self.assertIn('Tracked environment-file hygiene', result.stdout)

    def test_hermes_shell_syntax_failure_is_not_masked(self):
        (self.root / 'hermes/setup.sh').write_text('if then\n')
        result = self.run_health()
        self.assertEqual(result.returncode, 2)
        self.assertIn('[FAIL] hermes check failed', result.stderr)

    def test_missing_runtime_fails_without_running_commands(self):
        (self.bin / 'node').unlink()
        result = self.run_health()
        self.assertEqual(result.returncode, 2)
        self.assertIn('Required tool not found: node', result.stderr)
        self.assertFalse(self.trace.exists())

    def test_missing_project_or_file_fails_instead_of_skipping(self):
        shutil.rmtree(self.root / 'hermes')
        result = self.run_health()
        self.assertEqual(result.returncode, 2)
        self.assertIn('Missing or empty required file: hermes/package.json', result.stderr)

    def test_local_environment_is_not_loaded_or_dumped(self):
        marker = self.root / 'EXECUTED'
        value = f'ENGINE_TOKEN=$(touch "{marker}")\nSECRET=local-sentinel-1928\n'
        (self.root / '.env').write_text(value)
        (self.root / '.gitignore').write_text('.env\n')
        result = self.run_health()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('local-sentinel-1928', result.stdout + result.stderr)
        self.assertNotIn(str(marker), result.stdout + result.stderr)
        self.assertFalse(marker.exists())

    def test_tracked_env_fails_without_logging_name_or_value(self):
        file = self.root / 'hermes/.env.private-sentinel-1928'
        file.write_text('ENGINE_TOKEN=private-sentinel-1928\n')
        subprocess.run(['git', '-C', str(self.root), 'add', str(file)], check=True)
        result = self.run_health()
        self.assertEqual(result.returncode, 2)
        self.assertIn('Non-example environment file is tracked', result.stderr)
        self.assertNotIn('private-sentinel-1928', result.stdout + result.stderr)

    def test_tracked_examples_are_allowed(self):
        subprocess.run(['git', '-C', str(self.root), 'add', '.env.example'], check=True)
        self.assertEqual(self.run_health().returncode, 0)

    def test_git_failure_is_not_silently_ignored(self):
        shutil.rmtree(self.root / '.git')
        result = self.run_health()
        self.assertEqual(result.returncode, 2)
        self.assertIn('Unable to inspect Git-tracked environment files', result.stderr)


class NormalizationConfigTests(unittest.TestCase):
    def test_npm_checks_do_not_run_precheck_or_postcheck_hooks(self):
        commands = [shlex.split(line) for line in HEALTH.read_text().splitlines()
                    if line.startswith('run_check ') and ' npm ' in line]
        self.assertEqual(len(commands), 2)
        for command in commands:
            with self.subTest(project=command[1]), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                scripts = {name: f"node -e \"require('fs').writeFileSync('{name}', 'fixture')\""
                           for name in ['precheck', 'check', 'postcheck']}
                (root / 'package.json').write_text(json.dumps({'scripts': scripts}))
                result = subprocess.run(command[2:], cwd=root, text=True,
                                        capture_output=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertTrue((root / 'check').exists())
                self.assertFalse((root / 'precheck').exists())
                self.assertFalse((root / 'postcheck').exists())

    def test_dependabot_targets_real_manifests_and_actions(self):
        config = (ROOT / '.github/dependabot.yml').read_text()
        entries = re.findall(
            r'- package-ecosystem: "([^"]+)"\s+directory: "([^"]+)"'
            r'\s+schedule:\s+interval: "weekly"', config,
        )
        npm_dirs = {'/psk', '/lithos', '/fjcod', '/bison-brand-book', '/hermes'}
        self.assertEqual(set(entries), {('npm', d) for d in npm_dirs} | {('github-actions', '/')})
        self.assertEqual(len(entries), config.count('- package-ecosystem:'))
        self.assertEqual(len(entries), 6)
        for ecosystem, directory in entries:
            if ecosystem == 'npm':
                json.loads((ROOT / directory.lstrip('/') / 'package.json').read_text())

    def test_token_guard_is_main_push_only_and_step_scoped(self):
        ci = CI.read_text()
        psk = ci.split('\n  psk:\n')[1].split('\n  lithos:\n')[0]
        guard = psk.split('      - name: Require ENGINE_TOKEN for main branch builds\n')[1]
        guard, rest = guard.split('      - run: npm run check', 1)
        self.assertIn("if: github.event_name == 'push' && github.ref == 'refs/heads/main'", guard)
        self.assertIn('        env:\n          ENGINE_TOKEN: ${{ secrets.ENGINE_TOKEN }}\n', guard)
        self.assertEqual(ci.count('${{ secrets.ENGINE_TOKEN }}'), 1)
        self.assertNotIn('ENGINE_TOKEN', rest)
        shell = textwrap.dedent(guard.split('        run: |\n')[1])
        self.assertNotIn('${{', shell)
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'EXECUTED'
            base_env = {k: v for k, v in os.environ.items() if k != 'ENGINE_TOKEN'}
            for value, expected in [(None, 1), ('', 1), ('fixture', 0),
                                    (f'"; touch "{marker}"; #\n$(touch "{marker}")', 0)]:
                with self.subTest(value_present=bool(value)):
                    env = dict(base_env)
                    if value is not None:
                        env['ENGINE_TOKEN'] = value
                    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', shell],
                                            env=env, capture_output=True, text=True, check=False)
                    self.assertEqual(result.returncode, expected)
                    self.assertNotIn('fixture', result.stdout + result.stderr)
                    self.assertNotIn(str(marker), result.stdout + result.stderr)
                    self.assertFalse(marker.exists())

    def test_health_job_and_existing_project_jobs_remain(self):
        ci = CI.read_text()
        jobs = set(re.findall(r'^  ([\w-]+):\n    runs-on:', ci, re.MULTILINE))
        self.assertEqual(jobs, {'repo-health', 'psk', 'lithos', 'router', 'fjcod',
                                'bison-brand-book', 'viking-team', 'orchestrator', 'hermes'})
        health = ci.split('\n  repo-health:\n')[1].split('\n  psk:\n')[0]
        self.assertIn('bash scripts/repo_health_check.sh', health)
        self.assertNotIn('secrets.', health)
        self.assertNotIn('pull_request_target', ci)
        hermes = ci.split('\n  hermes:\n')[1]
        self.assertIn('npm ci --prefix hermes --ignore-scripts', hermes)
        self.assertNotIn('working-directory:', hermes)
        self.assertIn('bash -n hermes/setup.sh', hermes)

    def test_example_contains_only_empty_values(self):
        values = dict(line.split('=', 1) for line in (ROOT / '.env.example').read_text().splitlines()
                      if line and not line.startswith('#'))
        self.assertEqual(set(values), {'ENGINE_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY',
                                      'GITHUB_ADMIN_USER_IDS', 'TELEGRAM_BOT_TOKEN', 'VERCEL_TOKEN'})
        self.assertTrue(all(value == '' for value in values.values()))

    def test_gitignore_covers_nested_secrets_but_allows_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copyfile(ROOT / '.gitignore', root / '.gitignore')
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            for name, ignored in [('.env', True), ('.env.local', True),
                                  ('hermes/.env.production', True),
                                  ('.env.example', False), ('hermes/.env.example', False)]:
                result = subprocess.run(['git', 'check-ignore', '-q', '--no-index', name], cwd=root)
                self.assertEqual(result.returncode, 0 if ignored else 1, name)


if __name__ == '__main__':
    unittest.main()
