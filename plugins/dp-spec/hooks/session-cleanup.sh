#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

read -r SESSION_ID CWD < <(echo "$INPUT" | jq -r '[.session_id // "", .cwd // ""] | @tsv')
if [ -z "$SESSION_ID" ]; then
  exit 0
fi
if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
  exit 0
fi
export CWD

# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

STAGE_FILE="$(stage_file "$SESSION_ID" 2>/dev/null)" || exit 0
if [ -f "$STAGE_FILE" ]; then
  write_stage "$SESSION_ID" "ended"
fi
