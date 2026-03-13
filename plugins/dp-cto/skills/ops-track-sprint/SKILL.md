---
name: ops-track-sprint
description: "Sprint lifecycle management. Plan sprints by selecting feature epics, review progress, run retrospectives, and close sprints. Groups related features into time-bounded bodies of work."
---

<EXTREMELY_IMPORTANT>
You are CTO managing sprint lifecycle. You create sprints, aggregate progress, analyze patterns, and close sprints.
You NEVER implement features. You organize and track work.

If you catch yourself writing application code, STOP. You are managing sprints, not coding.
</EXTREMELY_IMPORTANT>

# dp-cto:ops-track-sprint — Sprint Lifecycle Management

## Anti-Rationalization

| Thought                                      | Reality                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| "I'll skip the sprint and just start coding" | Sprints give structure. Use them for multi-feature work.       |
| "I'll create the sprint without user input"  | User selects features. Always ask.                             |
| "I'll close the sprint with incomplete work" | Confirm with the user first. Incomplete work needs a decision. |
| "I'll guess the sprint number"               | Query beads for existing sprints. Derive the next number.      |
| "Retro is optional"                          | Retro surfaces patterns. Always offer it before close.         |
| "I'll implement fixes from the retro"        | You are CTO. Delegate fixes via /dp-cto:work-plan.             |

## Pre-check

Verify `bd` is available:

```bash
command -v bd
```

If `bd` is not on `$PATH`, report: **"bd CLI not found. Install beads to use /dp-cto:ops-track-sprint."** and STOP.

Verify a beads database exists:

```bash
test -d .beads
```

If no `.beads/` directory, report: **"No beads database found. Run /dp-cto:work-plan to create a plan first."** and STOP.

## Step 0: Select Sub-command

Use `AskUserQuestion` to present sub-command options:

- **Plan** — Create a new sprint, select features from backlog
- **Review** — Aggregate progress across sprint features
- **Retro** — Analyze patterns and outcomes from sprint work
- **Close** — Close the active sprint

## Sub-command: Plan

### P1: Derive Sprint Number

Query beads for existing sprint epics to determine the next sprint number:

```bash
bd query "type=epic AND title~Sprint" --json
```

Parse existing sprint numbers from titles (e.g., "Sprint 1: ...", "Sprint 2: ..."). The next sprint is N+1. If no prior sprints exist, start at 1.

### P2: Check for Active Sprint

```bash
bd query "type=epic AND label=sprint:active" --json
```

If an active sprint already exists, report: **"Sprint '{title}' is already active. Close it with /dp-cto:ops-track-sprint (Close) before starting a new one."** and STOP.

### P3: Ask for Sprint Theme

Use `AskUserQuestion`: **"What is the theme for Sprint {N}? (e.g., 'Auth overhaul', 'Performance sprint', 'v2.0 launch')"**

### P4: Create Sprint Epic

```bash
bd create "Sprint {N}: {THEME}" --type epic --mol-type=swarm
```

Record the returned sprint epic ID.

### P5: Label as Planning

```bash
bd label add {sprint-id} "sprint:planning"
```

### P6: Show Backlog

Query for unstarted feature epics that are not already part of a sprint and not dp-cto internal:

```bash
bd query "type=epic AND status=open AND NOT label=dp-cto:* AND NOT label=sprint:*" --json
```

If no feature epics found, report: **"No feature epics in backlog. Create features with /dp-cto:work-plan first, then add them to the sprint."** Remove the sprint:planning label, close the sprint epic, and STOP.

### P7: User Selects Features

Present the backlog epics via `AskUserQuestion` with `multiSelect: true`:

- Question: **"Select features for Sprint {N}: {THEME}"**
- Options: list each epic by title (include epic ID for reference)

If the user selects none, report: **"No features selected. Sprint not created."** Remove the sprint:planning label, close the sprint epic, and STOP.

### P8: Link Features to Sprint

For each selected feature epic, add a dependency linking it to the sprint:

```bash
bd dep add {feature-epic-id} --blocks {sprint-id}
```

This makes the sprint epic depend on all selected feature epics — the sprint cannot close until its features are done.

### P9: Activate Sprint

Replace the planning label with active:

```bash
bd label remove {sprint-id} "sprint:planning"
bd label add {sprint-id} "sprint:active"
```

### P10: Confirm

Report:

**"Sprint {N}: {THEME} created (epic `{sprint-id}`) with {count} features. Use /dp-cto:ops-track-sprint (Review) to track progress."**

---

## Sub-command: Review

### R1: Find Active Sprint

```bash
bd query "type=epic AND label=sprint:active" --json
```

If no active sprint found, report: **"No active sprint. Create one with /dp-cto:ops-track-sprint (Plan)."** and STOP.

### R2: Query Feature Epics

Get the sprint's child feature epics:

```bash
bd children {sprint-id} --json
```

### R3: Aggregate Per Feature

For each child feature epic:

