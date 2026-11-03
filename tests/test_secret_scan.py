import contextlib
import importlib.util
import io
import pathlib
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('secret_scan', pathlib.Path(__file__).resolve().parents[1] / 'scripts/scan_secrets.py')
SCAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SCAN)


class SecretScanTests(unittest.TestCase):
    def test_known_formats(self):
        fixtures = {
            'github-token': b'gh' + b'p_' + b'x' * 36,
            'aws-access-key': b'AK' + b'IA' + b'Z' * 16,
            'telegram-token': b'123456789:' + b'x' * 35,
            'private-key': b'-----BEGIN ' + b'OPENSSH PRIVATE KEY-----',
        }
        for name, data in fixtures.items():
            with self.subTest(name=name):
                self.assertEqual(SCAN.findings(data), [name])

    def test_exact_public_example_only(self):
        self.assertEqual(SCAN.findings(b'AKIAIOSFODNN7EXAMPLE'), [])
        self.assertEqual(SCAN.findings(b'AKIA' + b'IOSFODNN7EXAMPLF'), ['aws-access-key'])
        self.assertEqual(SCAN.findings(b'ENGINE_TOKEN=\nTELEGRAM_BOT_TOKEN=\n'), [])

    def fixture(self, root, name, data):
        subprocess.run(['git', 'init', '-q', str(root)], check=True)
        (root / name).write_bytes(data)
        subprocess.run(['git', 'add', '--', name], cwd=root, check=True)

    def test_redaction_and_untracked_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            token = b'gh' + b'p_' + b'z' * 36
            self.fixture(root, 'private-name.txt', token)
            output = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                self.assertEqual(SCAN.scan(root), 1)
            self.assertNotIn(token.decode(), output.getvalue())
            self.assertNotIn('private-name', output.getvalue())
            (root / 'private-name.txt').write_bytes(b'safe working tree')
            (root / '.env').write_bytes(token)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(SCAN.scan(root), 0)

    def test_unreadable_and_oversized_files_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            self.fixture(root, 'file.txt', b' ' * (SCAN.MAX_BYTES + 1))
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(SCAN.scan(root), 1)
                (root / 'file.txt').unlink()
                self.assertEqual(SCAN.scan(root), 1)

    def test_no_following_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            self.fixture(root, 'safe.txt', b'safe')
            (root / 'outside').symlink_to('/does-not-exist')
            subprocess.run(['git', 'add', 'outside'], cwd=root, check=True)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(SCAN.scan(root), 0)
