#!/usr/bin/env bash
set -euo pipefail

# Fail open if jq is unavailable
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

read -r TOOL_NAME SKILL_NAME SESSION_ID CWD_INPUT < <(
  echo "$INPUT" | jq -r '[.tool_name // "", .tool_input.skill // "", .session_id // "", .cwd // ""] | @tsv'
)

# Only inspect Skill tool calls
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

# Get active dp-cto epic stage directly from beads
# Returns "stage\tepic_id" as TSV, or "idle" if nothing found
get_dp_cto_state() {
  if ! command -v bd &>/dev/null; then
    echo "idle"
    return 0
  fi
  local result
  result=$(bd query "label=dp-cto:planning OR label=dp-cto:planned OR label=dp-cto:executing OR label=dp-cto:polishing OR label=dp-cto:suspended" --json 2>/dev/null) || { echo "idle"; return 0; }
  if [ -z "$result" ] || [ "$result" = "[]" ]; then
    echo "idle"
    return 0
  fi
  echo "$result" | jq -r '.[0] | [(.labels // [] | .[] | select(startswith("dp-cto:")) | ltrimstr("dp-cto:")), .id] | @tsv' 2>/dev/null || echo "idle"
}

case "$SKILL_NAME" in
  dp-cto:*)
    CWD="$CWD_INPUT"
    if [ -z "$CWD" ] || [ ! -d "$CWD" ]; then
      exit 0
    fi
    export CWD

    # No session ID — fail open (cannot track state)
    if [ -z "$SESSION_ID" ]; then
      exit 0
    fi

    SKILL="${SKILL_NAME#dp-cto:}"

    # Safety valve — always allowed
    if [ "$SKILL" = "work-stop-loop" ]; then
      exit 0
    fi

    # Quality / ops skills — side-effect-free, no stage transition, pass silently
    case "$SKILL" in
      quality-*|ops-*)
        exit 0
        ;;
    esac

    STATE_LINE=$(get_dp_cto_state)
    if [ "$STATE_LINE" = "idle" ]; then
      CURRENT_STAGE="idle"
      ACTIVE_EPIC=""
    else
      CURRENT_STAGE=$(echo "$STATE_LINE" | cut -f1)
      ACTIVE_EPIC=$(echo "$STATE_LINE" | cut -f2)
    fi
    CURRENT_STAGE="${CURRENT_STAGE:-idle}"

    ALLOWED=false

    case "$CURRENT_STAGE" in
      idle)
        case "$SKILL" in
          work-plan|work-unpark) ALLOWED=true ;;
          *) REASON="Run /dp-cto:work-plan first to create a plan." ;;
        esac
        ;;
      planning)
        REASON="A plan is being created. Wait for /dp-cto:work-plan to complete."
        ;;
      planned)
        case "$SKILL" in
          work-run|work-plan) ALLOWED=true ;;
          *) REASON="Run /dp-cto:work-run first to begin implementation." ;;
        esac
        ;;
      executing)
        case "$SKILL" in
          work-run-loop|quality-fact-check|work-polish|work-park) ALLOWED=true ;;
          *) REASON="Implementation in progress. Complete execution first, or use /dp-cto:work-stop-loop to abort." ;;
        esac
        ;;
      polishing)
        case "$SKILL" in
          quality-fact-check|work-polish|work-park) ALLOWED=true ;;
          *) REASON="Polish in progress. Wait for /dp-cto:work-polish to complete." ;;
        esac
        ;;
      complete)
        case "$SKILL" in
          work-plan|work-polish) ALLOWED=true ;;
          *) REASON="Cycle is complete. Run /dp-cto:work-plan to begin a new feature." ;;
        esac
        ;;
      *)
        # Unknown stage — treat as idle
        case "$SKILL" in
          work-plan|work-unpark) ALLOWED=true ;;
          *) REASON="Run /dp-cto:work-plan first to create a plan." ;;
        esac
        ;;
    esac

    if [ "$ALLOWED" = "true" ]; then
      case "$SKILL" in
        work-plan)
          if [ -n "$ACTIVE_EPIC" ]; then
            bd set-state "$ACTIVE_EPIC" "dp-cto=planning" 2>/dev/null || true
          fi
          ;;
        work-run)
          if [ -n "$ACTIVE_EPIC" ]; then
            bd set-state "$ACTIVE_EPIC" "dp-cto=executing" 2>/dev/null || true
          fi
          ;;
        work-polish)
          if [ -n "$ACTIVE_EPIC" ]; then
            bd set-state "$ACTIVE_EPIC" "dp-cto=polishing" 2>/dev/null || true
          fi
          ;;
      esac
      exit 0
    fi

    jq -n \
      --arg stage "$CURRENT_STAGE" \
      --arg reason "$REASON" \
      '{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: ("Stage is \u0027" + $stage + "\u0027. " + $reason)}}'
    exit 0
    ;;
esac

# Tier 1: WARN — unknown skills with orchestration-adjacent names
case "$SKILL_NAME" in
  *parallel*|*dispatch*|*orchestrat*|*worktree*|*subagent*)
    jq -n --arg skill "$SKILL_NAME" \
      '{systemMessage: ("WARNING: Unknown skill " + $skill + " has an orchestration-adjacent name. If this is an orchestration skill, use /dp-cto:work-plan or /dp-cto:work-run instead. Allowing execution.")}'
    exit 0
    ;;
esac

# Tier 2: PASS silently — everything else
exit 0
