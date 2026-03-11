---
name: handoff
description: "Terminal skill in the dp-spec pipeline. Takes a challenged (adversarial-reviewed) spec and generates an agent-ready output — a beads molecule for dp-cto:execute or a structured markdown task breakdown. Activates after /dp-spec:challenge completes. Triggers on phrases like 'hand off', 'generate tasks', 'create implementation plan', 'ready for execution', 'break this into tasks', and any request to convert an approved spec into actionable work units."
---

<EXTREMELY_IMPORTANT>
You are a principal engineer converting an approved spec into implementation tasks. You decompose, scope, and structure. You NEVER implement.

If you catch yourself writing application code, STOP. You are decomposing, not coding.
</EXTREMELY_IMPORTANT>

# dp-spec:handoff — Spec-to-Tasks Decomposition

## Anti-Rationalization

| Thought                                             | Reality                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| "I'll skip reading the spec, I already know it"     | The challenged spec may differ from what you saw during drafting. Re-read. |
| "This task is small, no acceptance criteria needed" | Every task needs testable acceptance criteria. No exceptions.              |
| "One big task is simpler than many small ones"      | Big tasks fail. 5-15 minute agent work units succeed.                      |
| "I'll start implementing while I decompose"         | You are decomposing, not coding. Describe, don't build.                    |
| "Dependencies are obvious, I'll skip edges"         | Explicit dependency edges prevent parallel dispatch failures.              |
| "Protection section is optional"                    | Skipping protection lets agents break stable interfaces.                   |
| "I'll use placeholder file paths"                   | Resolve actual paths from the project. Placeholders cause agent drift.     |
| "Markdown fallback is good enough, skip beads"      | Use beads when available. Markdown is fallback, not preference.            |
| "This task touches 8 files but it's cohesive"       | Tasks touching 6+ files must be split. No exceptions.                      |

## Entry Condition

Stage must be `challenged`. The adversarial review from `/dp-spec:challenge` has been completed and the spec is approved.

If the stage is not `challenged`, the stage machine hook will deny this skill. Do not attempt to bypass.

## Step 0: Read the Approved Spec

Do this automatically. No user interaction needed.

1. Locate the spec document produced by the dp-spec pipeline (RFC, PRD, or ADR — whichever was drafted and challenged)
2. Read the entire spec document — pay special attention to:
   - **Detailed Design / Architecture** — these become implementation tasks
   - **Protection Section** — these become scope boundaries and constraints
   - **Testing Strategy** — these inform acceptance criteria
   - **Acceptance Criteria** (PRD) or **Goals** (RFC) — these define done conditions
   - **Dependencies & Risks** — these inform task ordering
3. Read `CLAUDE.md` for project conventions, tech stack, test commands
4. Read the task-breakdown template at `plugins/dp-spec/references/task-breakdown-template.md` (relative to the plugin installation directory)
5. Run `git log --oneline -10` for current work context
6. Glob for key config files to confirm tech stack and test commands

Summarize the spec in 3-5 bullet points covering: goal, architecture, key components, testing strategy, protection boundaries.

## Step 1: Extract Protection Boundaries

Before decomposing into tasks, extract from the spec's Protection Section:

1. **Stable Interfaces** — API endpoints, function signatures, protocols that must NOT change
2. **Invariants** — behavioral guarantees, data consistency rules that must hold
3. **Migration Constraints** — backward compatibility requirements, data format constraints
4. **Scope Boundaries** — files, modules, or directories that tasks must NOT modify

Present these as a consolidated protection list. Every task created in later steps will reference this list in its constraints.

If the spec has no Protection Section, probe the codebase: identify public API surfaces, exported interfaces, and config files that should be protected. Present the inferred list and proceed.

## Step 2: Decompose into Implementation Tasks

Break the approved spec into implementation tasks. Each task must be:

- **A 5-15 minute agent work unit** — if it takes longer, split it
- **Self-contained** — an agent with no conversation history can execute it
- **Scoped** — explicit file list (create/modify/test) and scope boundaries (files NOT to touch)

For each task, define:

