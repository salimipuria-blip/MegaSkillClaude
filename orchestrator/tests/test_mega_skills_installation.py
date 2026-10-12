import hashlib, json
from pathlib import Path
import pytest

pytestmark = pytest.mark.materialized_skills

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / 'skills'
REGISTRY = SKILLS / 'registry' / 'skills-manifest.json'

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def test_all_skills_are_preinstalled():
    reg = json.loads(REGISTRY.read_text(encoding='utf-8'))
    assert reg['install_mode'] == 'eager_global'
    assert reg['trigger_role'] == 'selection_only'
    assert reg['counts']['skills'] == 3000
    assert reg['counts']['triggers'] == 15000
    assert len(list((SKILLS/'installed').glob('*/SKILL.md'))) == 3000
    assert len(list((SKILLS/'original').glob('*/SKILL.md'))) == 3000

def test_every_manifest_record_points_to_real_hash_verified_files():
    reg = json.loads(REGISTRY.read_text(encoding='utf-8'))
    for item in reg['skills']:
        installed = ROOT / item['installed_path']
        original = ROOT / item['original_path']
        assert installed.is_file()
        assert original.is_file()
        assert sha(installed) == item['installed_sha256']
        assert sha(original) == item['original_sha256']

def test_trigger_never_controls_installation():
    reg = json.loads(REGISTRY.read_text(encoding='utf-8'))
    assert all(x['status'] == 'installed' for x in reg['skills'])
    assert all(x['install_mode'] == 'eager_global' for x in reg['skills'])
    assert all(x['trigger_role'] == 'selection_only' for x in reg['skills'])
