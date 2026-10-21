"""Dependency-free safety regressions for PR 1; never use real secrets/services."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import shlex
import struct
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
HEALTH = ROOT / 'scripts/repo_health_check.sh'
CI = ROOT / '.github/workflows/ci.yml'

# The npm projects Dependabot watches. `psk` is in the list on purpose: it declares no
# dependency at all, so the guard must prove that it legitimately needs no lockfile
# instead of silently dropping it from coverage.
NPM_PROJECTS = ('psk', 'lithos', 'fjcod', 'bison-brand-book', 'hermes', 'viking-team/motion',
                'brands/viking-offroad/stickers/src')


def _version_triple(value):
    """Split a pinned npm version into (numbers, prerelease) without any dependency."""
    core, _, tail = value.partition('-')
    parts = []
    for chunk in core.split('.'):
        if not chunk.isdigit():
            raise ValueError(f'not a numeric npm version: {value}')
        parts.append(int(chunk))
    return tuple(parts + [0] * (3 - len(parts))), tail


def _satisfies(version, want):
    """Tiny offline semver check: enough for the ranges these manifests really use.

    Returns True/False when the range shape is understood, otherwise None so the
    caller can report an unhandled range instead of guessing that it passes.
    """
    want = want.strip()
    if want in ('*', 'latest', '') or want.startswith('workspace:'):
        return True
    if version == want:  # exact pins, including prerelease tags such as *-alpha
        return True
    numbers, prerelease = _version_triple(version)
    exact = re.fullmatch(r'(\d+(?:\.\d+){0,2})(-[0-9A-Za-z.-]+)?', want)
    caret = re.fullmatch(r'\^(\d+(?:\.\d+){0,2})(-[0-9A-Za-z.-]+)?', want)
    tilde = re.fullmatch(r'~(\d+(?:\.\d+){0,2})(-[0-9A-Za-z.-]+)?', want)
    at_least = re.fullmatch(r'>=\s*(\d+(?:\.\d+){0,2})(-[0-9A-Za-z.-]+)?', want)
    for shape in (exact, caret, tilde, at_least):
        if shape is None:
            continue
        base = [int(part) for part in shape.group(1).split('.')]
        base += [0] * (3 - len(base))
        floor = tuple(base)
        if shape is at_least:
            return numbers >= floor
        if shape is exact:
            return numbers == floor and bool(prerelease) == bool(shape.group(2))
        if numbers[0] != floor[0] or prerelease:
            return False
        if shape is caret:
            return numbers[0] != 0 or numbers >= floor
        return numbers[1] == floor[1] and numbers[2] >= floor[2]
    return None


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

    def test_tracked_suffixed_examples_are_allowed(self):
        # رگرسیون: قالب‌هایی مثل hermes/.env.dev.example و .env.prod.example
        # نمونه‌اند، نه فایل env واقعی؛ نباید health check را قرمز کنند.
        for name in ('hermes/.env.dev.example', 'hermes/.env.prod.example'):
            file = self.root / name
            file.write_text('PLACEHOLDER=\n')
            subprocess.run(['git', '-C', str(self.root), 'add', str(file)], check=True)
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
        npm_dirs = {'/psk', '/lithos', '/fjcod', '/bison-brand-book', '/hermes', '/viking-team/motion',
                    '/brands/viking-offroad/stickers/src'}
        self.assertEqual(set(entries), {('npm', d) for d in npm_dirs} | {('github-actions', '/')})
        self.assertEqual(len(entries), config.count('- package-ecosystem:'))
        self.assertEqual(len(entries), 8)
        for ecosystem, directory in entries:
            if ecosystem == 'npm':
                json.loads((ROOT / directory.lstrip('/') / 'package.json').read_text())

    def test_npm_lockfiles_resolve_every_manifest_range(self):
        """A committed lock must match its manifest, or the next `npm ci` breaks.

        This is the exact failure class behind the stale Dependabot pull requests:
        a manifest is bumped while the committed lockfile keeps the old resolution,
        so `npm ci` (or a project test that compares pinned versions) fails only in
        CI. The guard is offline: it reads the two JSON files and compares them.
        """
        config = (ROOT / '.github/dependabot.yml').read_text()
        watched = {directory.lstrip('/') for ecosystem, directory in re.findall(
            r'- package-ecosystem: "([^"]+)"\s+directory: "([^"]+)"', config)
            if ecosystem == 'npm'}
        self.assertEqual(watched, set(NPM_PROJECTS),
                         'lockfile coverage drifted from the npm directories Dependabot watches')

        problems = []
        for project in NPM_PROJECTS:
            folder = ROOT / project
            manifest = json.loads((folder / 'package.json').read_text())
            wanted = dict(manifest.get('dependencies') or {})
            wanted.update({name: spec for name, spec in (manifest.get('devDependencies') or {}).items()
                           if name not in wanted})
            lock_path = folder / 'package-lock.json'
            if not lock_path.exists():
                if wanted:
                    problems.append(f'{project}: declares {len(wanted)} dependencies but commits no '
                                    'package-lock.json, so `npm ci` cannot reproduce the install')
                continue
            lock = json.loads(lock_path.read_text())
            self.assertEqual(lock.get('lockfileVersion'), 3, f'{project}: unexpected lockfile format')
            packages = lock.get('packages') or {}
            resolved = packages.get('node_modules/')
            # npm stores the project itself under the empty key; its recorded ranges
            # must be the manifest ranges, otherwise the lock was generated elsewhere.
            root_entry = packages.get('') or {}
            for kind in ('dependencies', 'devDependencies'):
                recorded = root_entry.get(kind) or {}
                expected = {name: spec for name, spec in wanted.items()
                            if (kind == 'dependencies') == (name in (manifest.get('dependencies') or {}))}
                if recorded != expected:
                    problems.append(f'{project}: lockfile root {kind} {json.dumps(recorded, sort_keys=True)} '
                                    f'does not equal the manifest {json.dumps(expected, sort_keys=True)}')
            for name, spec in sorted(wanted.items()):
                entry = packages.get(f'node_modules/{name}')
                if entry is None:
                    problems.append(f'{project}: {name}@{spec} is missing from package-lock.json')
                    continue
                if entry.get('link') or entry.get('workspace'):
                    continue  # a local workspace package has no version of its own
                version = entry.get('version')
                if not version:
                    problems.append(f'{project}: {name} has no resolved version in package-lock.json')
                    continue
                verdict = _satisfies(version, spec)
                if verdict is None:
                    problems.append(f'{project}: unhandled range for {name}: {spec!r}')
                elif not verdict:
                    problems.append(f'{project}: {name} is pinned to {spec} but package-lock.json '
                                    f'resolves {version}')
        self.assertEqual(problems, [], f'{len(problems)} lockfile/manifest drift(s):\n- '
                                       + '\n- '.join(problems))

    def test_dependency_review_verdicts_every_dependabot_target(self):
        """`docs/DEPENDENCY_REVIEW.md` is the owner's triage record for update PRs.

        Backlog task 99 accepts only a table in that file, and the repo rule is that
        the owner merges dependency updates. The guard therefore keeps the document
        honest: every directory Dependabot watches must carry a verdict, the verdict
        vocabulary must stay the measured one, the merge decision must stay with the
        owner, and what was never executed must stay written down as NOT RUN.
        """
        path = ROOT / 'docs/DEPENDENCY_REVIEW.md'
        self.assertTrue(path.is_file(),
                        'docs/DEPENDENCY_REVIEW.md is missing: dependency update PRs have no '
                        'owner-readable triage record')
        text = path.read_text(encoding='utf-8')
        config = (ROOT / '.github/dependabot.yml').read_text()
        watched = sorted({directory for _, directory in re.findall(
            r'- package-ecosystem: "([^"]+)"\s+directory: "([^"]+)"', config)})
        # Every target needs its own verdict *section* in the document: a heading that
        # names the directory, and at least one table row inside it carrying a verdict.
        # A bare mention in the summary must not pass, or a target could lose its
        # evidence and the document would still look complete.
        verdicts = {'امن', 'شکست', 'بلاک'}
        # U+200C (half-space) sits inside the Arabic block; excluding it keeps a verdict
        # word separable from whatever follows it in the same cell.
        word_re = re.compile('[\u0600-\u06BC\u06BE-\u06FF]+')
        sections = {}
        current = None
        for line in text.splitlines():
            heading = re.match(r'^#{2,3}\s+(.*)$', line)
            if heading:
                current = heading.group(1)
                sections.setdefault(current, [])
                continue
            if current is not None:
                sections[current].append(line)
        unjudged = []
        for directory in watched:
            token = f'`{directory}`'
            own = [lines for title, lines in sections.items() if token in title]
            if not own:
                unjudged.append(f'{directory} (no section of its own)')
                continue
            judged = any(word_re.search(cell) and set(word_re.findall(cell)) & verdicts
                         for lines in own for line in lines if line.startswith('|')
                         for cell in (c.strip() for c in line.strip('|').split('|')))
            if not judged:
                unjudged.append(f'{directory} (section has no verdict row)')
        self.assertEqual(unjudged, [],
                         'docs/DEPENDENCY_REVIEW.md does not judge every Dependabot target: '
                         + '; '.join(unjudged))
        # the vocabulary the backlog asks for, so a verdict cannot be vague prose
        self.assertIn('| وضعیت |', text)
        for word in sorted(verdicts):
            self.assertIn(word, text, f'the review no longer states any {word!r} verdict')
        self.assertIn('`github-actions`', text, 'the Actions ecosystem is not covered')
        # merging stays an owner decision; the document must keep saying so
        self.assertRegex(text, r'[Mm]erge\s*(فقط\s*)?با\s*(تأییدِ\s*)?مالک')
        # an honest triage separates what was executed from what never ran
        self.assertIn('NOT RUN', text)
        self.assertRegex(text, r'>?\s*تاریخِ اندازه‌گیری:\s*\d{4}-\d{2}-\d{2}',
                         'the review must carry the date it was measured, so a stale row is visible')
        prs = sorted({int(number) for number in re.findall(r'#(\d+)', text)})
        self.assertGreaterEqual(len(prs), 16,
                                f'the review names only {len(prs)} PRs; a full triage names every open one')
        self.assertEqual(prs, sorted(set(prs)), 'duplicate PR numbering in the review')

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
        self.assertEqual(jobs, {'repo-health', 'psk', 'lithos', 'router', 'fjcod', 'fjcod-e2e',
                                'bison-brand-book', 'viking-team', 'viking-motion',
                                'orchestrator', 'hermes', 'commit-identity'})
        health = ci.split('\n  repo-health:\n')[1].split('\n  psk:\n')[0]
        self.assertIn('bash scripts/repo_health_check.sh', health)
        self.assertNotIn('secrets.', health)
        self.assertNotIn('pull_request_target', ci)
        hermes = ci.split('\n  hermes:\n')[1]
        self.assertIn('npm ci --prefix hermes --ignore-scripts', hermes)
        self.assertNotIn('working-directory:', hermes)
        self.assertIn('bash -n hermes/setup.sh', hermes)
        self.assertIn('node --test mobile/search.test.mjs', ci)
        # the browser smoke must be strict: a missing browser is a failure, not a silent skip
        e2e = ci.split('\n  fjcod-e2e:\n')[1].split('\n  #')[0]
        self.assertIn('npx playwright install --with-deps chromium', e2e)
        self.assertIn('E2E_STRICT: "1"', e2e)
        self.assertIn('python3 scripts/check_brand_assets.py', ci)
        self.assertIn('node --test tests/doctor.test.mjs', health)
        # the readiness checker must stay mocked and credential-free
        self.assertIn('node --test tests/check-supabase.test.mjs', health)
        self.assertIn('node --check scripts/check-supabase.mjs', health)
        # task 98: the identity gate needs the branch's messages, and no secret may leak into it
        identity = ci.split('\n  commit-identity:\n')[1]
        self.assertIn('scripts/check_commit_identity.py', identity)
        self.assertIn('fetch-depth: 0', identity)
        self.assertNotIn('secrets.', identity)
        self.assertIn('npm ci --prefix viking-team/motion --ignore-scripts', ci)

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

    def test_sticker_manifest_hashes_match_the_committed_pngs(self):
        """Backlog task 59: the committed stickers must be byte-identical to what the manifest claims.

        Re-rendering needs Chromium, which is not available offline, so this guard covers the part
        that *can* be proven here: `MANIFEST.json` is the build contract, and every PNG it lists
        (360 pack stickers + 12 previews + the cover) is re-hashed and re-measured against the file
        on disk, in both directions. A silent re-render, a re-compression, an edited sticker or an
        unlisted new file all turn this red — which is what makes `npm ci` + a pinned lockfile a
        real reproducibility claim instead of a hope.
        """
        root = ROOT / 'brands/viking-offroad/stickers'
        manifest = json.loads((root / 'MANIFEST.json').read_text(encoding='utf-8'))
        listed: list[tuple[str, dict, bool]] = []          # (relative path, metadata, is_pack_sticker)
        for pack in manifest['packs']:
            listed += [(f"packs/pack-{pack['id']}/{item['file']}", item, True) for item in pack['files']]
            listed.append((f"packs/{pack['preview']['file']}", pack['preview'], False))
        # The cover entry stores a root-relative path ("cover/…"), previews are bare names inside packs/.
        listed.append((manifest['cover']['file'], manifest['cover'], False))

        problems: list[str] = []
        pack_bytes = 0
        for relative, meta, is_sticker in listed:
            path = root / relative
            if not path.is_file():
                problems.append(f'{relative}: listed in MANIFEST.json but missing on disk')
                continue
            blob = path.read_bytes()
            digest = hashlib.sha256(blob).hexdigest()
            if digest != meta.get('sha256'):
                problems.append(f'{relative}: sha256 {digest[:16]}… does not match the manifest '
                                f'{str(meta.get("sha256"))[:16]}…')
            if len(blob) != meta.get('bytes'):
                problems.append(f'{relative}: {len(blob)} bytes on disk vs {meta.get("bytes")} in the manifest')
            width, height, colour = struct.unpack('>IIB', blob[16:24] + blob[25:26])
            if (width, height, colour) != (meta.get('width'), meta.get('height'), meta.get('colorType')):
                problems.append(f'{relative}: IHDR {width}x{height}/{colour} vs manifest '
                                f'{meta.get("width")}x{meta.get("height")}/{meta.get("colorType")}')
            if is_sticker:
                pack_bytes += len(blob)

        # Only the shipped asset folders: `src/node_modules/` (from `npm ci`) also holds PNGs.
        on_disk = {str(path.relative_to(root)) for folder in ('packs', 'cover')
                   for path in (root / folder).rglob('*.png')}
        unlisted = sorted(on_disk - {relative for relative, _, _ in listed})
        if unlisted:
            problems.append(f'{len(unlisted)} PNG(s) on disk are absent from MANIFEST.json: {", ".join(unlisted[:3])}…')

        totals = manifest['totals']
        stickers = sum(len(pack['files']) for pack in manifest['packs'])
        if (totals.get('packs'), totals.get('stickers'), totals.get('bytes')) != (len(manifest['packs']), stickers, pack_bytes):
            problems.append(f"totals block {json.dumps(totals)} disagrees with the entries it summarises "
                            f"({len(manifest['packs'])} packs, {stickers} stickers, {pack_bytes} bytes)")

        self.assertEqual(problems, [], f'{len(problems)} sticker integrity problem(s):\n- ' + '\n- '.join(problems))


    def test_viking_setup_checklist_points_only_at_existing_files(self):
        """Backlog task 50: the owner's Supabase checklist must name real artifacts.

        A setup guide is the one document the owner follows with no way to verify it, so a drifted
        path (renamed `sql/…`, moved `team/app.js`) becomes an incident on the live project. Every
        backticked, path-shaped token is resolved against the repo root or against `viking-team/`
        and must exist; the mandatory order of the two SQL files and the security-critical steps
        (first admin row, Confirm email, the `23514` limit) are asserted as well.
        """
        path = ROOT / 'viking-team/SETUP.md'
        text = path.read_text(encoding='utf-8')
        for required in ('sql/viking_supabase_schema.sql', 'sql/viking_limit_five_active_members.sql',
                         '23514', 'Confirm email', 'service_role', 'مدیر'):
            self.assertIn(required, text, f'viking-team/SETUP.md no longer states {required!r}')
        self.assertLess(text.index('viking_supabase_schema.sql'),
                        text.index('viking_limit_five_active_members.sql'),
                        'the schema file must be applied before the trigger file that needs its table')

        checked, missing = 0, []
        for token in sorted({part for raw in re.findall(r'`([^`\n]+)`', text) for part in raw.split()}):
            if '/' not in token or any(char in token for char in '<>()→|*,;=…'):
                continue
            if token.startswith(('http', 'image/', 'text/', 'application/', 'public.', 'storage.', 'auth.')):
                continue
            candidates = (ROOT / token, ROOT / 'viking-team' / token)
            if any(candidate.exists() for candidate in candidates):
                checked += 1
            else:
                missing.append(token)
        self.assertGreaterEqual(checked, 4, 'the checklist stopped naming real files, so this guard went vacuous')
        self.assertEqual(missing, [], f'viking-team/SETUP.md names files that do not exist: {missing}')



if __name__ == '__main__':
    unittest.main()
