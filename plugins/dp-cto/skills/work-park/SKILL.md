---
name: work-park
description: "Suspend the active epic with context preservation. Captures in-progress state, ready tasks, and blockers into epic notes for future resumption. Use when switching to urgent work."
---

# dp-cto:work-park — Context-Preserving Work Suspension

## Stage Enforcement

This skill is allowed from `executing` or `polishing` only. The PreToolUse hook enforces this. If you are in a different stage, the hook will deny the invocation.

## Step 1: Read Active Epic

Read the local cache to find the active epic. Use the Bash tool:

```bash
cat .claude/dp-cto/cache.json
```

Extract the `active_epic` field.

- If `active_epic` is empty or missing: say **"No active epic found. Nothing to suspend."** and STOP.

Record the epic ID for subsequent steps.

## Step 2: Capture Context

Gather the current state of work to preserve a useful handoff for resumption.

### 2a: Epic Details

```bash
bd show {epic-id} --json
```

Extract: epic title, current dp-cto label (stage), total task count, closed task count.

### 2b: Ready Tasks

```bash
bd ready --json
```

Extract: list of task IDs and titles that are currently unblocked and available for dispatch.

### 2c: In-Progress Tasks

```bash
bd list --parent {epic-id} --status in-progress --json
```

Extract: list of task IDs and titles currently being worked on.

### 2d: Synthesize Suspension Notes

Build a suspension summary from the gathered data:

```
SUSPENDED at {ISO-8601 timestamp}
Stage: {current stage from cache, e.g. executing or polishing}
Progress: {closed_count}/{total_count} tasks complete
In-progress: {list of in-progress task titles, or "None"}
Ready next: {list of ready task titles, or "None"}
Blockers: {any notable blockers or issues encountered, or "None known"}
Context: {1-2 sentences about what was happening when interrupted — infer from in-progress tasks and recent conversation}
```

## Step 3: Write Suspension Notes to Epic

Append the suspension notes to the epic so they persist in beads and are available across sessions:

```bash
bd update {epic-id} --append-notes "SUSPENDED at {timestamp}: Stage={stage}, Progress={closed}/{total}, In-progress=[{tasks}], Ready=[{tasks}], Blockers={blockers}, Context={context}"
```

Keep the notes compact — this is a handoff protocol, not a report. One line, structured, parseable.

## Step 4: Suspend State

The PostToolUse hook (`stage-transition.sh`) handles the state transition automatically when this skill completes. It calls `suspend_state` which:

1. Sets `dp-cto=suspended` on the epic via beads
2. Updates the local cache: removes the epic from active, adds to suspended list, sets stage to idle

No manual action needed in this step — the hook fires after the skill runs.

## Step 5: Confirm to User

Print exactly:

**"Epic `{epic-id}` suspended ({closed}/{total} tasks complete). Start new work with `/dp-cto:work-plan` or return with `/dp-cto:work-unpark`."**

## NEVER

1. NEVER interrupt without writing suspension notes — the notes are the handoff protocol
2. NEVER delete or close tasks during interrupt — suspend preserves all state
3. NEVER auto-resume after interrupt — the user decides when to return
4. NEVER skip context capture — even if it seems obvious, write it down
5. NEVER modify task state (close, reopen) during interrupt — only the epic state changes

## Red Flags — STOP

| Flag                                       | Action                                              |
| ------------------------------------------ | --------------------------------------------------- |
| No active epic in cache                    | STOP. Nothing to suspend.                           |
| About to close or modify tasks             | STOP. Interrupt only suspends the epic, not tasks.  |
| About to start new work without suspending | STOP. Suspend first, then start new work.           |
| Suspension notes are empty or generic      | STOP. Write specific context for future resumption. |
