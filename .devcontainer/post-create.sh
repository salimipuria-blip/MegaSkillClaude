#!/usr/bin/env bash
# One-time setup for a Codespace / dev container. Each step is independent: a failing project
# install is reported and the rest continue, so the editor is always usable.
set -u
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }
failed=()

for project in hermes lithos fjcod bison-brand-book; do
  step "npm ci ($project)"
  npm ci --prefix "$project" --no-audit --no-fund || failed+=("$project")
done

step "npm install (psk, no lockfile)"
npm install --prefix psk --no-audit --no-fund || failed+=("psk")

step "Python test tools"
python3 -m pip install --quiet --user pytest pyyaml || failed+=("pip")

step "Deno (orchestrator gateway)"
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh -s -- -y >/dev/null 2>&1 \
    && echo 'export PATH="$HOME/.deno/bin:$PATH"' >> "$HOME/.bashrc" \
    || failed+=("deno")
fi

step "Project doctor (quick list)"
node scripts/doctor.mjs --list || true

if [ ${#failed[@]} -gt 0 ]; then
  printf '\nSetup finished with failures: %s\n' "${failed[*]}"
else
  printf '\nSetup finished. Run `claude` (or open the Claude Code panel) to start working.\n'
fi
