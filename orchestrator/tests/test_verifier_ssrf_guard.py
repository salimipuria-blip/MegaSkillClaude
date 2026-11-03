"""Runs the verifier's SSRF-guard regressions (node:test) so the Python CI job covers them too."""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FUNC = ROOT / 'supabase' / 'functions' / 'github-llm-verifier'


def test_guard_lives_in_a_pure_module_imported_by_the_function():
    source = (FUNC / 'index.ts').read_text(encoding='utf-8')
    assert 'from "./net.mjs"' in source
    assert 'function ipIsPublic' not in source  # one implementation only


@pytest.mark.skipif(shutil.which('node') is None, reason='node is required for the SSRF guard regressions')
def test_ssrf_guard_regressions_pass():
    result = subprocess.run(['node', '--test', str(FUNC / 'net.test.mjs')], cwd=ROOT,
                            capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout[-4000:] + result.stderr[-2000:]
