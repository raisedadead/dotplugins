#!/usr/bin/env bash
set -euo pipefail

# Fail open if jq is unavailable
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only inspect Skill tool calls
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# Strip superpowers: prefix if present
BARE_SKILL="${SKILL_NAME#superpowers:}"

case "$BARE_SKILL" in
  executing-plans|dispatching-parallel-agents|subagent-driven-development)
    cat << DENY
{
  "hookSpecificOutput": {
    "permissionDecision": "deny"
  },
  "systemMessage": "The skill '${SKILL_NAME}' is intercepted by the sp plugin. Use /sp:cto instead — it provides unified orchestration with Agent Teams (default) and optional worktree isolation."
}
DENY
    ;;
  *)
    exit 0
    ;;
esac
