import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / 'skills' / 'route.py'


def load_module():
    spec = importlib.util.spec_from_file_location('local_route', ROUTE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # must not read the registry at import time
    return module


def test_import_never_requires_the_materialized_registry():
    assert load_module().REGISTRY == ROOT / 'skills' / 'registry' / 'skills-manifest.json'


def test_routes_by_exact_trigger_then_overlap():
    reg = {'skills': [
        {'name': 'seo-audit', 'domain': 'marketing', 'triggers': ['audit my seo'], 'installed_path': 'skills/installed/seo-audit/SKILL.md'},
        {'name': 'caption', 'domain': 'content', 'triggers': ['write instagram caption'], 'installed_path': 'skills/installed/caption/SKILL.md'},
    ]}
    result = load_module().route('audit my seo', registry=reg)
    assert [r['skill'] for r in result] == ['seo-audit']
    assert result[0]['score'] == 100.0
    assert load_module().route('caption for instagram', registry=reg)[0]['skill'] == 'caption'


def test_cli_without_registry_fails_with_a_message_not_a_traceback(tmp_path):
    copy = tmp_path / 'skills' / 'route.py'
    copy.parent.mkdir()
    copy.write_text(ROUTE.read_text(encoding='utf-8'), encoding='utf-8')
    result = subprocess.run([sys.executable, str(copy), 'anything'], capture_output=True, text=True, timeout=60)
    assert result.returncode == 1
    assert 'BASELINE_ARTIFACTS.json' in result.stderr
    assert 'Traceback' not in result.stderr
