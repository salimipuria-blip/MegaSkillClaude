#!/usr/bin/env bash
# نصب مهارت‌ها در Claude Code — bash install.sh [مسیر-پروژه]
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/skills"
if [ -n "${1:-}" ]; then DEST="$1/.claude/skills"; else DEST="$HOME/.claude/skills"; fi
mkdir -p "$DEST"
cp -r "$SRC/"* "$DEST/"
installed=$(find "$SRC" -mindepth 1 -maxdepth 1 -type d | wc -l)
echo "✅ نصب شد در: $DEST — $installed مهارت این بسته (کل پوشهٔ مقصد: $(ls "$DEST" | wc -l))"
