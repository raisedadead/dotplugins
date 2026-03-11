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

# Stage enforcement for dp-cto skills
# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

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
    if [ "$SKILL" = "ralph-cancel" ]; then
      exit 0
    fi

    # Quality skills — side-effect-free, no stage transition, pass silently
    case "$SKILL" in
      tdd|debug|verify-done|review|sweep|reset)
        exit 0
        ;;
    esac

    CURRENT_STAGE=$(read_stage "$SESSION_ID")

    ALLOWED=false

    case "$CURRENT_STAGE" in
      idle)
        if [ "$SKILL" = "start" ]; then
          ALLOWED=true
        else
          REASON="Run /dp-cto:start first to create a plan."
        fi
        ;;
      planning)
        REASON="A plan is being created. Wait for /dp-cto:start to complete."
        ;;
      planned)
        case "$SKILL" in
          execute|start) ALLOWED=true ;;
          *) REASON="Run /dp-cto:execute first to begin implementation." ;;
        esac
        ;;
      executing)
        case "$SKILL" in
          ralph|verify|polish) ALLOWED=true ;;
          *) REASON="Implementation in progress. Complete execution first, or use /dp-cto:ralph-cancel to abort." ;;
        esac
        ;;
      polishing)
        case "$SKILL" in
          verify|polish) ALLOWED=true ;;
          *) REASON="Polish in progress. Wait for /dp-cto:polish to complete." ;;
        esac
        ;;
      complete)
        case "$SKILL" in
          start|polish) ALLOWED=true ;;
          *) REASON="Cycle is complete. Run /dp-cto:start to begin a new feature." ;;
        esac
        ;;
      *)
        # Unknown stage — treat as idle
        if [ "$SKILL" = "start" ]; then
          ALLOWED=true
        else
          REASON="Run /dp-cto:start first to create a plan."
        fi
        ;;
    esac

    if [ "$ALLOWED" = "true" ]; then
      # Write pre-execution stage for transitional skills
      case "$SKILL" in
        start) write_stage "$SESSION_ID" "planning" "" ;;
        execute) write_stage "$SESSION_ID" "executing" "" ;;
        polish) write_stage "$SESSION_ID" "polishing" "" ;;
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
      '{systemMessage: ("WARNING: Unknown skill " + $skill + " has an orchestration-adjacent name. If this is an orchestration skill, use /dp-cto:start or /dp-cto:execute instead. Allowing execution.")}'
    exit 0
    ;;
esac

# Tier 2: PASS silently — everything else
exit 0
