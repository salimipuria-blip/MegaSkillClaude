from pathlib import Path
from scripts.audit.check_repository_contract import assert_repository_contract

ROOT = Path(__file__).resolve().parents[1]


def test_repository_contract_has_no_unsafe_files():
    assert assert_repository_contract(ROOT) == []


def test_task1_owned_contract_files_exist():
    required = [
        ROOT / '.gitignore', ROOT / '.env.example', ROOT / 'README.md',
        ROOT / 'scripts' / 'audit' / 'check_repository_contract.py',
    ]
    assert [str(p.relative_to(ROOT)) for p in required if not p.exists()] == []


def test_guard_detects_forbidden_archive(tmp_path):
    (tmp_path / 'snapshot.zip').write_bytes(b'zip')
    assert assert_repository_contract(tmp_path) == ['forbidden binary/archive: snapshot.zip']


def test_baseline_ci_exists():
    workflow = ROOT / '.github' / 'workflows' / 'baseline-ci.yml'
    assert workflow.is_file()
    text = workflow.read_text(encoding='utf-8')
    assert 'pytest' in text
    assert 'deno check' in text
    assert 'check_repository_contract.py' in text
