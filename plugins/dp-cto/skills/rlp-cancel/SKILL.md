---
name: rlp-cancel
description: "Cancel an active dp-cto:rlp-start loop. Lists active ralph state files and lets you choose which to cancel."
---

# Cancel dp-cto:rlp-start Loop

Follow these steps exactly:

## Step 1: Find Active Loops

Run via Bash: `ls .claude/ralph/*.md 2>/dev/null`

- If no files found: say "No active ralph loops found." and STOP.

## Step 2: Show Status

For each file found, read it and extract from the YAML frontmatter:

- `session_id`
- `status`
- `current_iteration`
- `max_iterations`

Also extract the task description from the `# Task` section.

If only one file: show its status and ask "Cancel this loop?"

If multiple files: show a numbered list with session ID, status, current iteration, and first line of task. Ask which to cancel.

## Step 3: Cancel

On confirmation:

1. Update the state file's YAML frontmatter using the Edit tool:
   - Set `status: cancelled`
   - Set `completed_at:` to current ISO timestamp

2. Attempt team cleanup (best-effort — the team may already be gone):
   - Read `team_name` from the state file frontmatter
   - Call `TeamDelete()`
   - If TeamDelete fails, that's fine — the coordinator session may have already cleaned up

3. Report: "Cancelled ralph loop {SESSION_ID} at iteration {N}. State file preserved at .claude/ralph/{SESSION_ID}.md"

Do NOT delete the state file. It is a permanent record.
