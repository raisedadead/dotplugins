---
name: cto-but
description: Parallel development with GitButler virtual branches. Use when repo has `but setup` and tasks touch different files.
---

# CTO Mode (GitButler)

Orchestrate parallel work via virtual branches. You act as CTO — decompose, dispatch, monitor, integrate.

## Step 1: Dispatch Strategy

Ask the user:

| Option | When | Cost |
|--------|------|------|
| **Agent Teams** | Cross-layer work, tasks need discussion | Higher (separate sessions) |
| **Subagents** | Simple focused tasks | Lower (Task() tool) |

## Step 2: Design and Plan

Use `brainstorming` to clarify requirements, then `writing-plans` to create a plan in `.claude/plans/`.

## Step 3: Create Virtual Branches

One branch per independent task:

```bash
but branch new task/<name>
but branch list
```

## Step 4: Dispatch

### Agent Teams

1. `TeamCreate({ team_name: "feature-x" })`
2. `TaskCreate` for each task from the plan
3. Spawn teammates via `Task` tool with `team_name` and `name` params
4. Each teammate gets:
   - Explicit file scope (which files they own)
   - Full task spec inline (teammates don't inherit history)
   - Constraint: "Do NOT run git commands. Do NOT modify files outside your scope."
5. Teammates self-claim from shared task list
6. **Shift+Tab** for delegate mode — don't implement, steer

### Agent Teams Lifecycle

- Monitor: `TaskList` (Ctrl+T), incoming messages auto-delivered
- Steer: `SendMessage` to redirect, unblock, or provide context
- Review: Ask teammates to cross-review each other's work
- Shutdown: `SendMessage({ type: "shutdown_request" })` to each teammate
- Cleanup: `TeamDelete()`

### Subagents

All independent `Task()` calls in ONE message. Each gets:
- Explicit file scope
- Full task spec pasted inline
- Constraint: "Do NOT run git commands."

Monitor: `TaskOutput(task_id="...", block=false)`

## Step 5: Stage, Commit, Review, Ship

```bash
but status                        # See changes
but stage <file-id> task/<name>   # Assign to branch
but commit task/<name> --ai       # Commit
but show task/<name>              # Review
but squash task/<name>            # Optional
but push task/<name>
but pr new task/<name>
```

- Use `requesting-code-review` per branch
- Agent Teams: ask teammates to cross-review before shutdown

Update `.claude/plans/_index.md` when done.

## Red Flags — STOP

- Tasks share files → use `cto-wt` or go sequential
- Agent ran git commands → `but status` to check damage
- Lead implementing instead of delegating → Shift+Tab
