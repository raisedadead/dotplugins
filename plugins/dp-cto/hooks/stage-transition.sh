#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: advance the dp-cto stage machine after Skill completions.
# Fail open — never block the user.

if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

case "$SKILL_NAME" in
  dp-cto:*) ;;
  *) exit 0 ;;
esac

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD_INPUT=$(echo "$INPUT" | jq -r '.cwd // empty')

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

export CWD="${CWD_INPUT:-$(pwd)}"
source "$(dirname "$0")/lib-stage.sh"

SKILL="${SKILL_NAME#dp-cto:}"

case "$SKILL" in
  start)
    PLAN_PATH=""
    INDEX_FILE="$CWD/.claude/plans/_index.md"
    if [ -f "$INDEX_FILE" ]; then
      PLAN_PATH=$(grep -o '[^(]*02-implementation\.md' "$INDEX_FILE" | tail -1 || true)
      if [ -n "$PLAN_PATH" ]; then
        PLAN_PATH=".claude/plans/$PLAN_PATH"
      fi
    fi
    write_stage "$SESSION_ID" "planned" "$PLAN_PATH"
    ;;
  execute)
    write_stage "$SESSION_ID" "polishing" ""
    ;;
  polish)
    write_stage "$SESSION_ID" "complete" ""
    ;;
  *)
    exit 0
    ;;
esac

exit 0
