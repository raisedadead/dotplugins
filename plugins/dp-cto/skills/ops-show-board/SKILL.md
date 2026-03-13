---
name: ops-show-board
description: "Read-only dashboard of current dp-cto work state. Queries beads for active, suspended, and ready work, sprint progress, and recent agent activity."
---

# dp-cto:ops-show-board — Work State Dashboard

Read-only dashboard. No state changes, no user interaction needed. Query beads, format output, present.

## Pre-check

Verify `bd` is available:

```bash
command -v bd
```

If `bd` is not on `$PATH`, report: **"bd CLI not found. Install beads to use /dp-cto:ops-show-board."** and STOP.

Verify a beads database exists:

```bash
test -d .beads
```

If no `.beads/` directory, report: **"No beads database found. Run /dp-cto:work-plan to create a plan first."** and STOP.

## Section 1: Active Work

Query all epics in active dp-cto stages:

```bash
bd query "label=dp-cto:planning OR label=dp-cto:planned OR label=dp-cto:executing OR label=dp-cto:polishing" --json
```

For each epic found:

1. Extract the epic title and current stage label (the `dp-cto:*` label)
2. Query children: `bd children {epic-id} --json`
3. Count closed vs total children for progress

Present as:

```
## Active Work

| Epic | Stage | Progress |
|------|-------|----------|
| {title} | {stage} | {closed}/{total} tasks |
```

If no results: show `No active work.`

## Section 2: Suspended Work

```bash
bd query "label=dp-cto:suspended" --json
```

For each suspended epic:

1. Extract title
2. Check for a `suspended:*` label or comment noting why/when it was suspended

Present as:

```
## Suspended Work

| Epic | Suspended | Notes |
|------|-----------|-------|
| {title} | {date or "unknown"} | {context or "—"} |
```

If no results: show `No suspended work.`

## Section 3: Sprint Progress

```bash
bd query "type=epic AND label=sprint:active" --json
```

If a sprint epic exists:

1. Extract sprint title
2. Query children: `bd children {sprint-id} --json`
3. Count closed vs total for completion percentage

Present as:

```
## Sprint Progress

**{sprint-title}**
Features: {total} | Complete: {closed} | {percentage}%
```

If no sprint epic found: omit this section entirely (do not show an empty section).

## Section 4: Recent Agent Activity

Identify the active epic from Section 1 (use the one in `executing` or `polishing` stage; if multiple, use the most recent).

If an active epic exists:

```bash
bd comments {epic-id} | tail -10
```

Present as:

```
## Recent Agent Activity

{last 10 comment lines, preserving formatting}
```

If no active epic or no comments: omit this section entirely.

## Section 5: Ready Work

```bash
bd ready
```

Present as:

```
## Ready for Dispatch

{bd ready output, preserving formatting}
```

If no tasks are ready: show `No tasks ready for dispatch.`

## Output

Present all sections in a single formatted message. Sections with no data either show their empty-state message (Sections 1, 2, 5) or are omitted entirely (Sections 3, 4).

Do NOT offer next steps or suggestions. The dashboard is informational only.

## NEVER

1. NEVER modify any state — no `bd create`, no `bd close`, no `bd edit`, no cache writes
2. NEVER prompt the user for input — this is a non-interactive dashboard
3. NEVER suggest actions — present data only
4. NEVER fail with an error on empty results — show the empty-state message instead
5. NEVER run commands that modify the working tree, index, or beads database
