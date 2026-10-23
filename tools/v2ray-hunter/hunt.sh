#!/usr/bin/env bash
# V2Ray Hunter: collect free public configs, test real delay from YOUR network,
# keep the fastest N. Works on Linux, macOS, Termux (Android) and Git Bash.
# Usage: bash hunt.sh [COUNT=20] [MAX_DELAY_MS=100]
set -euo pipefail

COUNT="${1:-20}"
MAX_DELAY="${2:-100}"
DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$DIR/work"
OUT="$DIR/output"
KNIFE_VERSION="${KNIFE_VERSION:-latest}"
mkdir -p "$WORK/subs" "$OUT"

# --- 1. xray-knife (Xray-core + sing-box tester) ---
KNIFE="$WORK/xray-knife"
if [ ! -x "$KNIFE" ]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)           asset=Xray-knife-linux-64.zip ;;
    Linux-aarch64|Linux-arm64) asset=Xray-knife-linux-arm64-v8a.zip ;;
    Darwin-arm64)           asset=Xray-knife-macos-arm64.zip ;;
    Darwin-x86_64)          asset=Xray-knife-macos-64.zip ;;
    MINGW*|MSYS*|CYGWIN*)   asset=Xray-knife-windows-64.zip ;;
    *) echo "unsupported platform: $(uname -s)-$(uname -m)"; exit 1 ;;
  esac
  if [ "$KNIFE_VERSION" = latest ]; then
    url="https://github.com/lilendian0x00/xray-knife/releases/latest/download/$asset"
  else
    url="https://github.com/lilendian0x00/xray-knife/releases/download/$KNIFE_VERSION/$asset"
  fi
  echo "downloading $asset ..."
  curl -fsSL -m 120 -o "$WORK/knife.zip" "$url"
  unzip -oq "$WORK/knife.zip" -d "$WORK"
  [ -f "$WORK/xray-knife.exe" ] && KNIFE="$WORK/xray-knife.exe"
  chmod +x "$KNIFE"
fi

# --- 2. fetch sources (raw.githubusercontent, then jsDelivr mirror) ---
i=0
while read -r src; do
  case "$src" in ''|'#'*) continue ;; esac
  i=$((i+1))
  repo_path="${src#https://raw.githubusercontent.com/}"   # owner/repo/branch/path
  owner_repo="$(echo "$repo_path" | cut -d/ -f1-2)"
  branch="$(echo "$repo_path" | cut -d/ -f3)"
  path="$(echo "$repo_path" | cut -d/ -f4-)"
  mirror="https://cdn.jsdelivr.net/gh/$owner_repo@$branch/$path"
  if curl -fsSL -m 60 "$src" -o "$WORK/subs/$i.txt" 2>/dev/null \
     || curl -fsSL -m 60 "$mirror" -o "$WORK/subs/$i.txt" 2>/dev/null; then
    echo "ok   $owner_repo"
  else
    echo "fail $owner_repo"
  fi
done < "$DIR/sources.txt"

# --- 3. merge, base64-decode, dedupe ---
python3 - "$WORK/subs" "$WORK/all.txt" <<'PY'
import base64, glob, os, re, sys
links = set()
for f in glob.glob(os.path.join(sys.argv[1], '*.txt')):
    t = open(f, errors='ignore').read().strip()
    if '://' not in t[:200]:
        try:
            t = base64.b64decode(t + '=' * (-len(t) % 4)).decode(errors='ignore')
        except Exception:
            pass
    for line in t.splitlines():
        line = line.strip()
        if re.match(r'^(vless|vmess|trojan|ss|hysteria2|hy2)://', line):
            links.add(line)
open(sys.argv[2], 'w').write('\n'.join(links))
print(f'{len(links)} unique configs')
PY

# --- 4. real-delay test (the same thing v2rayNG's "Real delay" does) ---
"$KNIFE" http -f "$WORK/all.txt" --prescan --prescan-timeout 1500 \
  -d 1500 -t 100 --rip=false --diagnose=false \
  -u "https://www.gstatic.com/generate_204" \
  -x csv -o "$WORK/result.csv"

# --- 5. pick the fastest, write subscription + readable list ---
python3 - "$WORK/result.csv" "$OUT" "$COUNT" "$MAX_DELAY" <<'PY'
import base64, csv, os, sys
src, out, count, max_delay = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
rows = [r for r in csv.DictReader(open(src, errors='replace')) if r['status'] == 'passed']
rows.sort(key=lambda r: int(r['delay']))
fast = [r for r in rows if int(r['delay']) <= max_delay][:count]
if len(fast) < count:
    print(f'only {len(fast)} configs under {max_delay}ms; filling with the next fastest')
    fast = rows[:count]
links = [r['link'] for r in fast]
open(os.path.join(out, 'best.txt'), 'w').write('\n'.join(links) + '\n')
open(os.path.join(out, 'best_sub_base64.txt'), 'w').write(base64.b64encode('\n'.join(links).encode()).decode())
with open(os.path.join(out, 'best_report.txt'), 'w') as f:
    for n, r in enumerate(fast, 1):
        f.write(f"{n:2}. {r['delay']:>5} ms  {r['link'].split('://')[0]:9}  {r['link'][:80]}\n")
print(open(os.path.join(out, 'best_report.txt')).read())
print(f'{len(rows)} passed in total -> {out}/best.txt')
PY
