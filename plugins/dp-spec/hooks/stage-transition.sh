#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: advance the dp-spec stage machine after Skill completions.
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
  dp-spec:*) ;;
  *) exit 0 ;;
esac

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

CWD="$CWD_INPUT"
if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
  exit 0
fi
export CWD

# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

# Validate session ID format — fail open for malicious IDs
validate_session_id "$SESSION_ID" || exit 0

SKILL="${SKILL_NAME#dp-spec:}"

# Check for standalone research mode — no stage transition
SKILL_ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // ""' 2>/dev/null) || SKILL_ARGS=""
if [ "$SKILL" = "research" ] && [[ " $SKILL_ARGS " == *" --standalone "* ]]; then
  exit 0
fi

case "$SKILL" in
  plan)
    exit 0
    ;;
  discover)
    write_stage "$SESSION_ID" "discovered"
    write_breadcrumb "$SESSION_ID" "discovered" "$CWD"
    ;;
  brainstorm)
    write_stage "$SESSION_ID" "brainstormed"
    write_breadcrumb "$SESSION_ID" "brainstormed" "$CWD"
    ;;
  research)
    write_stage "$SESSION_ID" "researched"
    write_breadcrumb "$SESSION_ID" "researched" "$CWD"
    ;;
  draft)
    write_stage "$SESSION_ID" "drafted"
    write_breadcrumb "$SESSION_ID" "drafted" "$CWD"
    ;;
  challenge)
    write_stage "$SESSION_ID" "challenged"
    write_breadcrumb "$SESSION_ID" "challenged" "$CWD"
    ;;
  handoff)
    write_stage "$SESSION_ID" "complete"
    clear_breadcrumb
    ;;
  *)
    exit 0
    ;;
esac

exit 0
