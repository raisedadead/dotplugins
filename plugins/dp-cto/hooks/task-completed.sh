#!/usr/bin/env bash
set -euo pipefail
# TaskCompleted hook: reminds dp-cto collaborative teams to verify
# task completion evidence. Non-blocking for non-dp-cto teams.

if ! command -v jq &>/dev/null; then exit 0; fi

INPUT=$(cat)
TEAM_NAME=$(echo "$INPUT" | jq -r '.team_name // ""' 2>/dev/null) || exit 0

if [[ "$TEAM_NAME" != *-collab ]]; then exit 0; fi

TASK_SUBJECT=$(echo "$INPUT" | jq -r '.task_subject // "unknown"' 2>/dev/null) || exit 0
TEAMMATE_NAME=$(echo "$INPUT" | jq -r '.teammate_name // "unknown"' 2>/dev/null) || exit 0

echo "dp-cto: Task '${TASK_SUBJECT}' marked complete by '${TEAMMATE_NAME}'. Verify completion with dp-cto:quality-check-done — ensure test evidence exists, not just a claim." >&2
exit 2
