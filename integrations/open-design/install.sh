#!/usr/bin/env bash
set -euo pipefail
# IMS: Open Design pinned integration; isolated from the monorepo.
UPSTREAM=https://github.com/nexu-io/open-design.git
PIN=59e4f2ae85de7e7318a5e6bdcf3a34584c4b7582
TARGET="$HOME/.local/share/ims/open-design"
for cmd in git docker openssl python3 curl; do command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd"; exit 2; }; done
docker compose version >/dev/null || { echo "Docker Compose v2 required"; exit 2; }
if [ ! -d "$TARGET/.git" ]; then
  mkdir -p "$(dirname "$TARGET")"
  git clone "$UPSTREAM" "$TARGET"
fi
git -C "$TARGET" fetch origin "$PIN" --depth 1
git -C "$TARGET" checkout --detach "$PIN"
cd "$TARGET/deploy"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  token="$(openssl rand -hex 32)"
  python3 -c 'import pathlib,sys,re;p=pathlib.Path(".env");s=p.read_text();p.write_text(re.sub(r"(?m)^OD_API_TOKEN=.*$", "OD_API_TOKEN="+sys.argv[1],s))' "$token"
  unset token
fi
docker compose up -d
echo "Open Design launched in containers; checking local health..."
curl --fail --silent --show-error --retry 5 --retry-delay 2 http://127.0.0.1:7456/api/health >/dev/null
echo "Open Design: HEALTHY at http://127.0.0.1:7456 (local only)"
