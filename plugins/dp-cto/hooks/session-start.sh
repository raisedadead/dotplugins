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

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
export CWD

source "$(dirname "$0")/lib-stage.sh"

if [ -n "$SESSION_ID" ]; then
  write_stage "$SESSION_ID" "idle" ""
fi

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nDP-CTO PLUGIN ENFORCEMENT\n\nThe following orchestration skills are DENIED by the dp-cto plugin hook and will be blocked:\n- executing-plans\n- dispatching-parallel-agents\n- subagent-driven-development\n- using-git-worktrees\n- finishing-a-development-branch\n- brainstorming\n- writing-plans\n- ralph-loop (replaced by /dp-cto:ralph)\n\ndp-cto's own skills are NEVER blocked and must ALWAYS be invoked exactly as requested:\n- /dp-cto:start — brainstorm approaches, write implementation plan to .claude/plans/. Handles the full brainstorming and plan writing lifecycle.\n- /dp-cto:execute — execute a plan using adaptive dispatch (subagents, iterative loops, or collaborative teams based on plan classification). Requires a plan from /dp-cto:start. Auto-chains into /dp-cto:polish on completion.\n- /dp-cto:polish — multi-perspective code review and post-implementation polishing. Spawns parallel review agents with configurable lenses (security, simplification, test gaps, linting, performance, docs). Auto-chained after execute or invokable standalone from complete stage.\n- /dp-cto:ralph — subagent-based autonomous iterative loop with fresh context per iteration. Args: PROMPT [--max-iterations N] [--completion-promise TEXT] [--quality-gate CMD].\n- /dp-cto:ralph-cancel — cancel an active ralph loop.\n- /dp-cto:verify — manual deep-validation of research findings.\n\nThese are DISTINCT skills. /dp-cto:execute is NOT the same as executing-plans. Never substitute one dp-cto skill for another.\n\nWorkflow: /dp-cto:start → /dp-cto:execute → /dp-cto:polish.\n\nQuality skills from superpowers remain available and are invoked automatically by execute: test-driven-development, requesting-code-review, receiving-code-review, systematic-debugging, verification-before-completion, writing-skills, using-superpowers.\n\nStage enforcement is active. The hook tracks your workflow stage and only allows valid transitions:\nidle → start → planned → execute → executing → polish → polishing → complete → start (new cycle)\nralph, verify, and polish are allowed during executing. verify is allowed during polishing. polish is allowed from complete (standalone re-polish). ralph-cancel is always allowed.\nOut-of-order skill invocations will be denied by the hook.\n\nEnforcement: Attempts to use intercepted skills will be denied by the PreToolUse hook.\n</EXTREMELY_IMPORTANT>"
  }
}
EOF
