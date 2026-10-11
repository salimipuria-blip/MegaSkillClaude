#!/bin/bash
# Cloud-session setup: install lithos dev dependencies (vite) so
# `npm test && npm run build` work from the first command. psk has none.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}/lithos"

# No lockfile is tracked; --no-package-lock keeps the working tree clean.
npm install --no-package-lock --ignore-scripts --no-audit --no-fund --loglevel=error
