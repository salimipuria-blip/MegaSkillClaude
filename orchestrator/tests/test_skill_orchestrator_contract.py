from pathlib import Path
SRC=Path(__file__).resolve().parents[1]/'supabase/functions/skill-orchestrator/index.ts'


def test_orchestrator_contract_exists():
    text=SRC.read_text(encoding='utf-8')  # a missing file must fail loudly, not as five confusing asserts
    assert 'private.search_skills' in text
    assert 'private.load_skill' in text
    assert 'global-free-llm-mesh' in text
    assert 'lazy_install:false' in text
    assert 'selected_skill' in text
