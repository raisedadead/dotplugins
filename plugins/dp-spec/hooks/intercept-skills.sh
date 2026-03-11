#!/usr/bin/env bash
set -euo pipefail

# Fail open if jq is unavailable
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

read -r TOOL_NAME SKILL_NAME SESSION_ID CWD_INPUT < <(
  echo "$INPUT" | jq -r '[.tool_name // "", .tool_input.skill // "", .session_id // "", .cwd // ""] | @tsv'
)

# Only inspect Skill tool calls
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

# Only enforce dp-spec skills — everything else passes silently
case "$SKILL_NAME" in
  dp-spec:*) ;;
  *) exit 0 ;;
esac

# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

CWD="$CWD_INPUT"
if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
  exit 0
fi
export CWD

# No session ID — fail open (cannot track state)
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

SKILL="${SKILL_NAME#dp-spec:}"

# Check for standalone research mode (quality skill bypass)
SKILL_ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // ""' 2>/dev/null) || SKILL_ARGS=""
if [ "$SKILL" = "research" ] && [[ " $SKILL_ARGS " == *" --standalone "* ]]; then
  exit 0
fi

CURRENT_STAGE=$(read_stage "$SESSION_ID")

ALLOWED=false
REASON=""

case "$CURRENT_STAGE" in
  idle)
    case "$SKILL" in
      plan|discover) ALLOWED=true ;;
      brainstorm) REASON="Run /dp-spec:discover first." ;;
      research) REASON="Run /dp-spec:brainstorm first." ;;
      *) REASON="Run /dp-spec:discover first." ;;
    esac
    ;;
  discovering)
    REASON="Wait for /dp-spec:discover to complete."
    ;;
  discovered)
    case "$SKILL" in
      brainstorm) ALLOWED=true ;;
      *) REASON="Run /dp-spec:brainstorm next." ;;
    esac
    ;;
  brainstorming)
    REASON="Wait for /dp-spec:brainstorm to complete."
    ;;
  brainstormed)
    case "$SKILL" in
      research) ALLOWED=true ;;
      *) REASON="Run /dp-spec:research next." ;;
    esac
    ;;
  researching)
    REASON="Wait for /dp-spec:research to complete."
    ;;
  researched)
    case "$SKILL" in
      draft) ALLOWED=true ;;
      *) REASON="Run /dp-spec:draft next." ;;
    esac
    ;;
  drafting)
    REASON="Wait for /dp-spec:draft to complete."
    ;;
  drafted)
    case "$SKILL" in
      challenge) ALLOWED=true ;;
      *) REASON="Run /dp-spec:challenge next." ;;
    esac
    ;;
  challenging)
    REASON="Wait for /dp-spec:challenge to complete."
    ;;
  challenged)
    case "$SKILL" in
      handoff) ALLOWED=true ;;
      *) REASON="Run /dp-spec:handoff next." ;;
    esac
    ;;
  complete)
    case "$SKILL" in
      plan|discover) ALLOWED=true ;;
      *) REASON="Run /dp-spec:plan to begin a new spec." ;;
    esac
    ;;
  *)
    # Unknown stage — treat as idle
    case "$SKILL" in
      plan|discover) ALLOWED=true ;;
      *) REASON="Run /dp-spec:discover first." ;;
    esac
    ;;
esac

if [ "$ALLOWED" = "true" ]; then
  # Write pre-execution transient stage
  case "$SKILL" in
    discover) write_stage "$SESSION_ID" "discovering" ;;
    brainstorm) write_stage "$SESSION_ID" "brainstorming" ;;
    research) write_stage "$SESSION_ID" "researching" ;;
    draft) write_stage "$SESSION_ID" "drafting" ;;
    challenge) write_stage "$SESSION_ID" "challenging" ;;
    # handoff does not write a transient stage — it transitions directly in PostToolUse
  esac
  exit 0
fi

jq -n \
  --arg stage "$CURRENT_STAGE" \
  --arg reason "$REASON" \
  '{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: ("Stage is \u0027" + $stage + "\u0027. " + $reason)}}'
exit 0
