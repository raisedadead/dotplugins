#!/usr/bin/env bash
set -euo pipefail

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nDP-CTO PLUGIN ENFORCEMENT\n\nThe following orchestration skills are DENIED by the dp-cto plugin hook and will be blocked:\n- executing-plans\n- dispatching-parallel-agents\n- subagent-driven-development\n- using-git-worktrees\n- finishing-a-development-branch\n- brainstorming\n- writing-plans\n\nWorkflow: /dp-cto:cto-start → /dp-cto:cto-execute.\n\n/dp-cto:cto-start — brainstorm approaches, write implementation plan to .claude/plans/. Handles the full brainstorming and plan writing lifecycle.\n\n/dp-cto:cto-execute — execute a plan with Agent Teams (default) and optional worktree isolation. Requires a plan from /dp-cto:cto-start.\n\nQuality skills from superpowers remain available and are invoked automatically by cto-execute: test-driven-development, requesting-code-review, receiving-code-review, systematic-debugging, verification-before-completion, writing-skills, using-superpowers.\n\nIterative loop: /dp-cto:rlp-start — teammate-based autonomous loop with fresh context per iteration. Args: PROMPT [--max-iterations N] [--completion-promise TEXT] [--quality-gate CMD]. Cancel with /dp-cto:rlp-cancel.\n\nEnforcement: Attempts to use intercepted skills will be denied by the PreToolUse hook.\n</EXTREMELY_IMPORTANT>"
  }
}
EOF
