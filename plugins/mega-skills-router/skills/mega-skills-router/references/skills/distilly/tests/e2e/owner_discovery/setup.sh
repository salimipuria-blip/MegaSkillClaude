#!/bin/bash
set -e
S=$(cd "$(dirname "$0")" && pwd)
T=$S/home
rm -rf "$T"; mkdir -p "$T/work" "$T/Downloads" "$T/.claude"
export HOME=$T
node "$S/../../../bin/distilly.mjs" install claude-code
printf '# My rules\n\n- Use pnpm, not npm.\n' > "$T/.claude/CLAUDE.md"
: > "$T/Downloads/twitter-2026-09-01-archive.zip"
: > "$T/Downloads/holiday.jpg"
for k in gmail google-calendar x weather; do
  claude mcp add -s user "$k" -e MOCK_MCP_LOG="$S/mcp_calls.log" -- python3 "$S/mock_mcp.py" "$k" >/dev/null
done
rm -f "$S/mcp_calls.log"
claude mcp list
