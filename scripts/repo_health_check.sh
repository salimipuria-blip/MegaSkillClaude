#!/usr/bin/env bash
set -euo pipefail

# Lightweight, dependency-free checks, safe to run from any working directory.
# Never installs packages, runs lifecycle hooks, loads .env, or dumps file contents.
# Full tests/builds belong to the dedicated project jobs in ci.yml.
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$ROOT"
errors=0

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  errors=$((errors + 1))
}

run_check() {
  local dir=$1
  shift
  printf '\n==> %s: %s\n' "$dir" "$*"
  # Preserve argv; do not reinterpret commands via eval or a login shell.
  if (cd -- "$dir" && "$@"); then
    return 0
  else
    fail "$dir check failed"
  fi
}

printf 'Repository quick health check (no dependency installation)\n'
for file in README.md .env.example .github/workflows/ci.yml \
  .github/dependabot.yml .github/CODEOWNERS .github/RELEASE_CHECKLIST.md \
  .github/ISSUE_TEMPLATE/bug_report.md .github/ISSUE_TEMPLATE/feature_request.md \
  .github/ISSUE_TEMPLATE/tasks.md .github/ISSUE_TEMPLATE/config.yml \
  .github/PROJECT_MANAGEMENT.md docs/ROADMAP_90D.md \
  psk/package.json lithos/package.json fjcod/package.json \
  fjcod/package-lock.json bison-brand-book/package.json \
  bison-brand-book/package-lock.json hermes/package.json hermes/package-lock.json \
  hermes/setup.sh orchestrator/scripts/audit/check_repository_contract.py \
  viking-team/team/index.html viking-team/team/styles.css viking-team/team/app.js; do
  [ -s "$file" ] || fail "Missing or empty required file: $file"
done

# Missing required tools are failures, never false-green skips.
for tool in git node npm python3; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required tool not found: $tool"
done
if [ "$errors" -ne 0 ]; then
  printf '\nHealth check prerequisites failed: %s problem(s).\n' "$errors" >&2
  exit 2
fi

run_check psk npm --ignore-scripts run check
run_check lithos node --check api/buffer-sync.js
run_check hermes bash -n setup.sh
run_check hermes npm --ignore-scripts run check
run_check viking-team node --check --input-type=module < viking-team/team/app.js
run_check orchestrator python3 scripts/audit/check_repository_contract.py

# Inspect tracked dotenv NAMES only. Never print matching lines or secret values,
# and never recursively scan ignored/untracked local files. This is not a secret scanner.
printf '\n-- Tracked environment-file hygiene --\n'
if tracked_env=$(git ls-files -- '.env' '.env.*' '**/.env' '**/.env.*'); then
  while IFS= read -r file; do
    case "$file" in
      ''|.env.example|*/.env.example) ;;
      *) fail 'Non-example environment file is tracked; remove it from Git and rotate any exposed credentials.' ;;
    esac
  done <<< "$tracked_env"
else
  fail 'Unable to inspect Git-tracked environment files'
fi

if [ "$errors" -ne 0 ]; then
  printf '\nHealth check completed with %s problem(s).\n' "$errors" >&2
  exit 2
fi
printf '\nLightweight health checks passed; full tests/builds run in project CI jobs.\n'
