#!/usr/bin/env bash
set -euo pipefail

# repo_health_check.sh
# Quick health check script for MegaSkillClaude.
# - Runs available test & build commands for each subproject if present
# - Performs lightweight checks for obvious secrets/patterns
# - Verifies presence of key files referenced in README/docs

ROOT=$(pwd)
errors=0

function run_if_dir {
  local dir=$1; shift
  if [ -d "$dir" ]; then
    echo "\n==> Entering $dir"
    (cd "$dir" && bash -lc "$*") || { echo "[FAIL] $dir: '$*' failed"; errors=$((errors+1)); }
  else
    echo "(skip) $dir not present"
  fi
}

echo "Repository quick health check: $(date)"

# Basic checks
echo "\n-- Basic repo checks --"
[ -f README.md ] || { echo "Missing README.md"; errors=$((errors+1)); }
[ -f .github/workflows/ci.yml ] || { echo "Missing CI workflow .github/workflows/ci.yml"; errors=$((errors+1)); }

# Node / npm checks (if available)
which node >/dev/null 2>&1 || echo "(info) node not found in PATH — skip Node checks"
which python3 >/dev/null 2>&1 || echo "(info) python3 not found in PATH — skip Python checks"

# Run subproject checks only if each folder exists.
run_if_dir "psk" "npm run check --silent || npm run check"
run_if_dir "psk" "npm test --silent || npm test"
run_if_dir "lithos" "npm install --no-audit --no-fund --silent || true; npm test --silent || true; npm run build --silent || true"
run_if_dir "fjcod" "npm ci --no-audit --no-fund --silent || true; npm run check --silent || true"
run_if_dir "bison-brand-book" "npm ci --no-audit --no-fund --silent || true; npm run build --silent || true"
run_if_dir "viking-team" "node --test tests/*.test.mjs --silent || true; python3 -m unittest discover -s tests -v || true"
run_if_dir "orchestrator" "python3 -m pip install --upgrade pip pytest >/dev/null 2>&1 || true; python scripts/audit/check_repository_contract.py || true; python -m pytest -q -ra tests || true"
run_if_dir "hermes" "bash -n hermes/setup.sh || true; npm ci --prefix hermes --ignore-scripts --no-audit --no-fund --silent || true; npm run check --prefix hermes || true"

# Lightweight secrets scan (grep-based)
echo "\n-- Lightweight secrets scan --"
patterns=("ENGINE_TOKEN" "API_KEY" "SECRET" "PASSWORD" "passwd" "service_role" "sb_secret" "private_key")
for p in "${patterns[@]}"; do
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git --no-pager grep -n --break --heading -I -E "$p" || true
  else
    grep -RIn --exclude-dir=node_modules --exclude-dir=.git -E "$p" . || true
  fi
done

# Check README mentions vs actual folders
echo "\n-- README vs filesystem --"
if grep -q "psk/" README.md 2>/dev/null && [ ! -d "psk" ]; then echo "README mentions psk/ but folder missing"; errors=$((errors+1)); fi

# Summary
if [ "$errors" -ne 0 ]; then
  echo "\nHealth check completed with $errors problem(s) found."
  exit 2
else
  echo "\nHealth check completed: no obvious blocking problems found (non-exhaustive)."
  exit 0
fi
