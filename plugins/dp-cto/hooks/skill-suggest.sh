#!/usr/bin/env bash
set -euo pipefail

# UserPromptSubmit hook: suggests relevant dp-cto skills based on pattern
# matching against skill-rules.json configuration.

# Fail open if jq is not available
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(head -c 1048576)

USER_MESSAGE=$(echo "$INPUT" | jq -r '.user_message // ""' 2>/dev/null) || exit 0

if [ -z "$USER_MESSAGE" ]; then
  exit 0
fi

# Exit silently if user is already invoking a dp-cto skill
if echo "$USER_MESSAGE" | grep -qF '/dp-cto:'; then
  exit 0
fi

RULES_FILE="$(dirname "$0")/skill-rules.json"

if [ ! -f "$RULES_FILE" ]; then
  exit 0
fi

RULES=$(jq -c '.' "$RULES_FILE" 2>/dev/null) || exit 0
RULE_COUNT=$(echo "$RULES" | jq 'length' 2>/dev/null) || exit 0

for (( i=0; i<RULE_COUNT; i++ )); do
  PATTERN=$(echo "$RULES" | jq -r ".[$i].pattern // \"\"" 2>/dev/null) || continue
  SKILL=$(echo "$RULES" | jq -r ".[$i].skill // \"\"" 2>/dev/null) || continue
  DESCRIPTION=$(echo "$RULES" | jq -r ".[$i].description // \"\"" 2>/dev/null) || continue

  if [ -z "$PATTERN" ] || [ -z "$SKILL" ]; then
    continue
  fi

  if echo "$USER_MESSAGE" | grep -iqE "$PATTERN" 2>/dev/null; then
    jq -n --arg ctx "dp-cto suggestion: ${DESCRIPTION}. Run /${SKILL} to use it." '{
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: $ctx
      }
    }'
    exit 0
  fi
done

exit 0
