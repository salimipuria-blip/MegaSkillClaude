#!/usr/bin/env bash
# Hermes (full agent) on Oracle Always Free — one-shot installer.
# Gemini brain + Telegram gateway as a systemd user service (survives reboots).
#
# Usage (on the server, as the normal user `ubuntu`):
#   bash setup.sh [--non-interactive] [--check-only] [--help]
#
# Non-interactive (CI / provisioning) — secrets come from the environment, never argv:
#   GEMINI_API_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_USER_ID=... \
#     bash setup.sh --non-interactive
#
# Single-file contract: this script is also fetched alone via `curl -o setup.sh`, so it
# must not depend on sibling files. When run from a repo checkout it prefers the tested
# helpers in config.sh/logger.sh; standalone it uses the identical inline fallbacks.
# Secrets are read hidden, kept out of argv/logs/history, and unset as soon as stored.
set -euo pipefail

MODELS=(gemini-3.8-flash gemini-3.7-flash gemini-3.5-flash-lite gemini-2.5-flash)
GEMINI_API=${GEMINI_API_BASE:-https://generativelanguage.googleapis.com/v1beta}
TELEGRAM_API=${TELEGRAM_API_BASE:-https://api.telegram.org}
NON_INTERACTIVE=0
CHECK_ONLY=0
MIN_FREE_MB=${HERMES_MIN_FREE_MB:-2048}
INSTALL_LOG=${HERMES_INSTALL_LOG:-"$HOME/.hermes/install.log"}

# --- helpers (fallbacks; overridden by config.sh/logger.sh in a repo checkout) -------
say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
validate_telegram_token() { [[ ${1:-} =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]]; }
validate_telegram_user_id() { [[ ${1:-} =~ ^[0-9]{5,}$ ]]; }
validate_gemini_key() {
  local key=${1:-}
  [ -n "$key" ] && [[ $key != *[[:space:]]* ]] && [ "${#key}" -ge 10 ]
}
_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-setup.sh}")" 2>/dev/null && pwd || printf '.')
if [ -f "$_script_dir/config.sh" ] && [ -f "$_script_dir/logger.sh" ]; then
  # shellcheck source=/dev/null
  . "$_script_dir/logger.sh"
  # shellcheck source=/dev/null
  . "$_script_dir/config.sh"
fi
unset _script_dir

usage() {
  cat <<'EOF'
Usage: bash setup.sh [options]
  --non-interactive   Read GEMINI_API_KEY / TELEGRAM_BOT_TOKEN / TELEGRAM_USER_ID from env
  --check-only        Run preflight checks only (OS, disk, network, key/token validity)
  -h, --help          Show this help
Environment: LOG_LEVEL=debug|info|warn|error, HERMES_LOG_FORMAT=text|json,
  HERMES_INSTALL_LOG=<path>, HERMES_MIN_FREE_MB=<MB>, TELEMETRY_DISABLE=1
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --non-interactive) NON_INTERACTIVE=1 ;;
      --check-only) CHECK_ONLY=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
  done
}

# http_status <url> [header...] — prints the HTTP status code, or 000 on network failure.
http_status() {
  local url=$1; shift
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$@" "$url" 2>/dev/null) || code='000'
  printf '%s' "${code:-000}"
}

preflight_network() {
  local tg gem
  tg=$(http_status "$TELEGRAM_API")
  gem=$(http_status "$GEMINI_API/models")
  [ "$tg" != "000" ] || die "Cannot reach Telegram API ($TELEGRAM_API). Check outbound HTTPS/DNS, then re-run."
  [ "$gem" != "000" ] || die "Cannot reach Gemini API ($GEMINI_API). Check outbound HTTPS/DNS, then re-run."
  ok "network: Telegram reachable (HTTP $tg), Gemini reachable (HTTP $gem)"
}

preflight_disk() {
  local free_mb
  free_mb=$(df -Pm "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
  [[ $free_mb =~ ^[0-9]+$ ]] || { printf 'warning: could not determine free disk space\n' >&2; return 0; }
  [ "$free_mb" -ge "$MIN_FREE_MB" ] || die "Only ${free_mb} MB free in \$HOME; Hermes needs at least ${MIN_FREE_MB} MB."
  ok "disk: ${free_mb} MB free"
}

# validate_gemini — sets MODEL; distinguishes auth/quota/network failures (hermes/#004).
validate_gemini() {
  local code body_file
  body_file=$(mktemp)
  code=$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 30 \
    -H "x-goog-api-key: $GEMINI_KEY" "$GEMINI_API/models?pageSize=200" 2>/dev/null) || code='000'
  case "$code" in
    200) ;;
    000) rm -f "$body_file"; die "Network error while validating the Gemini key. Check connectivity and re-run." ;;
    401|403) rm -f "$body_file"; die "Google rejected the key (HTTP $code). Create a fresh key at aistudio.google.com → Get API key, then re-run. (If you are in a restricted region, connect a VPN first.)" ;;
    429) rm -f "$body_file"; die "Gemini free quota is exhausted (HTTP 429). Wait a few minutes and re-run." ;;
    *) rm -f "$body_file"; die "Unexpected Gemini response (HTTP $code) while validating the key." ;;
  esac
  MODEL=""
  local m
  for m in "${MODELS[@]}"; do
    if grep -q "\"models/$m\"" "$body_file"; then MODEL=$m; break; fi
  done
  rm -f "$body_file"
  [ -n "$MODEL" ] || die "None of ${MODELS[*]} is available to this key. Send a screenshot of this line."
  ok "Gemini key works, model: $MODEL"
}

