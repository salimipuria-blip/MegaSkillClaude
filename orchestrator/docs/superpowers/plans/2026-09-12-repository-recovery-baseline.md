# Repository Recovery & Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `salimipuria-blip/porya-omni-llm-orchestrator` the auditable source of truth for the currently deployed code and database contract without changing production behavior.

**Architecture:** Recover the live Supabase Edge Function source and audited snapshot into the hardening branch, establish a deterministic repository layout, capture database/runtime metadata as versioned baseline artifacts, and add CI checks that prevent secret leakage or accidental drift. This phase does not redesign routing or deploy new production behavior.

**Tech Stack:** GitHub, Supabase Edge Functions (Deno/TypeScript), PostgreSQL/Supabase SQL, Python 3 + pytest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-omni-v4-hardening-design.md`

## Global Constraints

- Preserve the existing Supabase deployment and provider mesh.
- No secret values may be committed to Git; credentials remain in Supabase Secrets/Vault.
- JWT verification remains enabled for all currently protected Edge Functions.
- Generated payloads, ZIP snapshots, `.env` files, caches, tokens, and temporary staging artifacts are excluded from Git.
- Production is not mutated by this plan.
- Baseline local snapshot is already verified at `8 passed` with `pytest -q`.
- Supabase project: `free-llm-router`, ref `aupkeramhsufnmhkbihl`, region `eu-central-1`.
- Recovery branch: `audit/omni-v4-hardening`.

## Locked Repository Layout

```text
.github/workflows/baseline-ci.yml
docs/architecture/live-baseline-2026-09-12.md
docs/superpowers/{specs,plans}/
scripts/audit/check_repository_contract.py
supabase/FUNCTION_MANIFEST.json
supabase/config.toml
supabase/functions/<10 live functions>/
supabase/migrations/20260912_live_snapshot.sql
tests/
tools/install_mega_skills.py
skills/registry/{skills-manifest.json,triggers.json}
skills/route.py
skills-source/MANIFEST.json
.env.example
.gitignore
README.md
SNAPSHOT_MANIFEST.json
```

The 3000-skill content artifact is deliberately handled by the next installer-specific plan so repository recovery is not coupled to the 6000-file skill-body migration.

---

### Task 1: Establish the repository safety contract

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Modify: `README.md`
- Create: `scripts/audit/check_repository_contract.py`
- Create: `tests/test_repository_contract.py`

**Interfaces:**
- Produces `assert_repository_contract(root: Path) -> list[str]` for local/CI secret and archive safety checks.

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path
from scripts.audit.check_repository_contract import assert_repository_contract

ROOT = Path(__file__).resolve().parents[1]

def test_repository_contract_has_no_unsafe_files():
    assert assert_repository_contract(ROOT) == []

def test_required_baseline_paths_exist():
    required = [
        ROOT / '.gitignore', ROOT / '.env.example',
        ROOT / 'supabase' / 'config.toml',
        ROOT / 'supabase' / 'functions',
        ROOT / 'supabase' / 'migrations',
        ROOT / 'docs' / 'architecture',
    ]
    assert [str(p.relative_to(ROOT)) for p in required if not p.exists()] == []
```

- [ ] **Step 2: Verify RED**

Run: `pytest -q tests/test_repository_contract.py`

Expected: FAIL because the checker and recovered paths do not yet exist.

- [ ] **Step 3: Implement the checker**

```python
from __future__ import annotations
import re
from pathlib import Path

FORBIDDEN_NAMES = {'.env', 'github-admin-token.env'}
FORBIDDEN_SUFFIXES = {'.zip', '.pem', '.p12', '.pfx'}
SECRET_PATTERNS = [
    re.compile(r'(?i)\\b(service_role|service-role|github_admin_token)\\b\\s*[:=]\\s*[\'\"][^\'\"]{8,}'),
    re.compile(r'\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b'),
    re.compile(r'\\bsb_secret_[A-Za-z0-9_-]{20,}\\b'),
]

def _is_cache(path: Path) -> bool:
    return bool(set(path.parts) & {'.git', '.pytest_cache', '__pycache__', '.supabase', 'node_modules'})

def assert_repository_contract(root: Path) -> list[str]:
    errors: list[str] = []
    for path in root.rglob('*'):
        if not path.is_file() or _is_cache(path.relative_to(root)):
            continue
        rel = path.relative_to(root)
        if path.name in FORBIDDEN_NAMES:
            errors.append(f'forbidden file: {rel}')
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            errors.append(f'forbidden binary/archive: {rel}')
        if path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        if any(p.search(text) for p in SECRET_PATTERNS):
            errors.append(f'possible secret in: {rel}')
    return errors

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    errors = assert_repository_contract(root)
    if errors:
        raise SystemExit('\n'.join(errors))
    print('repository contract: OK')
```

