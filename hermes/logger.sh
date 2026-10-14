#!/usr/bin/env bash
# hermes/logger.sh — structured logging for Hermes shell tooling (task hermes/#008, #025, #082).
#
# Contract:
#   LOG_LEVEL=debug|info|warn|error   (default: info)
#   HERMES_LOG_FORMAT=text|json       (default: text; json = one JSON object per line)
#   log_debug|log_info|log_warn|log_error "message" [key=value ...]
# Secrets must never be passed to these functions. Values are JSON-escaped, never eval'd.
# Safe to `source`; sourcing has no side effects beyond defaults.

_hermes_log_level_num() {
  case "${1:-info}" in
    debug) printf '10' ;;
    info)  printf '20' ;;
    warn)  printf '30' ;;
    error) printf '40' ;;
    *)     printf '20' ;;
  esac
}

_hermes_json_escape() {
  # Minimal, dependency-free JSON string escaping (no control chars beyond \n \r \t expected).
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

_hermes_log() {
  local level=$1; shift
  local msg=${1:-}; [ $# -gt 0 ] && shift
  local want have
  want=$(_hermes_log_level_num "$level")
  have=$(_hermes_log_level_num "${LOG_LEVEL:-info}")
  [ "$want" -ge "$have" ] || return 0
  local ts
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || printf 'unknown-time')
  if [ "${HERMES_LOG_FORMAT:-text}" = "json" ]; then
    local out kv k v
    out="{\"ts\":\"$ts\",\"level\":\"$level\",\"msg\":\"$(_hermes_json_escape "$msg")\""
    for kv in "$@"; do
      case "$kv" in
        *=*) k=${kv%%=*}; v=${kv#*=}; out+=",\"$(_hermes_json_escape "$k")\":\"$(_hermes_json_escape "$v")\"" ;;
        *)   out+=",\"detail\":\"$(_hermes_json_escape "$kv")\"" ;;
      esac
    done
    printf '%s}\n' "$out" >&2
  else
    printf '%s [%s] %s' "$ts" "$(printf '%s' "$level" | tr '[:lower:]' '[:upper:]')" "$msg" >&2
    [ $# -gt 0 ] && printf ' %s' "$@" >&2
    printf '\n' >&2
  fi
}

log_debug() { _hermes_log debug "$@"; }
log_info()  { _hermes_log info  "$@"; }
log_warn()  { _hermes_log warn  "$@"; }
log_error() { _hermes_log error "$@"; }
