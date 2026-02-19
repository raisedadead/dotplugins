#!/usr/bin/env bash
set -euo pipefail

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nSP PLUGIN ENFORCEMENT\n\nThe following 5 orchestration skills are DENIED by the sp plugin hook and will be blocked:\n- executing-plans\n- dispatching-parallel-agents\n- subagent-driven-development\n- using-git-worktrees\n- finishing-a-development-branch\n\nUse /sp:cto instead — it provides unified orchestration with Agent Teams (default) and optional worktree isolation.\n\nQuality skills from superpowers remain available: test-driven-development, requesting-code-review, receiving-code-review, systematic-debugging, verification-before-completion, brainstorming, writing-plans, writing-skills, using-superpowers.\n\nPlan prerequisite: /brainstorm → /write-plan → /sp:cto. Do not invoke /sp:cto without a plan in .claude/plans/.\n\nEnforcement: Attempts to use intercepted skills will be denied by the PreToolUse hook.\n</EXTREMELY_IMPORTANT>"
  }
}
EOF
