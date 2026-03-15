#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: deterministic receipt-gate for dp-cto implementer agents.
# Checks that dp-cto-implementer agents include a valid Completion Receipt.
# Non-implementer agents pass through without checks.

# Fail open if jq is not available
if ! command -v jq &>/dev/null; then exit 0; fi

INPUT=$(cat) || exit 0

SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // ""' 2>/dev/null) || exit 0

# Only check dp-cto-implementer agents
case "$SUBAGENT_TYPE" in
  dp-cto:dp-cto-implementer|dp-cto-implementer) ;;
  *) exit 0 ;;
esac

RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // ""' 2>/dev/null) || exit 0

if ! echo "$RESPONSE" | grep -q '## Completion Receipt'; then
  jq -n '{systemMessage: "Receipt warning: dp-cto-implementer agent returned without a ## Completion Receipt section. The agent should include Task, Status, Verification Command, Exit Code, and Acceptance Criteria Met fields."}'
  exit 0
fi

MISSING=()
for field in "Task" "Status" "Verification Command" "Exit Code" "Acceptance Criteria Met"; do
  if ! echo "$RESPONSE" | grep -q "\\*\\*${field}\\*\\*"; then
    MISSING+=("$field")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  MISSING_LIST=$(printf ", %s" "${MISSING[@]}")
  MISSING_LIST="${MISSING_LIST:2}"
  jq -n --arg fields "$MISSING_LIST" '{systemMessage: ("Receipt warning: Completion Receipt is missing required fields: " + $fields)}'
  exit 0
fi

exit 0
