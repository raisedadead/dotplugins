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

# Tier 1: DENY — orchestration skills replaced by sp:cto-start / sp:cto-execute
case "$BARE_SKILL" in
  executing-plans|dispatching-parallel-agents|subagent-driven-development|using-git-worktrees|finishing-a-development-branch|ralph-loop|brainstorming|writing-plans)
    cat << DENY
{
  "hookSpecificOutput": {
    "permissionDecision": "deny"
  },
  "systemMessage": "The skill '${SKILL_NAME}' is intercepted by the sp plugin. Use /sp:cto-start for brainstorming and planning, or /sp:cto-execute for implementation."
}
DENY
    exit 0
    ;;
esac

# Tier 2: PASS explicitly — known safe superpowers quality skills
case "$BARE_SKILL" in
  test-driven-development|requesting-code-review|receiving-code-review|systematic-debugging|verification-before-completion|writing-skills|using-superpowers)
    exit 0
    ;;
esac

# Tier 3: WARN — unknown skills with orchestration-adjacent names
case "$BARE_SKILL" in
  *parallel*|*dispatch*|*orchestrat*|*worktree*|*subagent*|*agent*)
    cat << WARN
{
  "systemMessage": "WARNING: Unknown skill '${SKILL_NAME}' has an orchestration-adjacent name. If this is an orchestration skill, use /sp:cto-start or /sp:cto-execute instead. Allowing execution."
}
WARN
    exit 0
    ;;
esac

# Tier 4: PASS silently — everything else
exit 0
