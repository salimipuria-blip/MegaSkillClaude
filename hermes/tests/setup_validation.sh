#!/usr/bin/env bash
# Dependency-free tests for Hermes shell tooling (hermes/#005, #064).
# Run: bash hermes/tests/setup_validation.sh   (exit 0 = all pass; no network, no secrets)
set -u
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." || exit 2
failures=0
pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; failures=$((failures + 1)); }
check() { # check <name> <expected:0|1> <command...>
  local name=$1 want=$2; shift 2
  if "$@" >/dev/null 2>&1; then got=0; else got=1; fi
  if [ "$got" -eq "$want" ]; then pass "$name"; else fail "$name (want $want, got $got)"; fi
}

# shellcheck source=/dev/null
. ./config.sh
# shellcheck source=/dev/null
. ./logger.sh

FAKE_TG_TOKEN="123456789:""AAabcdefghijklmnopqrstuvwxyz0123456789"
check "telegram token: valid"            0 validate_telegram_token "$FAKE_TG_TOKEN"
check "telegram token: missing colon"    1 validate_telegram_token "123456789AAabcdefghijklmnopqrstuvwxyz"
check "telegram token: empty"            1 validate_telegram_token ""
check "telegram user id: valid"          0 validate_telegram_user_id "123456789"
check "telegram user id: letters"        1 validate_telegram_user_id "12a45"
check "gemini key: plausible"            0 validate_gemini_key "AIzaSy-example-key-1234567890"
check "gemini key: empty"                1 validate_gemini_key ""
check "gemini key: whitespace"           1 validate_gemini_key "abc def 1234567890"
check "gemini key: placeholder"          1 validate_gemini_key "YOUR_KEY_HERE"

# env loader: unknown keys ignored, allow-listed keys loaded, values never eval'd.
tmp_env=$(mktemp)
cat > "$tmp_env" <<'EOF'
# comment
GEMINI_API_KEY=test-key-1234567890
UNKNOWN_KEY=should-not-load
EVIL=$(touch /tmp/hermes-pwned)
LOG_LEVEL=debug
EOF
rm -f /tmp/hermes-pwned
unset GEMINI_API_KEY   # so "loaded" below means the loader did it, not the ambient environment
load_env_file "$tmp_env" 2>/dev/null
[ "${GEMINI_API_KEY:-}" = "test-key-1234567890" ] && pass "env loader: allow-listed key loaded" || fail "env loader: allow-listed key loaded"
# The loaded key must be *exported* (a child process has to see it): setting a shell variable only
# would make the bot start without its keys.
child_key=$(bash -c 'printf %s "${GEMINI_API_KEY:-}"')
[ "$child_key" = "test-key-1234567890" ] && pass "env loader: key reaches child processes" || fail "env loader: key reaches child processes (got '$child_key')"
# Same for the mounted-secrets path (K8s-style lowercase files).
tmp_secrets=$(mktemp -d)
printf '%s' 'mounted-key-1234567890' > "$tmp_secrets/gemini_api_key"
unset GEMINI_API_KEY
load_mounted_secrets "$tmp_secrets" 2>/dev/null
child_mounted=$(bash -c 'printf %s "${GEMINI_API_KEY:-}"')
[ "$child_mounted" = "mounted-key-1234567890" ] && pass "mounted secrets: key reaches child processes" || fail "mounted secrets: key reaches child processes (got '$child_mounted')"
rm -rf "$tmp_secrets"
load_env_file "$tmp_env" 2>/dev/null   # restore the env-file state for the checks below
[ -z "${UNKNOWN_KEY:-}" ] && pass "env loader: unknown key ignored" || fail "env loader: unknown key ignored"
[ ! -e /tmp/hermes-pwned ] && pass "env loader: no command execution" || fail "env loader: no command execution"
rm -f "$tmp_env"

# require_env reports missing names without values.
check "require_env: present" 0 require_env GEMINI_API_KEY
check "require_env: missing" 1 require_env HERMES_DEFINITELY_MISSING_VAR

# logger: JSON mode emits parseable-looking single-line JSON, honours LOG_LEVEL.
json_out=$(HERMES_LOG_FORMAT=json LOG_LEVEL=info log_info "hello" task=001 2>&1)
case "$json_out" in *'"level":"info"'*'"msg":"hello"'*'"task":"001"'*) pass "logger: json shape" ;; *) fail "logger: json shape ($json_out)" ;; esac
debug_out=$(LOG_LEVEL=error log_debug "hidden" 2>&1)
[ -z "$debug_out" ] && pass "logger: LOG_LEVEL filters debug" || fail "logger: LOG_LEVEL filters debug"

# setup.sh: help works and sourcing it does not run the installer.
check "setup.sh --help" 0 bash ./setup.sh --help
check "setup.sh unknown flag fails" 1 bash ./setup.sh --no-such-flag
HERMES_LIB_ONLY_OUT=$(bash -c '. ./setup.sh' 2>&1)
case "$HERMES_LIB_ONLY_OUT" in *"Server check"*) fail "setup.sh: sourcing must not run installer" ;; *) pass "setup.sh: sourcing must not run installer" ;; esac

printf '%s failure(s)\n' "$failures"
[ "$failures" -eq 0 ]