- [ ] **Step 4: Harden `.gitignore`**

```gitignore
.env
.env.*
!.env.example
.DS_Store
node_modules/
.supabase/
dist/
tmp/
*.log
__pycache__/
.pytest_cache/
*.py[cod]
*.zip
*.pem
*.p12
*.pfx
github-admin-token.env
skill-install-payload*
skills-source/*.zip
snapshots/
```

- [ ] **Step 5: Create `.env.example` with variable names only**

```dotenv
SUPABASE_URL=
SUPABASE_DB_URL=
SUPABASE_ANON_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
CEREBRAS_API_KEY=
GEMINI_API_KEY=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
MISTRAL_API_KEY=
COHERE_API_KEY=
NVIDIA_API_KEY=
HF_TOKEN=
POLLINATIONS_KEY=
TOGETHER_API_KEY=
FIREWORKS_API_KEY=
DEEPINFRA_API_KEY=
AI_HORDE_API_KEY=
GITHUB_TOKEN=
GITHUB_ADMIN_TOKEN=
```

- [ ] **Step 6: Update README source-of-truth rules**

Add that GitHub owns deployable code/migrations/tests; Supabase Vault owns credentials; canonical skill artifacts are hash-tracked; production deploys originate from reviewed commits.

- [ ] **Step 7: Verify GREEN**

