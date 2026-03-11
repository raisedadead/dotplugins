#!/usr/bin/env bash
# Legacy library for dp-cto per-session stage file management. Retained for backward compat and recovery fallback. Primary state management is in lib-state.sh (beads-backed cache.json).
# Source this file — no side effects, functions only.

# Callers must export CWD before sourcing this file. Falls back to pwd if unset.
stage_dir() {
  local base="${CWD:-$(pwd)}"
  echo "${base}/.claude/dp-cto"
}

validate_session_id() {
  local id="$1"
  if [[ ! "$id" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "invalid session_id" >&2
    return 1
  fi
}

stage_file() {
  local session_id="$1"
  validate_session_id "$session_id" || return 1
  echo "$(stage_dir)/${session_id}.stage.json"
}

write_stage() {
  local session_id="$1"
  local stage="$2"
  local plan_path="${3:-}"
  local file
  file="$(stage_file "$session_id")"
  local dir
  dir="$(stage_dir)"

  mkdir -p "$dir"
  chmod 700 "$dir"

  local started_at=""
  local history=""
  local plan_path_existing=""

  if [ -f "$file" ]; then
    read -r started_at history plan_path_existing < <(
      jq -r '[.started_at // "", (.history // [] | tojson), .plan_path // ""] | @tsv' "$file" 2>/dev/null
    ) || true
    if [ -z "$plan_path" ]; then
      plan_path="$plan_path_existing"
    fi
  fi

  if [ -z "${started_at:-}" ]; then
    started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  fi

  if [ -z "${history:-}" ] || [ "$history" = "null" ]; then
    history="[]"
  fi

  history=$(echo "$history" | jq -c --arg s "$stage" '. + [$s]')

  local tmpfile
  tmpfile=$(mktemp "${file}.tmp.XXXXXX")
  chmod 600 "$tmpfile"

  if ! jq -n \
    --arg stage "$stage" \
    --arg plan_path "$plan_path" \
    --arg started_at "$started_at" \
    --argjson history "$history" \
    '{stage: $stage, plan_path: $plan_path, started_at: $started_at, history: $history}' \
    > "$tmpfile" 2>/dev/null; then
    rm -f "$tmpfile"
    return 1
  fi

  mv -f "$tmpfile" "$file"
}

breadcrumb_file() {
  echo "$(stage_dir)/active.json"
}

read_breadcrumb() {
  local file
  file="$(breadcrumb_file)"

  if [ ! -f "$file" ]; then
    echo ""
    return 0
  fi

  local content
  content=$(jq -c '.' "$file" 2>/dev/null) || true
  if [ -z "$content" ]; then
    echo ""
    return 0
  fi
  echo "$content"
}