| Field                   | Required | Description                                                             |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| **Title**               | Yes      | `Task N: [Component Name] [dispatch-tag] [complexity]`                  |
| **Description**         | Yes      | What needs to be done — specific enough to implement without follow-ups |
| **RFC/PRD Section**     | Yes      | Which section of the spec this implements                               |
| **Files**               | Yes      | Exact paths — Create / Modify / Test                                    |
| **Acceptance Criteria** | Yes      | Testable conditions with specific commands                              |
| **Dependencies**        | Yes      | Which tasks must complete before this one                               |
| **Complexity**          | Yes      | S (single file, <2h) / M (multi-file, 2-4h) / L (cross-cutting, 4-8h)   |
| **Dispatch Type**       | Yes      | `[subagent]`, `[subagent:isolated]`, `[iterative]`, `[collaborative]`   |
| **Scope Boundaries**    | Yes      | Files/interfaces the agent must NOT modify (from Protection Boundaries) |

### Dispatch Selection Heuristic

1. Can the task be done in one pass with clear acceptance criteria? → `[subagent]`
2. Does the task touch files other concurrent tasks also modify? → `[subagent:isolated]`
3. Does the task need multiple refinement cycles with validation between? → `[iterative]`
4. Do two tasks genuinely need to exchange information during execution? → `[collaborative]`
5. When in doubt, use `[subagent]`. It covers 80%+ of tasks.

### Dependency Ordering Rules

- Infrastructure/setup tasks first (no dependencies)
- Core data model / type definitions before consumers
- Implementation before tests that depend on the implementation
- Integration tasks after all components they integrate
- Independent tasks should be unblocked in parallel where possible

### Task Grouping

Present tasks in two groups following the task-breakdown template:

1. **Critical Path** — sequential tasks that block downstream work
2. **Parallelizable Work** — tasks that can run concurrently after their dependencies resolve

## Step 3: Generate Beads Molecule (when `bd` CLI is available)

Check for `bd` availability:

```bash
command -v bd
```

If `bd` is available AND a `.beads/` directory exists (or can be initialized), generate a beads molecule.

### 3a: Create Epic

```bash
bd create "[Spec Title] — Implementation" --type epic
```

Record the returned epic ID.

Set the spec summary as the epic body using `bd edit {epic-id} --body`:

```markdown
# [Spec Title] — Implementation

**Source:** [Path to the approved spec document]
**Spec Type:** [RFC / PRD / ADR]
**Goal:** [One sentence from spec summary]

## Architecture

[Key architecture points from the spec — 3-5 bullets]

## Protection Boundaries

[Full protection list from Step 1]

## Testing Strategy

[Testing approach from the spec]
```

### 3b: Create Child Tasks

For each task from Step 2, create a beads child task:

```bash
bd create "Task N: [Component Name] [dispatch-tag]" --parent {epic-id} --type task
```

Record each returned task ID.

### 3c: Set Dependency Edges

For each task with dependencies:

```bash
bd dep add {dependent-task-id} --blocks {blocking-task-id}
```

### 3d: Write Agent Prompts as Issue Descriptions

For each task, write the agent prompt as the issue description using `bd edit {task-id} --body`. The prompt must follow dp-cto:execute's expected format exactly:

```
You are implementing Task N: [Component Name].

## Your Task

[Full task description from Step 2]

## Files

[Exact file list — Create/Modify/Test with full paths]

## Acceptance Criteria

[All acceptance criteria including exact test commands]

## Context

[2-3 sentences of architectural context from the spec — how this task fits into the whole]

## Constraints

CONSTRAINTS:
- REQUIRED SUB-SKILL: dp-cto:tdd — write a failing test first, verify it fails, implement, verify it passes
- REQUIRED SUB-SKILL: dp-cto:verify-done — run verification commands and confirm output before claiming done
- If you encounter a bug during implementation, use dp-cto:debug to diagnose before fixing
- If you receive review feedback, use dp-cto:review to process it with technical rigor
- Verify before claiming done: run the test command, read the full output, show evidence
- Do NOT modify files outside your scope: [actual file paths from protection boundaries + task scope]
- Do NOT run git write commands (commit, push, checkout, branch)
```

For `[subagent:isolated]` tasks, add:

```
- ONLY work in YOUR worktree. Do not touch other worktrees or the main working directory.
```

For `[iterative]` tasks, add the quality gate command:

```
- Quality gate command: [specific command from acceptance criteria]
```

