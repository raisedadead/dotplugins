#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
  exit 0
fi
export CWD

source "$(dirname "$0")/lib-stage.sh"

STAGE_FILE="$(stage_file "$SESSION_ID")"
if [ -f "$STAGE_FILE" ]; then
  write_stage "$SESSION_ID" "ended" ""
fi
