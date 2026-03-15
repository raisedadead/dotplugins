#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: advance the dp-cto stage machine after Skill completions.
# Fail open — never block the user.

if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

read -r TOOL_NAME SKILL_NAME SESSION_ID CWD_INPUT < <(
  echo "$INPUT" | jq -r '[.tool_name // "", .tool_input.skill // "", .session_id // "", .cwd // ""] | @tsv'
)

if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

case "$SKILL_NAME" in
  dp-cto:*) ;;
  *) exit 0 ;;
esac

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

export CWD="${CWD_INPUT:-$(pwd)}"

# Get active dp-cto epic directly from beads
get_dp_cto_epic() {
  if ! command -v bd &>/dev/null; then
    return 1
  fi
  local result
  result=$(bd query -q "label=dp-cto:planning OR label=dp-cto:planned OR label=dp-cto:executing OR label=dp-cto:polishing OR label=dp-cto:suspended" --json 2>/dev/null) || return 1
  if [ -z "$result" ] || [ "$result" = "[]" ]; then
    return 1
  fi
  echo "$result" | jq -r '.[0].id // empty' 2>/dev/null || return 1
}

SKILL="${SKILL_NAME#dp-cto:}"
ACTIVE_EPIC=$(get_dp_cto_epic) || ACTIVE_EPIC=""

case "$SKILL" in
  work-plan)
    if [ -n "$ACTIVE_EPIC" ]; then
      bd set-state -q "$ACTIVE_EPIC" "dp-cto=planned" 2>/dev/null || true
    fi
    ;;
  work-run)
    if [ -n "$ACTIVE_EPIC" ]; then
      bd set-state -q "$ACTIVE_EPIC" "dp-cto=polishing" 2>/dev/null || true
    fi
    ;;
  work-polish)
    if [ -n "$ACTIVE_EPIC" ]; then
      bd set-state -q "$ACTIVE_EPIC" "dp-cto=complete" 2>/dev/null || true
    fi
    ;;
  work-park)
    if [ -n "$ACTIVE_EPIC" ]; then
      bd set-state -q "$ACTIVE_EPIC" "dp-cto=suspended" 2>/dev/null || true
    fi
    ;;
  work-unpark)
    # restore state is called by the skill itself (needs epic selection logic).
    # No automatic transition here — the skill handles state restoration.
    exit 0
    ;;
  # Quality / ops skills — no stage transition
  quality-*|ops-*)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac

exit 0
