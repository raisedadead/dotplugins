#!/usr/bin/env bash
# Shared library for dp-cto state management on beads epics with local cache.
# Source this file — no side effects, functions only.
# Callers must export CWD before sourcing this file. Falls back to pwd if unset.

cache_file() {
  local base="${CWD:-$(pwd)}"
  echo "${base}/.claude/dp-cto/cache.json"
}

read_cache() {
  local file
  file="$(cache_file)"

  if [ ! -f "$file" ]; then
    echo '{"active_epic":"","stage":"idle","sprint":"","suspended":[],"synced_at":""}'
    return 0
  fi

  local content
  content=$(jq -c '.' "$file" 2>/dev/null) || true
  if [ -z "$content" ]; then
    echo '{"active_epic":"","stage":"idle","sprint":"","suspended":[],"synced_at":""}'
    return 0
  fi
  echo "$content"
}

write_cache() {
  local json_content="$1"
  local file
  file="$(cache_file)"
  local dir
  dir="$(dirname "$file")"

  mkdir -p "$dir"
  chmod 700 "$dir"

  local tmpfile
  tmpfile=$(mktemp "${file}.tmp.XXXXXX")
  chmod 600 "$tmpfile"

  if ! echo "$json_content" | jq -c '.' > "$tmpfile" 2>/dev/null; then
    rm -f "$tmpfile"
    return 1
  fi

  chmod 600 "$tmpfile"
  mv -f "$tmpfile" "$file"
}

sync_from_beads() {
  if ! command -v bd &>/dev/null; then
    return 0
  fi

  local results
  results=$(bd query "label=dp-cto:*" --json 2>/dev/null) || return 0

  if [ -z "$results" ] || [ "$results" = "null" ] || [ "$results" = "[]" ]; then
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    write_cache "$(jq -n --arg now "$now" '{"active_epic":"","stage":"idle","sprint":"","suspended":[],"synced_at":$now}')"
    return 0
  fi

  local active_epic=""
  local active_stage="idle"
  local suspended

  suspended=$(echo "$results" | jq -c '
    [.[] | select(.labels // [] | any(. == "dp-cto:suspended")) | .id] // []
  ' 2>/dev/null) || suspended="[]"

  local active
  active=$(echo "$results" | jq -c '
    [.[] | select(
      (.labels // [] | any(startswith("dp-cto:")))
      and (.labels // [] | any(. == "dp-cto:complete" or . == "dp-cto:suspended") | not)
    )] | first // empty
  ' 2>/dev/null) || true

  if [ -n "$active" ] && [ "$active" != "null" ]; then
    active_epic=$(echo "$active" | jq -r '.id // ""' 2>/dev/null) || active_epic=""
    active_stage=$(echo "$active" | jq -r '
      [.labels // [] | .[] | select(startswith("dp-cto:")) | ltrimstr("dp-cto:")] | first // "idle"
    ' 2>/dev/null) || active_stage="idle"
  fi

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local cache_json
  cache_json=$(jq -n \
    --arg active_epic "$active_epic" \
    --arg stage "$active_stage" \
    --arg sprint "" \
    --argjson suspended "$suspended" \
    --arg synced_at "$now" \
    '{active_epic: $active_epic, stage: $stage, sprint: $sprint, suspended: $suspended, synced_at: $synced_at}'
  ) || return 1

  write_cache "$cache_json"
}

validate_stage() {
  case "$1" in
    idle|planning|planned|executing|polishing|complete|suspended) return 0 ;;
    *) return 1 ;;
  esac
}

write_state() {
  local epic_id="$1"
  local stage="$2"

  if ! validate_stage "$stage"; then
    return 1
  fi

  if ! command -v bd &>/dev/null; then
    return 1
  fi

  if ! bd set-state "$epic_id" "dp-cto=${stage}" 2>/dev/null; then
    return 1
  fi

  local cache
  cache=$(read_cache)

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local updated
  updated=$(echo "$cache" | jq -c \
    --arg epic "$epic_id" \
    --arg stage "$stage" \
    --arg now "$now" \
    '.active_epic = $epic | .stage = $stage | .synced_at = $now'
  ) || return 1

  write_cache "$updated"
}

suspend_state() {
  local epic_id="$1"

  if ! command -v bd &>/dev/null; then
    return 1
  fi

  if ! bd set-state "$epic_id" "dp-cto=suspended" 2>/dev/null; then
    return 1
  fi

  local cache
  cache=$(read_cache)

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local updated
  updated=$(echo "$cache" | jq -c \
    --arg epic "$epic_id" \
    --arg now "$now" \
    '.suspended = (.suspended + [$epic] | unique) |
     (if .active_epic == $epic then .active_epic = "" | .stage = "idle" else . end) |
     .synced_at = $now'
  ) || return 1

  write_cache "$updated"
}

resume_state() {
  local epic_id="$1"
  local prior_stage="${2:-}"

  if ! command -v bd &>/dev/null; then
    return 1
  fi

  # If caller didn't provide prior_stage, try to recover from beads labels
  if [ -z "$prior_stage" ]; then
    local issue_json
    issue_json=$(bd show "$epic_id" --json 2>/dev/null) || return 1

    if [ -n "$issue_json" ] && [ "$issue_json" != "null" ]; then
      prior_stage=$(echo "$issue_json" | jq -r '
        [.labels // [] | .[] | select(startswith("dp-cto:")) | ltrimstr("dp-cto:")]
        | map(select(. != "suspended"))
        | first // "planned"
      ' 2>/dev/null) || prior_stage="planned"
    fi
  fi

  if [ -z "$prior_stage" ] || [ "$prior_stage" = "null" ] || [ "$prior_stage" = "suspended" ]; then
    prior_stage="planned"
  fi

  if ! bd set-state "$epic_id" "dp-cto=${prior_stage}" 2>/dev/null; then
    return 1
  fi

  local cache
  cache=$(read_cache)

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local updated
  updated=$(echo "$cache" | jq -c \
    --arg epic "$epic_id" \
    --arg stage "$prior_stage" \
    --arg now "$now" \
    '.active_epic = $epic |
     .stage = $stage |
     .suspended = [.suspended[] | select(. != $epic)] |
     .synced_at = $now'
  ) || return 1

  write_cache "$updated"
}