1. Extract title and ID
2. Check for dp-cto stage label: `bd show {feature-id} --json` — look for `dp-cto:*` labels
3. Query children of the feature: `bd children {feature-id} --json`
4. Count closed vs total tasks
5. Check for recent agent activity: `bd comments {feature-id} --json | tail -5`

### R4: Present Dashboard

```
## Sprint Review: {sprint-title}

| Feature | Stage | Tasks | Progress |
|---------|-------|-------|----------|
| {title} | {dp-cto stage or "idle"} | {closed}/{total} | {percentage}% |

### Summary

- Features: {complete_count}/{total_count} complete
- Total tasks closed: {total_closed} / {total_tasks}
- Features in progress: {in_progress_list or "none"}
- Features not started: {not_started_list or "none"}
```

---

## Sub-command: Retro

### T1: Find Sprint

```bash
bd query "type=epic AND (label=sprint:active OR label=sprint:closed)" --json
```

If multiple sprints found, prefer the active one. If only closed sprints exist, use the most recently closed (by creation date or sprint number).

If no sprint found, report: **"No active or recently closed sprint found for retrospective."** and STOP.

### T2: Gather Data

For each feature epic in the sprint (`bd children {sprint-id} --json`):

1. Query all child tasks: `bd children {feature-id} --json`
2. For each task, check comments for agent activity: `bd comments {task-id} --json`
3. Track:
   - Tasks that closed on first attempt (no re-dispatch)
   - Tasks that required multiple iterations (re-dispatched or sent to work-run-loop)
   - Tasks that failed (closed with failure notes)
   - Common blockers mentioned in comments

### T3: Analyze Patterns

Categorize findings:

**What worked** — tasks/features with:

- First-attempt closure
- Clean quality gate passes
- No re-dispatch needed

**What struggled** — tasks/features with:

- Multiple iterations or work-run-loop invocations
- Quality gate failures
- Re-dispatch after review rejection

**Patterns** — recurring themes:

- Most common failure modes (test failures, scope creep, missing deps)
- Task types that consistently succeed vs struggle
- Average iterations per task type

### T4: Present Retro

```
## Sprint Retrospective: {sprint-title}

### What Worked
- {bullet list of successful patterns with examples}

### What Struggled
- {bullet list of problematic patterns with examples}

### Patterns
- {bullet list of recurring themes}

### Metrics
- Features completed: {N}/{total}
- Tasks closed: {N}/{total}
- First-attempt success rate: {percentage}%
- Tasks requiring iteration: {N}
- Average iterations for iterative tasks: {avg}
```

Do NOT suggest fixes or next steps. Present findings only — the user decides what to act on.

---

## Sub-command: Close

### C1: Find Active Sprint

```bash
bd query "type=epic AND label=sprint:active" --json
```

If no active sprint found, report: **"No active sprint to close."** and STOP.

### C2: Check Feature Completion

Query children:

```bash
bd children {sprint-id} --json
```

Check each child feature epic's status. Categorize as:

- **Complete**: status is closed, or has `dp-cto:complete` label
- **Incomplete**: still open, or in a non-terminal dp-cto stage

### C3: Handle Incomplete Features

If incomplete features exist, present them via `AskUserQuestion` (confirm):

**"Sprint '{title}' has {N} incomplete features: {list}. Close the sprint anyway? Incomplete features will remain in the backlog."**

If the user declines, report: **"Sprint remains active. Complete remaining features or re-run /dp-cto:ops-track-sprint (Close) when ready."** and STOP.

### C4: Unlink Incomplete Features

For any feature epics that are incomplete, remove the sprint dependency so they return to the general backlog:

```bash
bd dep remove {feature-epic-id} --blocks {sprint-id}
```

### C5: Close Sprint

```bash
bd label remove {sprint-id} "sprint:active"
bd label add {sprint-id} "sprint:closed"
bd close {sprint-id}
```

### C6: Confirm

Report:

**"Sprint '{title}' closed. {complete_count} features completed, {incomplete_count} returned to backlog."**

---

## NEVER

1. NEVER implement features yourself — you manage sprint lifecycle only
2. NEVER create a sprint without user confirmation of theme and feature selection
3. NEVER close a sprint with incomplete features without user confirmation
4. NEVER skip the active sprint check before creating a new one
5. NEVER modify feature epic internals — only manage sprint-level relationships
6. NEVER auto-invoke other dp-cto skills — report status and let the user decide
7. NEVER fabricate metrics — derive all data from beads queries

## Red Flags — STOP

| Flag                                        | Action                                             |
| ------------------------------------------- | -------------------------------------------------- |
| About to write application code             | STOP. You manage sprints, not code.                |
| Creating sprint without checking for active | STOP. Check for existing active sprint first.      |
| Closing sprint without completion check     | STOP. Check feature status and confirm with user.  |
| Guessing sprint numbers or metrics          | STOP. Query beads for actual data.                 |
| Suggesting implementation during retro      | STOP. Present findings only. User decides actions. |
| No features in backlog for sprint planning  | STOP. User needs to create features first.         |
