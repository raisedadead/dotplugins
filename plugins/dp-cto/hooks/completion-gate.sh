#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: detects completion claims in Agent output that lack test
# execution evidence. Injects an advisory warning (systemMessage) — does NOT
# block. Defense-in-depth for the dp-cto:verify-done skill.

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

RESPONSE_LOWER=$(echo "$RESPONSE" | tr '[:upper:]' '[:lower:]')

HAS_CLAIM=false
for pattern in \
  "all tests pass" \
  "tests pass" \
  "implementation complete" \
  "implementation is complete" \
  "task complete" \
  "task is complete" \
  "all done" \
  "completed successfully" \
  "changes are complete" \
  "work is done" \
  "work is complete"; do
  if echo "$RESPONSE_LOWER" | grep -qF "$pattern"; then
    HAS_CLAIM=true
    break
  fi
done

if [ "$HAS_CLAIM" = "false" ]; then
  exit 0
fi

HAS_EVIDENCE=false
for evidence in \
  "tests? \\(passed\\|failed\\)" \
  "[0-9]\\+ passed" \
  "[0-9]\\+ failed" \
  "exit code" \
  "test suites\\?" \
  "✓\\|✗\\|✘" \
  "pass |fail " \
  "ok [0-9]" \
  "not ok [0-9]" \
  "assert" \
  "expect(" \
  "vitest\\|jest\\|mocha\\|pytest\\|cargo test\\|go test\\|npm test\\|pnpm test"; do
  if echo "$RESPONSE_LOWER" | grep -qi "$evidence"; then
    HAS_EVIDENCE=true
    break
  fi
done

if [ "$HAS_EVIDENCE" = "true" ]; then
  exit 0
fi

WARNING="Agent claimed completion without test evidence. Verify with dp-cto:verify-done before accepting."

jq -n --arg msg "$WARNING" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
