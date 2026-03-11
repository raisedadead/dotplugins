#!/usr/bin/env bash
set -euo pipefail

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
  DEGRADED_MSG="dp-cto: bd CLI not found. Install: brew install beads. Orchestration skills (start, execute, polish, sprint, interrupt, resume) disabled. Quality skills (tdd, debug, verify-done, review, sweep, board, cleanup) available."
elif [ ! -d "${CWD}/.beads" ]; then
  DEGRADED=true
  DEGRADED_MSG="dp-cto: No beads database found. Initialize: bd init --stealth"
fi

# ─── State initialization ───────────────────────────────────────────────────
RECOVERY_CONTEXT=""
BEADS_CONTEXT=""

# Source lib-stage.sh for backward compat (dual-write of legacy stage file) and recovery fallback (breadcrumb + stage file scan)
# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

if [ "$DEGRADED" = "false" ]; then
  # Source lib-state.sh for beads-backed state management
  # shellcheck source=lib-state.sh
  source "$(dirname "$0")/lib-state.sh"

  # Sync state from beads into local cache
  sync_from_beads

  # Write legacy stage file for backward compat with other hooks
  if [ -n "$SESSION_ID" ]; then
    write_stage "$SESSION_ID" "idle" ""
  fi

  # ─── Session Recovery Detection (beads-backed) ─────────────────────────────
  is_non_terminal() {
    case "$1" in
      planning|planned|executing|polishing) return 0 ;;
      *) return 1 ;;
    esac
  }

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

    if ! is_non_terminal "$epic_stage"; then
      return 1
    fi

    RECOVERY_CONTEXT="RECOVERY: Active epic (${epic_id}) is at stage '${epic_stage}'. Resume with /dp-cto:execute or /dp-cto:polish as appropriate."
    return 0
  }

  recover_from_breadcrumb() {
    local bc
    bc=$(read_breadcrumb)
    if [ -z "$bc" ]; then
      return 1
    fi

    local bc_stage _bc_plan_path bc_session_id
    read -r bc_stage _bc_plan_path bc_session_id < <(
      echo "$bc" | jq -r '[.stage // "", .plan_path // "", .session_id // ""] | @tsv'
    ) || return 1

    bc_stage=$(printf '%s' "$bc_stage" | tr -cd 'a-zA-Z0-9._-')
    bc_session_id=$(printf '%s' "$bc_session_id" | tr -cd 'a-zA-Z0-9._-')

    if ! is_non_terminal "$bc_stage"; then
      return 1
    fi

    local sf
    sf=$(stage_file "$bc_session_id")
    if [ ! -f "$sf" ]; then
      return 1
    fi

    RECOVERY_CONTEXT="RECOVERY (legacy breadcrumb): Prior session (${bc_session_id}) was at stage '${bc_stage}'. Resume with /dp-cto:execute or /dp-cto:polish as appropriate."
    return 0
  }

  recover_from_scan() {
    local dir
    dir=$(stage_dir)
    if [ ! -d "$dir" ]; then
      return 1
    fi

    local latest_file="" latest_ts="" latest_stage="" latest_sid=""

    for f in "$dir"/*.stage.json; do
      [ -f "$f" ] || continue

      local fname
      fname=$(basename "$f" .stage.json)

      if [ "$fname" = "$SESSION_ID" ]; then
        continue
      fi

      local s ts _pp
      read -r s ts _pp < <(jq -r '[.stage // "", .started_at // "", .plan_path // ""] | @tsv' "$f" 2>/dev/null) || continue

      if ! is_non_terminal "$s"; then
        continue
      fi

      # shellcheck disable=SC2072
      if [ -z "$latest_ts" ] || [[ "$ts" > "$latest_ts" ]]; then
        latest_file="$f"
        latest_ts="$ts"
        latest_stage="$s"
        latest_sid="$fname"
      fi
    done

    if [ -z "$latest_file" ]; then
      return 1
    fi

    RECOVERY_CONTEXT="RECOVERY (legacy stage scan): Prior session (${latest_sid}) was at stage '${latest_stage}'. Resume with /dp-cto:execute or /dp-cto:polish as appropriate."
    return 0
  }

  if [ -n "$SESSION_ID" ]; then
    recover_from_beads || recover_from_breadcrumb || recover_from_scan || true
  fi

  # ─── Beads prime context ───────────────────────────────────────────────────
  BD_OUTPUT=""
  set +e
  BD_OUTPUT=$(cd "$CWD" && bd prime 2>/dev/null)
  BD_EXIT=$?
  set -e
  if [ $BD_EXIT -eq 0 ] && [ -n "$BD_OUTPUT" ]; then
    BD_OUTPUT=$(printf '%s' "$BD_OUTPUT" | sed -E 's/<\/?[Ee][Xx][Tt][Rr][Ee][Mm][Ee][Ll][Yy]_[Ii][Mm][Pp][Oo][Rr][Tt][Aa][Nn][Tt]>//g')
    BD_OUTPUT="${BD_OUTPUT:0:4096}"
    BEADS_CONTEXT="$BD_OUTPUT"
  fi

else
  # Degraded mode (bd unavailable): write legacy stage file as recovery breadcrumb for future sessions
  if [ -n "$SESSION_ID" ]; then
    write_stage "$SESSION_ID" "idle" ""
  fi
fi

# ─── Build output ────────────────────────────────────────────────────────────
ENFORCEMENT_TEXT="<EXTREMELY_IMPORTANT>
DP-CTO PLUGIN ENFORCEMENT

dp-cto skills must ALWAYS be invoked exactly as requested:
- /dp-cto:start — brainstorm approaches, create beads molecule. Handles the full brainstorming and plan writing lifecycle.
- /dp-cto:execute — execute a plan using adaptive dispatch (subagents, iterative loops, or collaborative teams based on plan classification). Requires a plan from /dp-cto:start. Auto-chains into /dp-cto:polish on completion.
- /dp-cto:polish — multi-perspective code review and post-implementation polishing. Spawns parallel review agents with configurable lenses (security, simplification, test gaps, linting, performance, docs). Auto-chained after execute or invokable standalone from complete stage.
- /dp-cto:ralph — subagent-based autonomous iterative loop with fresh context per iteration. Args: PROMPT [--max-iterations N] [--completion-promise TEXT] [--quality-gate CMD].
- /dp-cto:ralph-cancel — cancel an active ralph loop.
- /dp-cto:verify — manual deep-validation of research findings.
- /dp-cto:sweep — entropy management and pattern drift detection across dead code, inconsistent patterns, stale comments, and naming violations.
- /dp-cto:cleanup — Sprint-boundary cleanup. Clears local cache, prunes completed ralph states, closes eligible epics, and handles sprint closure.
- /dp-cto:board — read-only project dashboard. Shows epic status, task progress, blockers, and sprint overview.
- /dp-cto:sprint — sprint lifecycle management (Plan/Review/Retro/Close). Manages sprint boundaries and epic assignments.
- /dp-cto:interrupt — suspend the active epic with context preservation. Allowed from executing or polishing. Captures progress, in-flight tasks, and blockers into epic notes.
- /dp-cto:resume — resume a previously suspended epic. Allowed from idle only. Restores context from suspension notes and shows available work.

dp-cto quality skills (side-effect-free, allowed from any stage): dp-cto:tdd, dp-cto:debug, dp-cto:verify-done, dp-cto:review, dp-cto:sweep, dp-cto:cleanup, dp-cto:board, dp-cto:sprint.

bd CLI is required for orchestration skills (start, execute, polish, interrupt, resume). Quality skills remain available without bd.

These are DISTINCT skills. Never substitute one dp-cto skill for another.

Workflow: /dp-cto:start → /dp-cto:execute → /dp-cto:polish.

Stage enforcement is active. The hook tracks your workflow stage and only allows valid transitions:
idle → planning (start running) → planned (start done) → executing (execute running) → polishing (execute done) → complete (polish done) → start (new cycle)
executing/polishing → suspended (interrupt). idle → resumed (resume restores pre-suspension stage).
ralph, verify, polish, and interrupt are allowed during executing. verify, polish, and interrupt are allowed during polishing. polish is allowed from complete (standalone re-polish). resume is allowed from idle. ralph-cancel is always allowed. board and sprint are allowed from any stage.
Out-of-order skill invocations will be denied by the PreToolUse hook.
</EXTREMELY_IMPORTANT>"

if [ -n "$RECOVERY_CONTEXT" ]; then
  ADDITIONAL_CONTEXT="${RECOVERY_CONTEXT}
${ENFORCEMENT_TEXT}"
else
  ADDITIONAL_CONTEXT="$ENFORCEMENT_TEXT"
fi

if [ -n "$BEADS_CONTEXT" ]; then
  ADDITIONAL_CONTEXT="${BEADS_CONTEXT}
${ADDITIONAL_CONTEXT}"
fi

if [ -n "$DEGRADED_MSG" ]; then
  ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT}
${DEGRADED_MSG}"
fi

jq -n --arg ctx "$ADDITIONAL_CONTEXT" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
