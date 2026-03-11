---
name: reset
description: "Sprint-boundary cleanup. Prunes ended stage files, completed ralph states, stale breadcrumbs, and runs beads housekeeping. Deliberate action — invoke when a body of work is done."
---

# CTO Reset — Sprint Boundary Cleanup

## Pre-check

Verify no active work is in progress:

```bash
bd ready
bd list --status=in_progress
```

If there are open or in-progress issues the user hasn't explicitly closed, use `AskUserQuestion` to confirm: **"There are N open/in-progress beads issues. Continue with reset?"** If the user says no, stop.

## Step 1: Show What Will Be Cleaned

Scan and report before touching anything. Show counts for each category:

1. **Stage files** — `.claude/dp-cto/*.stage.json` with `ended`, `complete`, or `idle` stage (skip non-terminal: `planning`, `planned`, `executing`, `polishing` — those are recovery-eligible)
2. **Breadcrumb** — `.claude/dp-cto/active.json` if it exists
3. **Ralph state files** — `.claude/ralph/*.md` with `status: complete`, `status: exhausted`, or `status: cancelled` in frontmatter (skip `status: running` — that's an active loop)
4. **Beads** — run `bd epic close-eligible --json` to find epics where all children are closed
5. **Git worktrees** — run `git worktree list` and identify any worktrees under `.claude/worktrees/`

Present the summary to the user via `AskUserQuestion` (confirm): **"Reset will clean: N stage files, N ralph states, N closeable epics, N orphaned worktrees. Proceed?"**

If the user declines, stop.

## Step 2: Clean

Execute in order:

### 2a: Stage files

Delete all `.claude/dp-cto/*.stage.json` files that have `ended`, `complete`, or `idle` stage. Leave non-terminal states intact for recovery.

Delete `.claude/dp-cto/active.json` if present.

### 2b: Ralph state files

Delete `.claude/ralph/*.md` files with `status: complete`, `status: exhausted`, or `status: cancelled`.

If `.claude/ralph/` is empty after cleanup, remove the directory.

### 2c: Beads housekeeping

Close eligible epics:

```bash
bd epic close-eligible
```

### 2d: Git worktrees

For each worktree under `.claude/worktrees/`:

```bash
git worktree remove <path>
```

If `.claude/worktrees/` is empty after cleanup, remove the directory.

## Step 3: Confirm

Run a final status check and report what was cleaned:

```bash
ls .claude/dp-cto/ 2>/dev/null || echo "dp-cto state: clean"
ls .claude/ralph/ 2>/dev/null || echo "ralph state: clean"
git worktree list
bd status
```

Report the summary. Do not suggest next steps — the user knows what to do.
