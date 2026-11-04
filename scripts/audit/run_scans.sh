#!/usr/bin/env bash
# Reproducible local audit: runs every gate that works offline and writes the
# evidence to docs/audit/. CI runs the same tools in .github/workflows/security.yml.
#
#   bash scripts/audit/run_scans.sh            # run everything that is installed
#   bash scripts/audit/run_scans.sh --strict    # fail if a tool is missing
#
# Tools (install into a venv, never into system Python):
#   python3 -m venv .venv && . .venv/bin/activate
#   pip install semgrep bandit detect-secrets zizmor
set -uo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
OUT="$ROOT/docs/audit"
STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1
mkdir -p "$OUT"

fail=0
skip=0
note() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
bad()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; fail=$((fail + 1)); }
miss() { printf '\033[1;35m! %s not installed — skipped\033[0m\n' "$*"; skip=$((skip + 1)); }

need() { command -v "$1" >/dev/null 2>&1; }

cd "$ROOT"

note "1/7 Repository contract (python, no dependencies)"
if python3 -m unittest tests.test_audit_contract 2>&1 | tail -3; then ok "audit contract"; else bad "audit contract"; fi

note "2/7 Secret scan: reviewed findings vs .secrets.baseline"
if need detect-secrets; then
  if detect-secrets-hook --baseline .secrets.baseline $(git ls-files '*.js' '*.mjs' '*.ts' '*.py' '*.sh' '*.json' '*.yml' '*.yaml' | head -4000) 2>&1 | tail -5; then
    ok "no new secrets against the baseline"
  else
    bad "new secret-shaped string found"
  fi
else miss detect-secrets; fi

note "3/7 Static analysis (Semgrep, project rules)"
if need semgrep; then
  if SEMGREP_SEND_METRICS=off SEMGREP_ENABLE_VERSION_CHECK=0 \
     semgrep scan --config .semgrep/rules.yml --json --output "$OUT/semgrep.json" --quiet \
       psk hermes orchestrator scripts tests lithos fjcod viking-team bison-brand-book .github >/dev/null 2>&1; then
    ok "semgrep: $(python3 -c "import json;print(len(json.load(open('$OUT/semgrep.json'))['results']))") findings"
  else
    bad "semgrep reported blocking findings (see $OUT/semgrep.json)"
  fi
else miss semgrep; fi

note "4/7 Python security (Bandit)"
if need bandit; then
  if bandit -r scripts orchestrator/scripts orchestrator/supabase -s B404 -f json -o "$OUT/bandit.json" -q; then
    ok "bandit: 0 findings"
  else
    bad "bandit findings (see $OUT/bandit.json)"
  fi
else miss bandit; fi

note "5/7 GitHub Actions hardening (zizmor)"
if need zizmor; then
  # --offline keeps this script true to its header ("every gate that works
  # offline"): without it the artipacked audit needs the GitHub API and the whole
  # run aborts on machines where github.com is unreachable (sandbox/CI egress rules).
  zizmor --offline --format sarif . > "$OUT/zizmor.sarif" 2>/dev/null || true
  if zizmor --offline --persona auditor --min-severity medium --format plain . 2>&1 | grep -q "No findings"; then
    ok "zizmor: no findings (auditor persona)"
  else
    bad "zizmor findings (see $OUT/zizmor.sarif)"
  fi
else miss zizmor; fi

note "6/7 Dependency audit (npm, committed lockfiles only)"
# viking-team/motion is included: it ships a committed lockfile and its remotion
# stack had 10 high advisories until 2026-11-04 — leaving it out of this loop hid them.
for app in fjcod bison-brand-book hermes lithos viking-team/motion; do
  # Nested paths (viking-team/motion) must not leak a slash into the artifact name.
  slug=$(printf '%s' "$app" | tr '/' '-')
  if [ -f "$app/package-lock.json" ]; then
    if ( cd "$app" && npm audit --audit-level=high --json > "$OUT/npm-audit-$slug.json" 2>/dev/null ); then
      ok "$app: no high/critical advisories"
    else
      bad "$app: advisories at high or above (see $OUT/npm-audit-$slug.json)"
    fi
  else
    bad "$app: no package-lock.json committed"
  fi
done

note "7/7 Supply chain: SBOM + skill provenance"
if node scripts/audit/make_sbom.mjs >/dev/null 2>&1; then ok "SBOM regenerated"; else bad "SBOM generation failed"; fi
if python3 scripts/audit/skill_provenance.py --check >/dev/null 2>&1; then
  ok "skill provenance: 0 drift"
else
  bad "skill provenance drifted; run python3 scripts/audit/skill_provenance.py"
fi

printf '\n---------------------------------------------\n'
printf 'failures: %s   skipped (tool missing): %s\n' "$fail" "$skip"
if [ "$fail" -ne 0 ]; then exit 1; fi
if [ "$skip" -ne 0 ] && [ "$STRICT" -eq 1 ]; then
  printf 'strict mode: install the missing tools and re-run\n' >&2
  exit 2
fi
printf 'local audit clean.\n'
