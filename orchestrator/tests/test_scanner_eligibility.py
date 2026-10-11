from pathlib import Path
SRC=Path('supabase/functions/github-llm-scanner/index.ts')
SQL=Path('supabase/migrations/20260912_live_snapshot.sql')


def test_scanner_and_database_jointly_require_api_evidence_for_eligibility():
    source=SRC.read_text(encoding='utf-8')
    sql=''.join(SQL.read_text(encoding='utf-8').lower().split())
    assert 'eligible: !repo.archived && score >= 2' in source
    assert 'coalesce(new.has_api,false)=true' in sql
