---
name: ralph-cancel
description: "Cancel an active dp-cto:ralph loop. Lists active ralph state files and lets you choose which to cancel."
---

# Cancel dp-cto:ralph Loop

Follow these steps exactly:

## Step 1: Find Active Loops

Run via Bash: `ls .claude/ralph/*.md 2>/dev/null`

- If no files found: say "No active ralph loops found." and STOP.

## Step 2: Filter Active Loops

For each file found, read it and extract from the YAML frontmatter:

- `session_id`
- `status`
- `current_iteration`
- `max_iterations`

Also extract the task description from the `# Task` section.

Discard any file where `status` is NOT `running`. Only present files with `status: running`.

- If no files have `status: running`: say "No active ralph loops found." and STOP.
- If one active file: show its status and ask "Cancel this loop?"
- If multiple active files: show a numbered list with session ID, current iteration, and first line of task. Ask which to cancel.

## Step 3: Cancel

On confirmation:

1. Update the state file's YAML frontmatter using the Edit tool:
   - Set `status: cancelled`
   - Set `completed_at:` to current ISO timestamp

2. Report: "Cancelled ralph loop {SESSION_ID} at iteration {N}. State file preserved at .claude/ralph/{SESSION_ID}.md"

Do NOT delete the state file. It is a permanent record.
