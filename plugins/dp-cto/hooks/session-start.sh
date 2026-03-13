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
    results=$(cd "$CWD" && bd query "label=dp-cto:planning OR label=dp-cto:executing OR label=dp-cto:polishing" --json 2>/dev/null) || return 1

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
    epic_json=$(cd "$CWD" && bd query "label=dp-cto:executing OR label=dp-cto:polishing" --json 2>/dev/null) || return 1
    if [ -z "$epic_json" ] || [ "$epic_json" = "[]" ]; then return 1; fi
    local epic_id
    epic_id=$(echo "$epic_json" | jq -r '.[0].id // empty' 2>/dev/null) || return 1

    if [ -z "$epic_id" ]; then
      return 1
    fi

    local tasks
    tasks=$(cd "$CWD" && bd list --parent "$epic_id" --status in-progress --json 2>/dev/null) || return 1

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
ENFORCEMENT_TEXT="<EXTREMELY_IMPORTANT>
DP-CTO PLUGIN ENFORCEMENT

dp-cto skills must ALWAYS be invoked exactly as requested:
- /dp-cto:work-plan — brainstorm approaches, create beads molecule. Handles the full brainstorming and plan writing lifecycle.
- /dp-cto:work-run — execute a plan using adaptive dispatch (subagents, iterative loops, or collaborative teams based on plan classification). Requires a plan from /dp-cto:work-plan. Auto-chains into /dp-cto:work-polish on completion.
- /dp-cto:work-polish — multi-perspective code review and post-implementation polishing. Spawns parallel review agents with configurable lenses (security, simplification, test gaps, linting, performance, docs). Auto-chained after work-run or invokable standalone from complete stage.
- /dp-cto:work-run-loop — subagent-based autonomous iterative loop with fresh context per iteration. Args: PROMPT [--max-iterations N] [--completion-promise TEXT] [--quality-gate CMD].
- /dp-cto:work-stop-loop — cancel an active work-run-loop.
- /dp-cto:quality-fact-check — manual deep-validation of research findings.
- /dp-cto:quality-sweep-code — entropy management and pattern drift detection across dead code, inconsistent patterns, stale comments, and naming violations.
- /dp-cto:ops-clean-slate — Sprint-boundary cleanup. Clears local cache, prunes completed work-run-loop states, closes eligible epics, and handles sprint closure.
- /dp-cto:ops-show-board — read-only project dashboard. Shows epic status, task progress, blockers, and sprint overview.
- /dp-cto:ops-track-sprint — sprint lifecycle management (Plan/Review/Retro/Close). Manages sprint boundaries and epic assignments.
- /dp-cto:work-park — suspend the active epic with context preservation. Allowed from executing or polishing. Captures progress, in-flight tasks, and blockers into epic notes.
- /dp-cto:work-unpark — restore a previously suspended epic. Allowed from idle only. Restores context from suspension notes and shows available work.

dp-cto quality/ops skills (side-effect-free, allowed from any stage): dp-cto:quality-red-green-refactor, dp-cto:quality-deep-debug, dp-cto:quality-check-done, dp-cto:quality-code-review, dp-cto:quality-fact-check, dp-cto:quality-sweep-code, dp-cto:ops-clean-slate, dp-cto:ops-show-board, dp-cto:ops-track-sprint.

bd CLI is required for orchestration skills (work-plan, work-run, work-polish, work-park, work-unpark). Quality/ops skills remain available without bd.

These are DISTINCT skills. Never substitute one dp-cto skill for another.

Workflow: /dp-cto:work-plan → /dp-cto:work-run → /dp-cto:work-polish.

Stage enforcement is active. The hook tracks your workflow stage and only allows valid transitions:
idle → planning (work-plan running) → planned (work-plan done) → executing (work-run running) → polishing (work-run done) → complete (work-polish done) → work-plan (new cycle)
executing/polishing → suspended (work-park). idle → restored (work-unpark restores pre-suspension stage).
work-run-loop, quality-fact-check, work-polish, and work-park are allowed during executing. quality-fact-check, work-polish, and work-park are allowed during polishing. work-polish is allowed from complete (standalone re-polish). work-unpark is allowed from idle. work-stop-loop is always allowed. quality-* and ops-* skills are allowed from any stage.
Out-of-order skill invocations will be denied by the PreToolUse hook.
</EXTREMELY_IMPORTANT>"

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
