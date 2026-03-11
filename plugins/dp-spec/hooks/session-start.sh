#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq &>/dev/null; then
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "dp-spec plugin loaded (jq not available — stage tracking disabled)."
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

# shellcheck source=lib-stage.sh
source "$(dirname "$0")/lib-stage.sh"

if [ -n "$SESSION_ID" ]; then
  write_stage "$SESSION_ID" "idle"
fi

# ─── Session Recovery Detection ──────────────────────────────────────────────
RECOVERY_CONTEXT=""

is_non_terminal() {
  case "$1" in
    discovering|discovered|brainstorming|brainstormed|researching|researched|drafting|drafted|challenging|challenged) return 0 ;;
    *) return 1 ;;
  esac
}

recover_from_breadcrumb() {
  local bc
  bc=$(read_breadcrumb)
  if [ -z "$bc" ]; then
    return 1
  fi

  local bc_stage bc_session_id
  read -r bc_stage bc_session_id < <(
    echo "$bc" | jq -r '[.stage // "", .session_id // ""] | @tsv'
  ) || return 1

  bc_stage=$(printf '%s' "$bc_stage" | tr -cd 'a-zA-Z0-9._-')
  bc_session_id=$(printf '%s' "$bc_session_id" | tr -cd 'a-zA-Z0-9._-')

  if ! is_non_terminal "$bc_stage"; then
    return 1
  fi

  local sf
  sf=$(stage_file "$bc_session_id" 2>/dev/null) || return 1
  if [ ! -f "$sf" ]; then
    return 1
  fi

  RECOVERY_CONTEXT="RECOVERY: Prior dp-spec session (${bc_session_id}) was at stage '${bc_stage}'. Resume with the appropriate dp-spec skill."
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

    local s ts
    read -r s ts < <(jq -r '[.stage // "", .started_at // ""] | @tsv' "$f" 2>/dev/null) || continue

    if ! is_non_terminal "$s"; then
      continue
    fi

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

  latest_sid=$(printf '%s' "$latest_sid" | tr -cd 'a-zA-Z0-9._-')
  latest_stage=$(printf '%s' "$latest_stage" | tr -cd 'a-zA-Z0-9._-')

  RECOVERY_CONTEXT="RECOVERY: Prior dp-spec session (${latest_sid}) was at stage '${latest_stage}'. Resume with the appropriate dp-spec skill."
  return 0
}

if [ -n "$SESSION_ID" ]; then
  recover_from_breadcrumb || recover_from_scan || true
fi

# ─── Build output ────────────────────────────────────────────────────────────
ENFORCEMENT_TEXT="<EXTREMELY_IMPORTANT>
DP-SPEC PLUGIN ENFORCEMENT

dp-spec skills must ALWAYS be invoked exactly as requested:
- /dp-spec:plan — discover constraints and brainstorm approaches. Shortcut that runs discover + brainstorm.
- /dp-spec:discover — discover constraints, requirements, and boundaries.
- /dp-spec:brainstorm — brainstorm approaches and trade-offs.
- /dp-spec:research — deep research and validation. Standalone mode (--standalone) bypasses stage enforcement.
- /dp-spec:draft — draft the specification document.
- /dp-spec:challenge — adversarial review and challenge of the draft.
- /dp-spec:handoff — finalize and hand off the completed spec.

dp-spec quality skills (side-effect-free, allowed from any stage): dp-spec:research (standalone mode with --standalone).

These are DISTINCT skills. Never substitute one dp-spec skill for another.

Workflow: /dp-spec:discover -> /dp-spec:brainstorm -> /dp-spec:research -> /dp-spec:draft -> /dp-spec:challenge -> /dp-spec:handoff.
Shortcut: /dp-spec:plan (runs discover + brainstorm).

Stage enforcement is active. The hook tracks your workflow stage and only allows valid transitions:
idle -> discovering (discover/plan running) -> discovered (discover/plan done) -> brainstorming (brainstorm running) -> brainstormed (brainstorm done) -> researching (research running) -> researched (research done) -> drafting (draft running) -> drafted (draft done) -> challenging (challenge running) -> challenged (challenge done) -> complete (handoff done) -> plan (new cycle)
Out-of-order skill invocations will be denied by the PreToolUse hook.
</EXTREMELY_IMPORTANT>"

if [ -n "$RECOVERY_CONTEXT" ]; then
  ADDITIONAL_CONTEXT="${RECOVERY_CONTEXT}
${ENFORCEMENT_TEXT}"
else
  ADDITIONAL_CONTEXT="$ENFORCEMENT_TEXT"
fi

jq -n --arg ctx "$ADDITIONAL_CONTEXT" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
