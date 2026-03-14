#!/usr/bin/env bash
set -euo pipefail
# TeammateIdle hook: reminds dp-cto collaborative teammates to include
# completion receipts before going idle. Non-blocking for non-dp-cto teams.

if ! command -v jq &>/dev/null; then exit 0; fi

INPUT=$(cat)
TEAM_NAME=$(echo "$INPUT" | jq -r '.team_name // ""' 2>/dev/null) || exit 0

# Only apply to dp-cto collaborative teams (named *-collab by work-run Step 4)
if [[ "$TEAM_NAME" != *-collab ]]; then exit 0; fi

TEAMMATE_NAME=$(echo "$INPUT" | jq -r '.teammate_name // "unknown"' 2>/dev/null) || exit 0

echo "dp-cto: Teammate '${TEAMMATE_NAME}' attempting to idle. Ensure your work includes a ## Completion Receipt with all required fields (Task, Status, Verification Command, Exit Code, Acceptance Criteria Met) before stopping." >&2
exit 2