validate_telegram() {
  local code body
  code=$(curl -sS -o /tmp/.hermes-bot.json -w '%{http_code}' --max-time 30 \
    "$TELEGRAM_API/bot$TG_TOKEN/getMe" 2>/dev/null) || code='000'
  body=$(cat /tmp/.hermes-bot.json 2>/dev/null || true); rm -f /tmp/.hermes-bot.json
  case "$code" in
    200) ok "bot: @$(sed -n 's/.*"username":"\([^"]*\)".*/\1/p' <<<"$body")" ;;
    000) die "Network error while validating the Telegram token." ;;
    401|404) die "Telegram rejected the token (HTTP $code). Copy a fresh token from @BotFather → /token." ;;
    *) die "Unexpected Telegram response (HTTP $code) while validating the token." ;;
  esac
}

collect_secrets() {
  if [ "$NON_INTERACTIVE" -eq 1 ]; then
    GEMINI_KEY=${GEMINI_API_KEY:-}
    TG_TOKEN=${TELEGRAM_BOT_TOKEN:-}
    TG_USER=${TELEGRAM_USER_ID:-${ALLOWED_USER_ID:-}}
    [ -n "$GEMINI_KEY" ] || die "non-interactive: GEMINI_API_KEY is not set"
    [ -n "$TG_TOKEN" ] || die "non-interactive: TELEGRAM_BOT_TOKEN is not set"
    [ -n "$TG_USER" ] || die "non-interactive: TELEGRAM_USER_ID is not set"
  else
    read -rsp "Paste your Gemini API key (hidden), then Enter: " GEMINI_KEY; echo
    read -rsp "Paste the bot token from BotFather (hidden), then Enter: " TG_TOKEN; echo
    read -rp "Your numeric Telegram user ID (send /start to @userinfobot to get it): " TG_USER
  fi
  validate_gemini_key "$GEMINI_KEY" || die "That Gemini key looks malformed (empty, whitespace, or placeholder). Copy it again from aistudio.google.com."
  validate_telegram_token "$TG_TOKEN" || die "That does not look like a bot token (expected <digits>:<secret> from @BotFather)."
  validate_telegram_user_id "$TG_USER" || die "User ID must be digits only (send /start to @userinfobot)."
}

main() {
  parse_args "$@"
  [ "$(id -u)" -ne 0 ] || die "Run as the normal user (ubuntu), not root."
  mkdir -p "$(dirname -- "$INSTALL_LOG")"
  touch "$INSTALL_LOG" 2>/dev/null && chmod 600 "$INSTALL_LOG" 2>/dev/null || true
  if [ -t 1 ] && touch "$INSTALL_LOG" 2>/dev/null; then
    exec > >(tee -a "$INSTALL_LOG") 2>&1
  fi
  if command -v load_mounted_secrets >/dev/null 2>&1; then load_mounted_secrets; fi

  say "1/6 Server check"
  if [ -r /etc/os-release ]; then . /etc/os-release; echo "OS: ${PRETTY_NAME:-unknown} | arch: $(uname -m)"; fi
  preflight_disk
  preflight_network
  if [ "$CHECK_ONLY" -eq 0 ]; then
    command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1 &&
      { sudo apt-get update -qq && sudo apt-get install -y -qq curl git ca-certificates >/dev/null; } || true
  fi
  ok "base packages"

  say "2/6 Install Hermes (official installer)"
  if [ "$CHECK_ONLY" -eq 1 ]; then
    ok "check-only: skipping install/configure/service steps"
  else
    if ! command -v hermes >/dev/null 2>&1; then
      curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
    fi
    export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"
    command -v hermes >/dev/null 2>&1 || { [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc" || true; }
    command -v hermes >/dev/null 2>&1 || die "hermes not on PATH. Open a new SSH session and run this script again."
    ok "hermes $(hermes --version 2>/dev/null | head -1)"
  fi

  say "3/6 Gemini key"
  say "4/6 Telegram"
  collect_secrets
  validate_gemini
  validate_telegram

  if [ "$CHECK_ONLY" -eq 1 ]; then
    say "Summary"
    ok "preflight passed: disk, network, Gemini key (model: $MODEL), Telegram token, user ID"
    unset GEMINI_KEY TG_TOKEN GEMINI_API_KEY TELEGRAM_BOT_TOKEN
    return 0
  fi

  say "5/6 Configure Hermes"
  hermes config set model.provider gemini
  hermes config set model.default "$MODEL"
  hermes config set GEMINI_API_KEY "$GEMINI_KEY"
  hermes config set TELEGRAM_BOT_TOKEN "$TG_TOKEN"
  hermes config set TELEGRAM_ALLOWED_USERS "$TG_USER"
  unset GEMINI_KEY TG_TOKEN GEMINI_API_KEY TELEGRAM_BOT_TOKEN
  # Restrict anything secret-bearing Hermes may have written (hermes/#045).
  [ -f "$HOME/.hermes/.env" ] && chmod 600 "$HOME/.hermes/.env" || true
  ok "config saved (only you can talk to the bot)"

  say "6/6 Gateway as a service (auto-start on boot, auto-restart on crash)"
  sudo loginctl enable-linger "$(id -un)" 2>/dev/null || true
  hermes gateway install --force --start-now --start-on-login
  sleep 5
  hermes gateway status || true

  say "Summary"
  ok "model: $MODEL"
  ok "gateway: installed as a systemd user service"
  ok "install log: $INSTALL_LOG"
  echo "Now send your bot a message in Telegram: سلام، خودت را معرفی کن"
  echo "If it stays silent:  journalctl --user -u hermes-gateway -n 50 --no-pager   (send a screenshot)"
}

# Guard: sourcing (tests) must not execute the installer.
if [ "${BASH_SOURCE[0]:-}" = "${0:-}" ] || [ "${HERMES_SETUP_RUN:-0}" = "1" ]; then
  main "$@"
fi
