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
source "$(dirname "$0")/lib-stage.sh"

SKILL="${SKILL_NAME#dp-cto:}"

case "$SKILL" in
  start)
    # Plan-path extraction kept for backward compatibility with pre-v3.0
    # markdown-based plans. In v3.0+ workflows (beads), the grep below finds
    # nothing and PLAN_PATH stays empty — which is the expected path.
    PLAN_PATH=""
    INDEX_FILE="$CWD/.claude/plans/_index.md"
    if [ -f "$INDEX_FILE" ]; then
      PLAN_PATH=$(grep -o '[^(]*02-implementation\.md' "$INDEX_FILE" | tail -1 || true)
      if [ -n "$PLAN_PATH" ]; then
        PLAN_PATH=".claude/plans/$PLAN_PATH"
      fi
      case "$PLAN_PATH" in
        .claude/plans/*) ;; # OK
        *) PLAN_PATH="" ;;  # reject unexpected paths
      esac
      case "$PLAN_PATH" in
        *..* ) PLAN_PATH="" ;; # reject path traversal
      esac
    fi
    write_stage "$SESSION_ID" "planned" "$PLAN_PATH"
    write_breadcrumb "$SESSION_ID" "planned" "$PLAN_PATH" "$CWD"
    ;;
  execute)
    EXISTING=$(read_breadcrumb)
    EXISTING_PLAN=$(echo "$EXISTING" | jq -r '.plan_path // empty' 2>/dev/null || true)
    write_stage "$SESSION_ID" "polishing" ""
    write_breadcrumb "$SESSION_ID" "polishing" "${EXISTING_PLAN}" "$CWD"
    ;;
  polish)
    write_stage "$SESSION_ID" "complete" ""
    clear_breadcrumb
    ;;
  # Quality / side-effect skills — no stage transition
  tdd | debug | verify-done | review | sweep)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac

exit 0