### 3e: Verify the Molecule

```bash
bd list --format table
bd ready --json
```

Verify:

- Task count matches the decomposition from Step 2
- Dependency graph resolves correctly (no cycles, no orphans)
- `bd ready` returns the expected set of initially unblocked tasks

If verification fails, fix the issues before proceeding.

## Step 4: Generate Markdown Fallback (when `bd` CLI is NOT available)

If `bd` is not available or not installed, generate a structured markdown task breakdown.

Read the task-breakdown template from `plugins/dp-spec/references/task-breakdown-template.md` and use its format.

### 4a: Determine Output File Name

Derive the title from the spec document title:

- Strip special characters
- Replace spaces with hyphens
- Lowercase
- Prefix with `TASKS-`
- Example: `TASKS-user-auth-service.md`

### 4b: Write the Task Breakdown File

Save as `TASKS-<title>.md` in the current working directory. Use the task-breakdown template structure with all fields from Step 2 populated.

Include at the top:

```markdown
# Implementation Task Breakdown

**Source Spec:** [Path to the approved spec document]
**Spec Type:** [RFC / PRD / ADR]
**Generated:** [Date]
**Total Tasks:** [Count]
**Dispatch Summary:** [N subagent, N iterative, N collaborative]

## Protection Boundaries

[Full protection list from Step 1 — agents must respect these]
```

Then list all tasks following the template format, grouped into Critical Path and Parallelizable Work sections.

Each task entry must include the full agent prompt (same format as Step 3d) in a fenced code block so that dp-cto:execute can extract and use it if the tasks are later imported into beads.

### 4c: Verify the Output

- Read back the generated file
- Confirm every task from Step 2 is present
- Confirm all tasks have acceptance criteria, scope boundaries, and dependency declarations

## Step 5: Terminal Handoff

### If beads molecule was created (Step 3):

Print exactly:

**"Spec complete. Beads epic `{epic-id}` with N tasks ready for `/dp-cto:execute`."**

### If markdown fallback was used (Step 4):

Print exactly:

**"Spec complete. Task breakdown saved to `TASKS-<title>.md` with N tasks. Import into beads with `bd import` or pass to `/dp-cto:execute`."**

Do NOT invoke dp-cto:execute. Do NOT offer to start execution. The user decides when.

<CHAIN>
Spec pipeline complete. The approved spec has been decomposed into implementation tasks.
The next step is /dp-cto:execute (if using beads) or manual import followed by /dp-cto:execute.
The user decides when to run it. Do NOT auto-invoke /dp-cto:execute.
</CHAIN>

## NEVER

1. NEVER write application code — you are decomposing, not implementing
2. NEVER create tasks without acceptance criteria
3. NEVER create tasks without scope boundaries (files the agent must NOT modify)
4. NEVER create tasks that touch 6+ files — split them
5. NEVER skip dependency edges between related tasks
6. NEVER use placeholder file paths — resolve actual paths from the project
7. NEVER skip the protection boundaries extraction — agents need guardrails
8. NEVER auto-invoke dp-cto:execute — handoff only
9. NEVER generate beads molecule AND markdown — use beads if available, markdown as fallback
10. NEVER skip agent prompt generation — every task needs a self-contained prompt

## Red Flags — STOP

| Flag                                                         | Action                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| About to write application code                              | STOP. You are decomposing, not coding.                            |
| Task has no acceptance criteria                              | STOP. Every task needs testable done conditions.                  |
| Task touches 6+ files                                        | STOP. Split into smaller, focused tasks.                          |
| Task has no scope boundaries                                 | STOP. Add protection boundaries from the spec.                    |
| Missing dependency edges between related tasks               | STOP. Add explicit `bd dep add` edges.                            |
| Using placeholder paths like `src/foo/...`                   | STOP. Resolve actual paths from the project.                      |
| About to invoke dp-cto:execute                               | STOP. Handoff only. User decides when to execute.                 |
| Stage is not `challenged`                                    | STOP. Adversarial review must complete first.                     |
| Spec has no Protection Section and you skipped inferring one | STOP. Infer protection boundaries from the codebase.              |
| Agent prompt is not self-contained                           | STOP. Agent must be able to execute with no conversation history. |
