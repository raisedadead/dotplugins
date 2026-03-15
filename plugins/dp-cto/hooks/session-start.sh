#!/usr/bin/env bash
set -euo pipefail
# SessionStart hook: injects dp-cto enforcement context,
# detects recoverable prior sessions via beads, and detects orphaned tasks.

if ! command -v jq &>/dev/null; then
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "dp-cto plugin loaded (jq not available — stage tracking disabled)."
  }
}
EOF
  exit 0
fi

INPUT=$(cat)

read -r SESSION_ID CWD < <(echo "$INPUT" | jq -r '[.session_id // "", .cwd // ""] | @tsv') || true
if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
  exit 0
fi
export CWD

# ─── Dependency Gate ─────────────────────────────────────────────────────────
DEGRADED=false
DEGRADED_MSG=""

if ! command -v bd &>/dev/null; then
  DEGRADED=true
  DEGRADED_MSG="dp-cto: bd CLI not found. Install: brew install beads. \
Orchestration skills (work-plan, work-run, work-polish, ops-track-sprint, work-park, work-unpark) disabled. \
Quality skills (quality-red-green-refactor, quality-deep-debug, quality-check-done, quality-code-review, quality-sweep-code, ops-show-board, ops-clean-slate) available."
elif [ ! -d "${CWD}/.beads" ]; then
  DEGRADED=true
  DEGRADED_MSG="dp-cto: No beads database found. Initialize: bd init --stealth"
fi

# ─── State initialization ───────────────────────────────────────────────────
RECOVERY_CONTEXT=""

if [ "$DEGRADED" = "false" ]; then
  # ─── Session Recovery Detection (beads-backed) ─────────────────────────────
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

  if [ -n "$SESSION_ID" ]; then
    recover_from_beads || true
  fi

  # ─── Orphan in-progress task detection ───────────────────────────────────
  detect_orphaned_tasks() {
    local epic_json
    epic_json=$(cd "$CWD" && bd query -q "label=dp-cto:executing OR label=dp-cto:polishing" --json 2>/dev/null) || return 1
    if [ -z "$epic_json" ] || [ "$epic_json" = "[]" ]; then return 1; fi
    local epic_id
    epic_id=$(echo "$epic_json" | jq -r '.[0].id // empty' 2>/dev/null) || return 1

    if [ -z "$epic_id" ]; then
      return 1
    fi

    local tasks
    tasks=$(cd "$CWD" && bd list -q --parent "$epic_id" --status in-progress --json 2>/dev/null) || return 1

    if [ -z "$tasks" ] || [ "$tasks" = "null" ] || [ "$tasks" = "[]" ]; then
      return 1
    fi

    local count
    count=$(echo "$tasks" | jq 'length' 2>/dev/null) || return 1

    if [ "$count" -eq 0 ]; then
      return 1
    fi

    local task_lines
    task_lines=$(echo "$tasks" | jq -r '
      .[0:5] | .[] | "\(.id): \(.title)"
    ' 2>/dev/null) || return 1

    local overflow=""
    if [ "$count" -gt 5 ]; then
      overflow=" and $(( count - 5 )) more"
    fi

    local orphan_msg="RECOVERY: Epic ${epic_id} has ${count} orphaned in-progress tasks: ${task_lines}${overflow} — Run /dp-cto:ops-show-board to review, then /dp-cto:work-run to re-dispatch or bd close {id} to skip."

    if [ -n "$RECOVERY_CONTEXT" ]; then
      RECOVERY_CONTEXT="${RECOVERY_CONTEXT}
${orphan_msg}"
    else
      RECOVERY_CONTEXT="$orphan_msg"
    fi
  }

  detect_orphaned_tasks || true
fi

# ─── Build output ────────────────────────────────────────────────────────────
ENFORCEMENT_TEXT="dp-cto: Stage enforcement active via PreToolUse hook. Workflow: /dp-cto:work-plan → /dp-cto:work-run → /dp-cto:work-polish. quality-*/ops-* skills: any stage. bd CLI required for orchestration skills."

if [ -n "$RECOVERY_CONTEXT" ]; then
  ADDITIONAL_CONTEXT="${RECOVERY_CONTEXT}
${ENFORCEMENT_TEXT}"
else
  ADDITIONAL_CONTEXT="$ENFORCEMENT_TEXT"
fi

if [ -n "$DEGRADED_MSG" ]; then
  ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT}
${DEGRADED_MSG}"
fi

jq -n --arg ctx "$ADDITIONAL_CONTEXT" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
