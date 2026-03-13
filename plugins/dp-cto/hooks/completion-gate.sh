#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: detects completion claims in Agent output that lack test
# execution evidence. Injects an advisory warning (systemMessage) — does NOT
# block. Defense-in-depth for the dp-cto:quality-check-done skill.

# Fail open if jq is not available
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0

if [ "$TOOL_NAME" != "Agent" ]; then
  exit 0
fi

RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // empty' 2>/dev/null) || exit 0

if [ -z "$RESPONSE" ]; then
  exit 0
fi

RESPONSE_LOWER="${RESPONSE,,}"

HAS_CLAIM=false
if echo "$RESPONSE_LOWER" | grep -qF \
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
  HAS_CLAIM=true
fi

if [ "$HAS_CLAIM" = "false" ]; then
  exit 0
fi

HAS_EVIDENCE=false
if echo "$RESPONSE_LOWER" | grep -qEi \
  'tests? (passed|failed)|[0-9]+ passed|[0-9]+ failed|exit code|test suites?|[✓✗✘]|pass |fail |ok [0-9]|not ok [0-9]|assert|expect\(|vitest|jest|mocha|pytest|cargo test|go test|npm test|pnpm test'; then
  HAS_EVIDENCE=true
fi

if [ "$HAS_EVIDENCE" = "true" ]; then
  exit 0
fi

WARNING="Agent claimed completion without test evidence. Verify with dp-cto:quality-check-done before accepting."

jq -n --arg msg "$WARNING" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
