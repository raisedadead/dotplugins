---
name: cto-wt
description: Parallel development with git worktrees. Use when tasks need full filesystem isolation — heavy builds, conflicting deps, or no GitButler.
---

# CTO Mode (Worktrees)

Orchestrate parallel work via git worktree isolation. You act as CTO — decompose, dispatch, monitor, integrate.

## Step 1: Dispatch Strategy

Ask the user:

| Option          | When                                    | Cost                       |
| --------------- | --------------------------------------- | -------------------------- |
| **Agent Teams** | Cross-layer work, tasks need discussion | Higher (separate sessions) |
| **Subagents**   | Simple focused tasks                    | Lower (Task() tool)        |

## Step 2: Design and Plan

Use `brainstorming` to clarify requirements, then `writing-plans` to create a plan in `.claude/plans/`.

## Step 3: Provision Worktrees

One worktree per independent task:

```bash
git worktree add .worktrees/task-<name> -b task/<name>
git worktree list
```

After creation, bootstrap each:

```bash
cd .worktrees/task-<name>
# Install deps (detect from lock file: pnpm/yarn/npm install)
# Run baseline tests to verify clean state
```

Ensure `.worktrees` is in `.gitignore` before creating.

## Step 4: Dispatch

### Agent Teams

1. `TeamCreate({ team_name: "feature-x" })`
2. `TaskCreate` for each task from the plan
3. Spawn teammates via `Task` tool with `team_name` and `name` params
4. Each teammate gets:
   - Explicit worktree path (CRITICAL — each works in their own directory)
   - Full task spec inline (teammates don't inherit history)
   - Constraint: "ONLY modify files in YOUR worktree. Do NOT touch other worktrees or main."
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

- Explicit worktree path as working directory
- Full task spec pasted inline
- Constraint: "ONLY modify files in YOUR worktree"

Monitor: `TaskOutput(task_id="...", block=false)`

## Step 5: Review

- Use `requesting-code-review` per worktree
- Agent Teams: ask teammates to cross-review before shutdown
- Verify: `git -C .worktrees/task-<name> diff main...HEAD`

## Step 6: Integrate

```bash
git rebase main task/<name>
git merge task/<name> --ff-only
# Run full test suite after each merge
```

Independent tasks: any merge order. Blocked tasks: after dependencies.

## Step 7: Cleanup

```bash
git worktree remove .worktrees/task-<name>
git branch -d task/<name>
git worktree list  # Verify
```

Agent Teams: shut down teammates before cleanup.

Update `.claude/plans/_index.md` when done.

## Red Flags — STOP

- Tasks share files → go sequential, not parallel
- Agent modifying wrong worktree → stop, redirect
- Merge conflicts → review decomposition
- Too many worktrees (5+) → batch
