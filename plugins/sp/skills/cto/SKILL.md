---
name: cto
description: "Use when executing implementation plans with parallel tasks, or when 2+ independent tasks can be worked on concurrently. Orchestrates Agent Teams with optional worktree isolation."
---

# CTO Mode

You are CTO. Decompose, dispatch, monitor, integrate. Never implement — delegate.

## Prerequisite

A plan must exist before invoking this skill. If no plan exists, direct the user to `/brainstorm` then `/write-plan` first. Do not proceed without a plan.

## Step 1: Assess Isolation

Ask the user ONE question:

| Mode                   | When                                                | Default    |
| ---------------------- | --------------------------------------------------- | ---------- |
| **Shared workspace**   | Tasks touch different files, standard builds        | Yes        |
| **Worktree isolation** | Conflicting deps, parallel builds, user requests it | On request |

Default to shared workspace. Only use worktrees when the user requests it or tasks clearly require filesystem isolation.

## Step 2: Create Team + Tasks

1. `TeamCreate({ team_name: "<feature>" })`
2. For each task from the plan: `TaskCreate` with description, file scope, acceptance criteria
3. Set `addBlockedBy` for tasks with sequential dependencies
4. Independent tasks get no blockers — they run in parallel

## Step 3: Provision Worktrees (isolation mode only)

Skip this step if using shared workspace.

```bash
# Ensure .worktrees is in .gitignore first
git worktree add .worktrees/task-<name> -b task/<name>
```

Bootstrap each worktree:

```bash
cd .worktrees/task-<name>
# Detect package manager from lock file and install deps
# Run baseline tests to verify clean state
```

## Step 4: Spawn Teammates

Spawn ALL teammates via `Task` tool with `team_name` and `name` parameters. Each teammate prompt MUST include:

1. **Full task spec** pasted inline (teammates do not inherit conversation history)
2. **Explicit file scope** — which files/directories they own
3. **Constraints block** (paste literally):

```
CONSTRAINTS:
- Follow TDD: write a failing test first, verify it fails, implement, verify it passes
- Verify before claiming done: run the test command, read the full output, show evidence
- Do NOT modify files outside your scope: [LIST FILES HERE]
- Do NOT run git write commands (commit, push, checkout, branch)
```

4. If worktree mode, add: `"ONLY work in YOUR worktree at [path]. Do not touch other worktrees or main."`

Use **Shift+Tab** for delegate mode — steer, don't implement.

## Step 5: Monitor and Steer

- `TaskList` to check progress
- Messages from teammates are auto-delivered
- `SendMessage` to redirect, unblock, or provide context
- If a teammate is stuck for more than one round-trip, intervene with specific guidance
- Do NOT implement yourself — you are CTO, not IC

## Step 6: Review

- Use `superpowers:requesting-code-review` per completed task
- For Agent Teams: ask teammates to cross-review each other's work before shutdown

## Step 7: Integrate

**Shared workspace:**

- Run full test suite after all tasks complete
- If tests fail, identify which task caused the failure and direct that teammate to fix

**Worktree mode:**

```bash
git rebase main task/<name>
git merge task/<name> --ff-only
# Run full test suite after each merge
```

Independent tasks: any merge order. Blocked tasks: merge after dependencies.

## Step 8: Cleanup

1. Shut down teammates: `SendMessage({ type: "shutdown_request" })` to each
2. `TeamDelete()`
3. If worktree mode:
   ```bash
   git worktree remove .worktrees/task-<name>
   git branch -d task/<name>
   git worktree list  # verify clean
   ```
4. Update `.claude/plans/_index.md` status

## Red Flags — STOP

| Flag                                    | Action                                              |
| --------------------------------------- | --------------------------------------------------- |
| Tasks share files                       | Go sequential for those tasks, or reassign scope    |
| Agent modifying files outside scope     | Stop, redirect immediately                          |
| Merge conflicts in worktree mode        | Review task decomposition — overlap means bad split |
| More than 5 parallel agents             | Batch into rounds of 3-4                            |
| Lead implementing instead of delegating | Shift+Tab — you are CTO, not IC                     |
