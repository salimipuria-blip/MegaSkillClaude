#!/bin/bash
# usage: turn.sh <n> "<message>"   (resumes the session in $S/session_id when present)
S=$(cd "$(dirname "$0")" && pwd)
export HOME=$S/home
cd "$HOME/work"
RESUME=()
[ -f "$S/session_id" ] && RESUME=(--resume "$(cat "$S/session_id")")
env -u CLAUDE_CODE_USER_EMAIL -u CLAUDE_CODE_ACCOUNT_UUID claude -p "$2" "${RESUME[@]}" --output-format stream-json --verbose \
  --permission-mode bypassPermissions > "$S/turn$1.jsonl" 2> "$S/turn$1.err"
python3 - "$S/turn$1.jsonl" "$S/session_id" <<'PY'
import json, sys
sid=None; final=None
for line in open(sys.argv[1]):
    try: ev=json.loads(line)
    except ValueError: continue
    sid = ev.get("session_id") or sid
    if ev.get("type")=="assistant":
        for c in ev["message"]["content"]:
            if c.get("type")=="tool_use":
                print("TOOL:", c["name"], json.dumps(c.get("input"), ensure_ascii=False)[:300])
    if ev.get("type")=="result":
        final=ev.get("result")
open(sys.argv[2],"w").write(sid or "")
print("\n=== FINAL ===\n", final)
PY
