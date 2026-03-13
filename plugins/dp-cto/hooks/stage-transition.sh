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
# shellcheck source=lib-state.sh
source "$(dirname "$0")/lib-state.sh"

SKILL="${SKILL_NAME#dp-cto:}"

case "$SKILL" in
  work-plan)
    # Read active epic — work-plan skill should have set it during execution
    ACTIVE_EPIC=$(read_cache | jq -r '.active_epic // ""' 2>/dev/null)
    if [ -n "$ACTIVE_EPIC" ]; then
      write_state "$ACTIVE_EPIC" "planned" 2>/dev/null || true
    else
      CACHE=$(read_cache)
      write_cache "$(echo "$CACHE" | jq -c '.stage = "planned"')" 2>/dev/null || true
    fi
    ;;
  work-run)
    ACTIVE_EPIC=$(read_cache | jq -r '.active_epic // ""' 2>/dev/null)
    if [ -n "$ACTIVE_EPIC" ]; then
      write_state "$ACTIVE_EPIC" "polishing" 2>/dev/null || true
    else
      CACHE=$(read_cache)
      write_cache "$(echo "$CACHE" | jq -c '.stage = "polishing"')" 2>/dev/null || true
    fi
    ;;
  work-polish)
    ACTIVE_EPIC=$(read_cache | jq -r '.active_epic // ""' 2>/dev/null)
    if [ -n "$ACTIVE_EPIC" ]; then
      write_state "$ACTIVE_EPIC" "complete" 2>/dev/null || true
    else
      CACHE=$(read_cache)
      write_cache "$(echo "$CACHE" | jq -c '.stage = "complete"')" 2>/dev/null || true
    fi
    ;;
  work-park)
    ACTIVE_EPIC=$(read_cache | jq -r '.active_epic // ""' 2>/dev/null)
    if [ -n "$ACTIVE_EPIC" ]; then
      suspend_state "$ACTIVE_EPIC" 2>/dev/null || true
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
