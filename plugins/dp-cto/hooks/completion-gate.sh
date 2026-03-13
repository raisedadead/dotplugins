#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: detects completion claims in Agent output that lack test
# execution evidence. Injects an advisory warning (systemMessage) — does NOT
# block. Defense-in-depth for the dp-cto:quality-check-done skill.

# Fail open if jq is not available
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(head -c 1048576)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0

if [ "$TOOL_NAME" != "Agent" ]; then
  exit 0
fi

RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // empty' 2>/dev/null) || exit 0

if [ -z "$RESPONSE" ]; then
  exit 0
fi

# --- Receipt-based detection (primary path) ---
if echo "$RESPONSE" | grep -qi '## completion receipt'; then
  RECEIPT_SECTION=$(echo "$RESPONSE" | awk '
    tolower($0) ~ /^## completion receipt/ { found=1; next }
    found && /^## / { exit }
    found { print }
  ')

  MISSING_FIELDS=()

  TASK_FIELD=$(echo "$RECEIPT_SECTION" | grep -i '^\- \*\*Task\*\*:' || true)
  if [ -z "$TASK_FIELD" ]; then
    MISSING_FIELDS+=("Task")
  fi

  STATUS_FIELD=$(echo "$RECEIPT_SECTION" | grep -i '^\- \*\*Status\*\*:' || true)
  if [ -z "$STATUS_FIELD" ]; then
    MISSING_FIELDS+=("Status")
  fi

  VERIFY_CMD_FIELD=$(echo "$RECEIPT_SECTION" | grep -i '^\- \*\*Verification Command\*\*:' || true)
  if [ -z "$VERIFY_CMD_FIELD" ]; then
    MISSING_FIELDS+=("Verification Command")
  fi

  EXIT_CODE_FIELD=$(echo "$RECEIPT_SECTION" | grep -i '^\- \*\*Exit Code\*\*:' || true)
  if [ -z "$EXIT_CODE_FIELD" ]; then
    MISSING_FIELDS+=("Exit Code")
  fi

  ACCEPTANCE_FIELD=$(echo "$RECEIPT_SECTION" | grep -i '^\- \*\*Acceptance Criteria Met\*\*:' || true)
  if [ -z "$ACCEPTANCE_FIELD" ]; then
    MISSING_FIELDS+=("Acceptance Criteria Met")
  fi

  if [ ${#MISSING_FIELDS[@]} -gt 0 ]; then
    MISSING_LIST=$(printf ", %s" "${MISSING_FIELDS[@]}")
    MISSING_LIST="${MISSING_LIST:2}"
    WARNING="Completion Receipt found but missing required fields: ${MISSING_LIST}. Verify with dp-cto:quality-check-done."
    jq -n --arg msg "$WARNING" '{
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: $msg
      }
    }'
    exit 0
  fi

  ISSUES=()

  STATUS_VAL=$(echo "$STATUS_FIELD" | sed 's/.*\*\*Status\*\*:[[:space:]]*//' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  if [ "$STATUS_VAL" != "pass" ]; then
    ISSUES+=("Status=${STATUS_VAL}")
  fi

  EXIT_CODE_VAL=$(echo "$EXIT_CODE_FIELD" | sed 's/.*\*\*Exit Code\*\*:[[:space:]]*//' | tr -d '[:space:]')
  if [ "$EXIT_CODE_VAL" != "0" ]; then
    ISSUES+=("Exit Code=${EXIT_CODE_VAL}")
  fi

  ACCEPTANCE_VAL=$(echo "$ACCEPTANCE_FIELD" | sed 's/.*\*\*Acceptance Criteria Met\*\*:[[:space:]]*//' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  if [ "$ACCEPTANCE_VAL" != "yes" ]; then
    ISSUES+=("Acceptance Criteria Met=${ACCEPTANCE_VAL}")
  fi

  if [ ${#ISSUES[@]} -gt 0 ]; then
    ISSUE_LIST=$(printf ", %s" "${ISSUES[@]}")
    ISSUE_LIST="${ISSUE_LIST:2}"
    WARNING="Completion Receipt found but: ${ISSUE_LIST}. Verify with dp-cto:quality-check-done."
    jq -n --arg msg "$WARNING" '{
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: $msg
      }
    }'
    exit 0
  fi

  exit 0
fi

# --- Claim detection (fixed strings, fallback for agents without receipts) ---
if ! echo "$RESPONSE" | grep -qiF \
  -e "all tests pass" \
  -e "tests pass" \
  -e "implementation complete" \
  -e "implementation is complete" \
  -e "task complete" \
  -e "task is complete" \
  -e "all done" \
  -e "completed successfully" \
  -e "changes are complete" \
  -e "work is done" \
  -e "work is complete"; then
  exit 0
fi

if echo "$RESPONSE" | grep -qEi \
  'tests? (passed|failed)|[0-9]+ passed|[0-9]+ failed|exit code|test suites?|[✓✗✘]|pass |fail |ok [0-9]|not ok [0-9]|assert|expect\(|vitest|jest|mocha|pytest|cargo test|go test|npm test|pnpm test'; then
  exit 0
fi

WARNING="Agent claimed completion without test evidence. Verify with dp-cto:quality-check-done before accepting."

jq -n --arg msg "$WARNING" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
