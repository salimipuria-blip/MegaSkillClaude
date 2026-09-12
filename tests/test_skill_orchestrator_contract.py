from pathlib import Path
SRC=Path('supabase/functions/skill-orchestrator/index.ts')


def test_orchestrator_contract_exists():
    text=SRC.read_text() if SRC.exists() else ''
    assert 'private.search_skills' in text
    assert 'private.load_skill' in text
    assert 'global-free-llm-mesh' in text
    assert 'lazy_install:false' in text
    assert 'selected_skill' in text