Run: `pytest -q tests/test_repository_contract.py`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .env.example README.md scripts/audit/check_repository_contract.py tests/test_repository_contract.py
git commit -m 'chore: establish repository safety contract'
```

---

### Task 2: Recover every live Edge Function verbatim

**Files:**
- Create/replace all files under `supabase/functions/` for these slugs:
  `free-llm-router`, `global-free-llm-mesh`, `github-llm-scanner`, `github-llm-verifier`, `github-admin-gateway`, `skill-installer`, `skill-orchestrator`, `skill-router`, `prompt-compiler`, `task-orchestrator`.
- Create: `supabase/FUNCTION_MANIFEST.json`
- Create: `tests/test_function_manifest.py`

**Interfaces:**
- Consumes source returned live by Supabase `get_edge_function`.
- Produces an exact Git copy; no refactor is permitted during recovery.

- [ ] **Step 1: Write failing manifest tests**

```python
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
```

- [ ] **Step 2: Verify RED**

Run: `pytest -q tests/test_function_manifest.py`

- [ ] **Step 3: Fetch and write exact live sources**

Use Supabase `get_edge_function` for each of the ten slugs. Preserve each returned `index.ts`, `deno.json`, `core.mjs`, or other returned source file byte-for-byte as UTF-8 text. Do not rewrite imports, defaults, or version strings.

- [ ] **Step 4: Create the live manifest**

Record project ref/name/region, function version, `verify_jwt`, entrypoint, and deployed SHA. The audited SHA values are:

```text
free-llm-router        ae036a25ae3c074ed7f539d95f2ea684657f4df1903089c7b0b8ebb92ba7d055
global-free-llm-mesh   876b17d6dab3fc922972fe318ba815a6b7eeecf1f8dbc34c8836325bd9bf0941
github-llm-scanner     cbd74c772ba79cde29b3a756ec6af191b6466a023394479a59497a6a4d89bfec
github-llm-verifier    fc7bb02862c6ce56d3a9e73b8436825e43fa94257a34df0aa7dbb81453bcbc96
github-admin-gateway   37084cb752e206f0b938b1d16f637d3e77b46df88a24b965bf0728134eefccb9
skill-installer        6b5b8c59f88022a5c1f73cf594158ec6d0b1e89d01c683301e000d6a6f259e6e
skill-orchestrator     3f9609a5ef85f4f84addc2e634bd12ae155337c8e610ad3120823ce2c8337fe6
skill-router           c479be049a86b6b2f91a2fce7033d68bca54e112704810a46911618a0c8863a9
prompt-compiler        ea6e9d86bb99d25659434d8281d294ce0b3db5ef4e6556c548a6884dffaca044
task-orchestrator      dbb884001bd055dd7a191e69efa17883d7a46cef88b643fac29e3ec260ce2435
```

- [ ] **Step 5: Type-check recovered source**

Run from each function directory so its import map is honored:

```bash
for entry in supabase/functions/*/index.ts; do
  (cd "$(dirname "$entry")" && deno check index.ts)
done
```

Expected: PASS.

- [ ] **Step 6: Run tests and commit**

```bash
pytest -q tests/test_function_manifest.py
git add supabase/functions supabase/FUNCTION_MANIFEST.json tests/test_function_manifest.py
git commit -m 'chore: recover live edge function source'
```

---

### Task 3: Recover the database baseline read-only

**Files:**
- Create/replace: `supabase/migrations/20260912_live_snapshot.sql`
- Create: `docs/architecture/live-baseline-2026-09-12.md`
- Create: `tests/test_database_baseline_contract.py`

**Interfaces:**
- Consumes only read-only SQL introspection.
- Produces schema/function/trigger/index definitions without production data or credentials.

- [ ] **Step 1: Write failing baseline tests**

```python
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
```

- [ ] **Step 2: Verify RED**

Run: `pytest -q tests/test_database_baseline_contract.py`

- [ ] **Step 3: Introspect objects**

Capture private tables/views/sequences, `pg_get_functiondef` for private functions, `pg_get_triggerdef` for non-internal triggers, `pg_indexes` for private indexes, and cron metadata limited to `jobid, jobname, schedule, active`. Do not capture secret-bearing request bodies.

- [ ] **Step 4: Create SQL recovery baseline**

Header must be:

```sql
-- PORYA OMNI live schema baseline
-- Captured read-only from Supabase project aupkeramhsufnmhkbihl on 2026-09-12.
-- Recovery baseline only; do not apply to the existing production project.
```

Include object definitions only, no production rows.

- [ ] **Step 5: Create human-readable live baseline**

Record exact audited state:

```text
project: free-llm-router
ref: aupkeramhsufnmhkbihl
region: eu-central-1
status: ACTIVE_HEALTHY
edge functions: 10
skills: 0
active triggers: 0
skill chunks: 0
skill assets: 0
github discovery rows: 47
enabled dynamic providers: 0
task executions: 0
skill executions: 0
install id: mega-skills-3000-v1
install status: staging
expected skills: 3000
expected triggers: 15000
payload chunks: 1
payload chars: 20000
```

Record advisor findings: unindexed FK on `dynamic_llm_providers(source_repo_id)`, duplicate `skill_chunks(skill_id,chunk_index)` index, `pg_net` in public, and private RLS/no-policy notices as informational.

- [ ] **Step 6: Verify GREEN and commit**

```bash
pytest -q tests/test_database_baseline_contract.py
git add supabase/migrations/20260912_live_snapshot.sql docs/architecture/live-baseline-2026-09-12.md tests/test_database_baseline_contract.py
git commit -m 'chore: capture live database baseline'
```

---

### Task 4: Recover existing audit tests and non-secret installer tooling

**Files:**
- Recover: `tests/test_mega_skills_installation.py`
- Recover: `tests/test_scanner_eligibility.py`
- Recover: `tests/test_skill_orchestrator_contract.py`
- Recover: `tests/test_verifier_hosted_precedence.py`
- Recover: `tools/install_mega_skills.py`
- Recover: `skills/registry/skills-manifest.json`
- Recover: `skills/registry/triggers.json`
- Recover: `skills/route.py`
- Recover: `skills-source/MANIFEST.json`

**Interfaces:**
- Consumes the audited `porya-omni-llm-orchestrator-progress-v2.zip` snapshot.
- Produces baseline tests/metadata without committing source ZIPs or generated payloads.

- [ ] **Step 1: Copy these files verbatim from the audited snapshot**

Do not copy `.pytest_cache/`, `skills-source/*.zip`, `skills/installed/`, or `skills/original/` in this phase.

- [ ] **Step 2: Run baseline tests not requiring materialized skill bodies**

```bash
pytest -q tests/test_scanner_eligibility.py tests/test_skill_orchestrator_contract.py tests/test_verifier_hosted_precedence.py
```

Expected: PASS.

- [ ] **Step 3: Preserve the full skill invariant test unchanged**

`tests/test_mega_skills_installation.py` remains strict; it becomes mandatory once the next installer plan materializes the canonical skill artifact. Do not weaken it with a skip decorator.

- [ ] **Step 4: Commit**

```bash
git add tests tools skills/registry skills/route.py skills-source/MANIFEST.json
git commit -m 'test: recover orchestration baseline contracts'
```

---

### Task 5: Add baseline CI and secret guard

**Files:**
- Create: `.github/workflows/baseline-ci.yml`
- Modify: `tests/test_repository_contract.py`

**Interfaces:**
- Produces repository safety, Python contract, and Deno checks on pushes and PRs.

- [ ] **Step 1: Add failing CI-presence test**

```python
def test_baseline_ci_exists():
    workflow = ROOT / '.github' / 'workflows' / 'baseline-ci.yml'
    assert workflow.is_file()
    text = workflow.read_text(encoding='utf-8')
    assert 'pytest' in text
    assert 'deno check' in text
    assert 'check_repository_contract.py' in text
```

- [ ] **Step 2: Verify RED**

Run: `pytest -q tests/test_repository_contract.py::test_baseline_ci_exists`

- [ ] **Step 3: Create CI**

```yaml
name: baseline-ci
on:
  push:
    branches: [main, "audit/**"]
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Repository guard
        run: python scripts/audit/check_repository_contract.py
      - name: Python contracts
        run: |
          python -m pip install --upgrade pip pytest
          pytest -q tests/test_repository_contract.py tests/test_function_manifest.py tests/test_database_baseline_contract.py tests/test_scanner_eligibility.py tests/test_skill_orchestrator_contract.py tests/test_verifier_hosted_precedence.py
      - name: Deno checks
        shell: bash
        run: |
          set -euo pipefail
          for entry in supabase/functions/*/index.ts; do
            (cd "$(dirname "$entry")" && deno check index.ts)
          done
