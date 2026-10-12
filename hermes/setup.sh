#!/usr/bin/env bash
# Hermes on Oracle Always Free: one-shot install, Gemini brain, Telegram gateway as a
# systemd service (survives reboots). Run on the server as user `ubuntu`:
#   bash setup.sh
# Secrets are read from the keyboard (hidden) and written only to Hermes' own .env on
# this server — never into this repo, a chat, or the shell history.
set -euo pipefail

MODELS=(gemini-3.8-flash gemini-3.7-flash gemini-3.5-flash-lite gemini-2.5-flash)
GEMINI_API=https://generativelanguage.googleapis.com/v1beta

say()  { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "Run as the normal user (ubuntu), not root."

say "1/6 Server check"
. /etc/os-release
echo "OS: $PRETTY_NAME | arch: $(uname -m) | RAM: $(free -g | awk '/Mem:/{print $2}') GB"
sudo apt-get update -qq && sudo apt-get install -y -qq curl git ca-certificates >/dev/null
ok "base packages"

say "2/6 Install Hermes (official installer)"
if ! command -v hermes >/dev/null 2>&1; then
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
fi
export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"
command -v hermes >/dev/null 2>&1 || { [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"; }
command -v hermes >/dev/null 2>&1 || die "hermes not on PATH. Open a new SSH session and run this script again."
ok "hermes $(hermes --version 2>/dev/null | head -1)"

say "3/6 Gemini key"
read -rsp "Paste your Gemini API key (hidden), then Enter: " GEMINI_KEY; echo
[ -n "$GEMINI_KEY" ] || die "empty key"
AVAILABLE=$(curl -fsS -H "x-goog-api-key: $GEMINI_KEY" "$GEMINI_API/models?pageSize=200" 2>/dev/null) \
  || die "Google rejected the key (401/403). Copy it again from aistudio.google.com."
MODEL=""
for m in "${MODELS[@]}"; do
  if grep -q "\"models/$m\"" <<<"$AVAILABLE"; then MODEL=$m; break; fi
done
[ -n "$MODEL" ] || die "None of ${MODELS[*]} is available to this key. Send a screenshot of this line."
ok "key works, model: $MODEL"

say "4/6 Telegram"
read -rsp "Paste the bot token from BotFather (hidden), then Enter: " TG_TOKEN; echo
[[ "$TG_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || die "That does not look like a bot token."
BOT=$(curl -fsS "https://api.telegram.org/bot$TG_TOKEN/getMe" 2>/dev/null) || die "Telegram rejected the token."
ok "bot: @$(sed -n 's/.*"username":"\([^"]*\)".*/\1/p' <<<"$BOT")"
read -rp "Your numeric Telegram user ID (send /start to @userinfobot to get it): " TG_USER
[[ "$TG_USER" =~ ^[0-9]{5,}$ ]] || die "User ID must be digits only."

say "5/6 Configure Hermes"
hermes config set model.provider gemini
hermes config set model.default "$MODEL"
hermes config set GEMINI_API_KEY "$GEMINI_KEY"
hermes config set TELEGRAM_BOT_TOKEN "$TG_TOKEN"
hermes config set TELEGRAM_ALLOWED_USERS "$TG_USER"
unset GEMINI_KEY TG_TOKEN
ok "config saved (only you can talk to the bot)"

say "6/6 Gateway as a service (auto-start on boot, auto-restart on crash)"
sudo loginctl enable-linger "$(id -un)"
hermes gateway install --force --start-now --start-on-login
sleep 5
hermes gateway status || true

say "Done"
echo "Now send your bot a message in Telegram: سلام، خودت را معرفی کن"
echo "If it stays silent:  journalctl --user -u hermes-gateway -n 50 --no-pager   (send a screenshot)"
