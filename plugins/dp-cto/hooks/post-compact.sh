#!/usr/bin/env bash
set -euo pipefail
# PostCompact hook: re-injects dp-cto enforcement context after context compaction.
# When Claude Code compacts conversation context, stage machine rules and epic state
# injected by session-start.sh are lost. This hook restores them.

if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

read -r CWD < <(echo "$INPUT" | jq -r '.cwd // ""') || true
if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
  exit 0
fi
export CWD

# ─── Epic State Recovery (beads-backed) ──────────────────────────────────────
RECOVERY_CONTEXT=""

if command -v bd &>/dev/null && [ -d "${CWD}/.beads" ]; then
  recover_from_beads() {
    local results
    results=$(cd "$CWD" && bd query -q "label=dp-cto:planning OR label=dp-cto:executing OR label=dp-cto:polishing" --json 2>/dev/null) || return 1

    if [ -z "$results" ] || [ "$results" = "null" ] || [ "$results" = "[]" ]; then
      return 1
    fi

    local epic_id epic_stage
    read -r epic_id epic_stage < <(
      echo "$results" | jq -r '
        [.[] | {id: .id, stage: ([.labels // [] | .[] | select(startswith("dp-cto:")) | ltrimstr("dp-cto:")] | first // "")}]
        | first // empty
        | [.id, .stage] | @tsv
      ' 2>/dev/null
    ) || return 1

    if [ -z "$epic_id" ] || [ -z "$epic_stage" ]; then
      return 1
    fi

    epic_id=$(printf '%s' "$epic_id" | tr -cd 'a-zA-Z0-9._-')

    case "$epic_stage" in
      planning|planned|executing|polishing) ;;
      *) return 1 ;;
    esac

    RECOVERY_CONTEXT="RECOVERY: Active epic (${epic_id}) is at stage '${epic_stage}'. Resume with /dp-cto:work-run or /dp-cto:work-polish as appropriate."
    return 0
  }

  recover_from_beads || true
fi

# ─── Build output ────────────────────────────────────────────────────────────
ENFORCEMENT_TEXT="dp-cto: Stage enforcement active via PreToolUse hook. Workflow: /dp-cto:work-plan → /dp-cto:work-run → /dp-cto:work-polish. quality-*/ops-* skills: any stage. bd CLI required for orchestration skills."

if [ -n "$RECOVERY_CONTEXT" ]; then
  ADDITIONAL_CONTEXT="${RECOVERY_CONTEXT}
${ENFORCEMENT_TEXT}"
else
  ADDITIONAL_CONTEXT="$ENFORCEMENT_TEXT"
fi

jq -n --arg ctx "$ADDITIONAL_CONTEXT" \
  '{systemMessage: $ctx}'
