#!/usr/bin/env bash
# hermes/config.sh — safe env loading + validation for Hermes shell tooling
# (tasks hermes/#002, #004, #024, #060, #095). Safe to `source`; no side effects.
#
# Security rules enforced here:
#   * env files are parsed line-by-line — never `source`d / eval'd;
#   * only allow-listed keys are accepted; unknown keys are ignored with a warning;
#   * a file with group/other permissions is refused when HERMES_ENV_STRICT=1;
#   * mounted-secrets directory (K8s style, HERMES_SECRETS_DIR) wins over env vars:
#     each file's first line becomes the value of the upper-cased file name.
# shellcheck shell=bash

HERMES_KNOWN_ENV_KEYS="GEMINI_API_KEY TELEGRAM_BOT_TOKEN TELEGRAM_USER_ID ALLOWED_USER_ID LOG_LEVEL HERMES_LOG_FORMAT HERMES_INSTALL_LOG TELEMETRY_DISABLE GEMINI_API_BASE TELEGRAM_API_BASE HERMES_SECRETS_DIR"

hermes_is_known_key() {
  case " $HERMES_KNOWN_ENV_KEYS " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# validate_telegram_token <token> — BotFather format: <digits>:<35-ish url-safe chars>
validate_telegram_token() {
  [[ ${1:-} =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]]
}

# validate_telegram_user_id <id>
validate_telegram_user_id() {
  [[ ${1:-} =~ ^[0-9]{5,}$ ]]
}

# validate_gemini_key <key> — Google does not publish a stable key grammar, so we only
# reject values that can never work (empty / whitespace / placeholder). Format-passing
# keys are verified against the API by setup.sh (HTTP status), which is authoritative.
validate_gemini_key() {
  local key=${1:-}
  [ -n "$key" ] || return 1
  [[ $key != *[[:space:]]* ]] || return 1
  case "$key" in CHANGE_ME|YOUR_*|xxx*) return 1 ;; esac
  case "$key" in *'<'*|*'>'*) return 1 ;; esac
  [ "${#key}" -ge 10 ] || return 1
  return 0
}

# load_env_file <path> — parse KEY=VALUE lines for allow-listed keys only.
load_env_file() {
  local file=$1 line key value
  [ -f "$file" ] || { printf 'env file not found: %s\n' "$file" >&2; return 1; }
  if [ "${HERMES_ENV_STRICT:-0}" = "1" ]; then
    local perms
    perms=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || printf '')
    case "$perms" in 600|400) : ;; *) printf 'env file %s must be mode 600 (got %s)\n' "$file" "${perms:-unknown}" >&2; return 1 ;; esac
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in *=*) : ;; *) printf 'ignoring malformed env line in %s\n' "$file" >&2; continue ;; esac
    key=${line%%=*}; value=${line#*=}
    key=$(printf '%s' "$key" | tr -d '[:space:]')
    # Strip one pair of surrounding quotes, if present.
    case "$value" in '"'*) value=${value#\"}; value=${value%\"} ;; "'"*) value=${value#\'}; value=${value%\'} ;; esac
    if ! hermes_is_known_key "$key"; then
      printf 'ignoring unknown env key: %s\n' "$key" >&2; continue
    fi
    printf -v "$key" '%s' "$value"
    # Dynamic name: "${key?}" is the unambiguous form ShellCheck wants (SC2163) and exports the very
    # variable we just set - `export "$key"` exports whatever the value names, which is not the point.
    export "${key?}"
  done < "$file"
}

# load_mounted_secrets [dir] — K8s-style: $dir/gemini_api_key -> GEMINI_API_KEY
load_mounted_secrets() {
  local dir=${1:-${HERMES_SECRETS_DIR:-}} f name value
  [ -n "$dir" ] && [ -d "$dir" ] || return 0
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    name=$(printf '%s' "${f##*/}" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
    hermes_is_known_key "$name" || continue
    # A mounted secret file often has no trailing newline: `read` then returns 1 at EOF but has
    # already filled `value`, so resetting on failure would silently drop the secret.
    IFS= read -r value < "$f" || :
    [ -n "$value" ] || continue
    printf -v "$name" '%s' "$value"
    export "${name?}"
  done
}

# require_env KEY... — fail listing every missing variable (never prints values).
require_env() {
  local missing='' key
  for key in "$@"; do
    [ -n "${!key:-}" ] || missing+=" $key"
  done
  if [ -n "$missing" ]; then
    printf 'missing required environment variables:%s\n' "$missing" >&2
    return 1
  fi
}
