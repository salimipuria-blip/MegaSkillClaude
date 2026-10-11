import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'supabase' / 'FUNCTION_MANIFEST.json'
EXPECTED = {
    'free-llm-router','global-free-llm-mesh','github-llm-scanner','github-llm-verifier',
    'github-admin-gateway','skill-installer','skill-orchestrator','skill-router',
    'prompt-compiler','task-orchestrator'
}


def test_live_function_manifest_is_complete():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    functions = {x['slug']: x for x in data['functions']}
    assert set(functions) == EXPECTED
    assert all(x['verify_jwt'] is True for x in functions.values())


def test_every_function_has_checked_in_entrypoint():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for item in data['functions']:
        path = ROOT / 'supabase' / 'functions' / item['slug'] / item['entrypoint']
        assert path.is_file(), path
