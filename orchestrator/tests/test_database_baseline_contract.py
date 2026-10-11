from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / 'supabase' / 'migrations' / '20260912_live_snapshot.sql'


def test_snapshot_contains_required_private_objects():
    text = SQL.read_text(encoding='utf-8').lower()
    for item in [
        'private.skills','private.skill_chunks','private.skill_assets',
        'private.skill_install_runs','private.dynamic_llm_providers',
        'private.github_llm_sources','private.search_skills','private.load_skill',
        'private.install_mega_skills_bundle'
    ]:
        assert item in text, item


def test_snapshot_contains_no_literal_credentials():
    text = SQL.read_text(encoding='utf-8')
    for token in ['GITHUB_ADMIN_TOKEN=', 'OPENROUTER_API_KEY=', 'SUPABASE_DB_URL=']:
        assert token not in text
