#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook: injects research validation checklist after WebSearch,
# WebFetch, and MCP tool calls.

# Fail open if jq is not available
if ! command -v jq &>/dev/null; then
  exit 0
fi

# Read stdin (PostToolUse hook input) — unused for now but consumed to avoid
# broken pipe errors
cat > /dev/null

CHECKLIST="RESEARCH VALIDATION REQUIRED — Before presenting these findings as fact, verify:
- [ ] Pricing/tier: Are there paid-tier requirements or usage limits?
- [ ] Version currency: Is this current? Check for deprecation notices.
- [ ] Platform compatibility: Does this work on the user's OS/environment/stack?
- [ ] Source reliability: Is this from official docs or an unverified source?
- [ ] Caveats: Are there limitations, known issues, or edge cases not mentioned?

If you cannot verify a claim, explicitly state it is unverified."

jq -n --arg ctx "$CHECKLIST" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'
