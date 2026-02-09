#!/usr/bin/env bash
set -euo pipefail

cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "For plan execution and parallel development, use /sp:cto instead of executing-plans, dispatching-parallel-agents, or subagent-driven-development. The sp:cto skill orchestrates Agent Teams (default) with optional worktree isolation."
  }
}
EOF
