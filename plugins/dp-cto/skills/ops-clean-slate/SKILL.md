---
name: ops-clean-slate
description: "Sprint-boundary cleanup. Clears local cache, closes eligible epics, cleans dp-cto labels from completed work, handles sprint closure, prunes work-run-loop states and orphaned worktrees. Deliberate action — invoke when a body of work is done."
---

# CTO Cleanup — Sprint Boundary Cleanup

## Pre-check

Verify no active work is in progress:

```bash
bd ready
bd list --status=in_progress
```

If there are open or in-progress issues the user hasn't explicitly closed, use `AskUserQuestion` to confirm: **"There are N open/in-progress beads issues. Continue with cleanup?"** If the user says no, stop.

## Step 1: Show What Will Be Cleaned

Scan and report before touching anything. Show counts for each category:

1. **Local cache** — `.claude/dp-cto/cache.json` if it exists (SessionStart recreates it on next session)
2. **work-run-loop state files** — `.claude/ralph/*.md` with `status: complete`, `status: exhausted`, or `status: cancelled` in frontmatter (skip `status: running` — that's an active loop)
3. **Closeable epics** — run `bd epic close-eligible --json` to find epics where all children are closed
4. **Completed dp-cto labels** — run `bd query "label=dp-cto:complete" --json` to find closed epics still carrying dp-cto state labels
5. **Active sprint** — read the `sprint` field from `.claude/dp-cto/cache.json` (if non-empty, an active sprint exists); also run `bd sprint current --json` to check for an active sprint in beads
6. **Git worktrees** — run `git worktree list` and identify any worktrees under `.claude/worktrees/`

Present the summary to the user via `AskUserQuestion` (confirm): **"Cleanup will clean: cache.json, N work-run-loop states, N closeable epics, N stale dp-cto labels[, active sprint 'NAME'][, N orphaned worktrees]. Proceed?"**

If the user declines, stop.

## Step 2: Clean

Execute in order:

### 2a: Local cache

Delete `.claude/dp-cto/cache.json`. SessionStart will recreate it by syncing from beads on the next session.

```bash
rm -f .claude/dp-cto/cache.json
```

### 2b: Ralph state files

Delete `.claude/ralph/*.md` files with `status: complete`, `status: exhausted`, or `status: cancelled`.

If `.claude/ralph/` is empty after cleanup, remove the directory.

### 2c: Beads housekeeping — close eligible epics

Close eligible epics:

```bash
bd epic close-eligible
```

### 2d: Beads housekeeping — clean dp-cto labels

Remove dp-cto state labels from completed/closed epics so they don't pollute future `bd query "label=dp-cto:*"` results:

```bash
bd query "label=dp-cto:complete" --json
```

For each returned epic, remove the dp-cto label:

```bash
bd label remove <epic-id> "dp-cto:complete"
```

### 2e: Sprint closure (conditional)

If an active sprint was detected in Step 1, use `AskUserQuestion` to confirm: **"Close active sprint 'NAME'?"**

If the user confirms:

```bash
bd sprint close
```

If the user declines, skip — the sprint carries over.

### 2f: Git worktrees

For each worktree under `.claude/worktrees/`:

```bash
git worktree remove <path>
```

If `.claude/worktrees/` is empty after cleanup, remove the directory.

## Step 3: Confirm

Run a final status check and report what was cleaned:

```bash
ls .claude/dp-cto/ 2>/dev/null || echo "dp-cto state: clean"
ls .claude/ralph/ 2>/dev/null || echo "work-run-loop state: clean"
git worktree list
bd status
```

Report the summary. Do not suggest next steps — the user knows what to do.
