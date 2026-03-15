#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook: intercepts `bd init` without both `--stealth` and `--skip-hooks` flags.
# Denies bare `bd init` to prevent project .gitignore pollution and hook interference.
# Global gitignore handles .beads/ and .dolt/ exclusions.

if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0

if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Check if command contains `bd init` without both `--stealth` and `--skip-hooks`
if echo "$COMMAND" | grep -qE '\bbd\s+init\b'; then
  if echo "$COMMAND" | grep -qE '\-\-stealth' && echo "$COMMAND" | grep -qE '\-\-skip-hooks'; then
    exit 0
  fi
  jq -n '{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: "bd init requires both --stealth and --skip-hooks. Use: bd init --stealth --skip-hooks"}}'
  exit 0
fi

exit 0
