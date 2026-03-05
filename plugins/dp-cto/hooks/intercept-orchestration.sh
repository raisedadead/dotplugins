#!/usr/bin/env bash
set -euo pipefail

# Fail open if jq is unavailable
if ! command -v jq &>/dev/null; then
  exit 0
fi

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only inspect Skill tool calls
if [ "$TOOL_NAME" != "Skill" ]; then
  exit 0
fi

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# Stage enforcement for dp-cto skills
# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

case "$SKILL_NAME" in
  dp-cto:*)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
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

    CURRENT_STAGE=$(read_stage "$SESSION_ID")

    ALLOWED=false
    REASON=""

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
          ralph|verify) REASON="Run /dp-cto:execute first to begin implementation." ;;
          *) REASON="Run /dp-cto:execute first to begin implementation." ;;
        esac
        ;;
      executing)
        case "$SKILL" in
          ralph|verify|polish) ALLOWED=true ;;
          start|execute) REASON="Implementation in progress. Complete execution first, or use /dp-cto:ralph-cancel to abort." ;;
          *) REASON="Implementation in progress. Complete execution first, or use /dp-cto:ralph-cancel to abort." ;;
        esac
        ;;
      polishing)
        case "$SKILL" in
          verify) ALLOWED=true ;;
          *) REASON="Polish in progress. Wait for /dp-cto:polish to complete." ;;
        esac
        ;;
      complete)
        case "$SKILL" in
          start|polish) ALLOWED=true ;;
          execute|ralph|verify) REASON="Cycle is complete. Run /dp-cto:start to begin a new feature." ;;
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

# Strip superpowers: prefix if present
BARE_SKILL="${SKILL_NAME#superpowers:}"

# Tier 1: DENY — orchestration skills replaced by dp-cto:start / dp-cto:execute
# NOTE: This skill list must stay in sync with the enforcement message in session-start.sh
case "$BARE_SKILL" in
  executing-plans|dispatching-parallel-agents|subagent-driven-development|using-git-worktrees|finishing-a-development-branch|ralph-loop|brainstorming|writing-plans)
    jq -n --arg skill "$SKILL_NAME" \
      '{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: ("The skill " + $skill + " is intercepted by the dp-cto plugin. Use /dp-cto:start for brainstorming and planning, or /dp-cto:execute for implementation.")}}'
    exit 0
    ;;
esac

# Tier 2: PASS explicitly — known safe superpowers quality skills
case "$BARE_SKILL" in
  test-driven-development|requesting-code-review|receiving-code-review|systematic-debugging|verification-before-completion|writing-skills|using-superpowers)
    exit 0
    ;;
esac

# Tier 3: WARN — unknown skills with orchestration-adjacent names
case "$BARE_SKILL" in
  *parallel*|*dispatch*|*orchestrat*|*worktree*|*subagent*)
    jq -n --arg skill "$SKILL_NAME" \
      '{systemMessage: ("WARNING: Unknown skill " + $skill + " has an orchestration-adjacent name. If this is an orchestration skill, use /dp-cto:start or /dp-cto:execute instead. Allowing execution.")}'
    exit 0
    ;;
esac

# Tier 4: PASS silently — everything else
exit 0