```

- [ ] **Step 4: Run CI-equivalent commands locally**

```bash
python scripts/audit/check_repository_contract.py
pytest -q tests/test_repository_contract.py tests/test_function_manifest.py tests/test_database_baseline_contract.py tests/test_scanner_eligibility.py tests/test_skill_orchestrator_contract.py tests/test_verifier_hosted_precedence.py
for entry in supabase/functions/*/index.ts; do (cd "$(dirname "$entry")" && deno check index.ts); done
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/baseline-ci.yml tests/test_repository_contract.py
git commit -m 'ci: add baseline recovery checks'
```

---

### Task 6: Final recovery checkpoint

**Files:**
- Create: `SNAPSHOT_MANIFEST.json`
- Modify: `docs/architecture/live-baseline-2026-09-12.md`

**Interfaces:**
- Produces a reviewed checkpoint from which installer/router/orchestrator hardening plans can safely branch.

- [ ] **Step 1: Create snapshot manifest**

```json
{
  "snapshot_date": "2026-09-12",
  "branch": "audit/omni-v4-hardening",
  "supabase_project_ref": "aupkeramhsufnmhkbihl",
  "production_mutated": false,
  "edge_function_count": 10,
  "skill_install_state": {
    "expected_skills": 3000,
    "expected_triggers": 15000,
    "installed_skills": 0,
    "installed_triggers": 0,
    "status": "staging"
  },
  "baseline_tests": {"audited_snapshot_pytest": "8 passed"}
}
```

- [ ] **Step 2: Verify production was not changed**

Re-read all ten live Edge Function SHAs and compare to Task 2. Query:

```sql
select install_id,status,installed_skills,installed_triggers,error
from private.skill_install_runs
where install_id='mega-skills-3000-v1';
```

Expected: `staging`, `0`, `0`, no new deployment/migration performed by this phase.

- [ ] **Step 3: Run final baseline gate**

```bash
python scripts/audit/check_repository_contract.py
pytest -q tests/test_repository_contract.py tests/test_function_manifest.py tests/test_database_baseline_contract.py tests/test_scanner_eligibility.py tests/test_skill_orchestrator_contract.py tests/test_verifier_hosted_precedence.py
for entry in supabase/functions/*/index.ts; do (cd "$(dirname "$entry")" && deno check index.ts); done
```

Expected: PASS.

- [ ] **Step 4: Append verification evidence**

Record: production behavior changed = no; Edge deployments = no; DB migrations applied = no; repository guard = pass; Python contracts = pass; Deno checks = pass; next plan = resumable Mega Skills artifact + installer activation.

- [ ] **Step 5: Commit**

```bash
git add SNAPSHOT_MANIFEST.json docs/architecture/live-baseline-2026-09-12.md
git commit -m 'docs: checkpoint recovered production baseline'
```

- [ ] **Step 6: Open review PR**

Open `audit/omni-v4-hardening -> main` titled `chore: recover PORYA OMNI production baseline` with body:

```markdown
This PR recovers the current live source and database contract into Git.
It intentionally performs no production deployment and no skill activation.
Subsequent hardening work will build on this audited checkpoint.
```

Do not merge until CI passes and recovered source has been compared against live Supabase.