# porya-omni-llm-orchestrator

PORYA OMNI LLM Orchestrator — preinstalled Mega Skills 3000, Supabase orchestration, free LLM mesh, routing and verification.

## Source of truth

- GitHub owns all deployable Edge Function source, SQL migrations, tests, benchmark code, and deployment configuration templates.
- Supabase Secrets/Vault owns credentials and secret values. Secret material must never be committed to Git.
- Canonical skill artifacts are tracked by hashes/checksums; generated ZIPs and install payloads are not source-controlled.
- Production deployments must originate from reviewed commits and remain reproducible from this repository.

## Safety

Run `python scripts/audit/check_repository_contract.py` before committing changes. The guard rejects committed secret-like files and generated archives that must stay outside Git.
