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
# shellcheck source=lib-state.sh
source "$(dirname "$0")/lib-state.sh"

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

    CURRENT_STAGE=$(read_cache | jq -r '.stage // "idle"' 2>/dev/null)
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
      # Write pre-execution transient stage
      ACTIVE_EPIC=$(read_cache | jq -r '.active_epic // ""' 2>/dev/null)
      case "$SKILL" in
        work-plan)
          CACHE=$(read_cache)
          write_cache "$(echo "$CACHE" | jq -c '.stage = "planning"')"
          ;;
        work-run)
          if [ -n "$ACTIVE_EPIC" ]; then
            write_state "$ACTIVE_EPIC" "executing" 2>/dev/null || true
          else
            CACHE=$(read_cache)
            write_cache "$(echo "$CACHE" | jq -c '.stage = "executing"')"
          fi
          ;;
        work-polish)
          if [ -n "$ACTIVE_EPIC" ]; then
            write_state "$ACTIVE_EPIC" "polishing" 2>/dev/null || true
          else
            CACHE=$(read_cache)
            write_cache "$(echo "$CACHE" | jq -c '.stage = "polishing"')"
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
