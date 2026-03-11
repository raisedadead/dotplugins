# Task Breakdown Template

Use this format when decomposing the approved RFC/PRD into implementation tasks for the terminal handoff. Tasks should be sized for a single developer or Claude Code agent session (2-5 hours of work each). Dispatch type tags enable dp-cto:execute compatibility.

---

```markdown
## Implementation Task Breakdown

### Critical Path (must be sequential)

#### Task 1: [Title] `[subagent]` `S`

- **Description:** [What needs to be done — specific enough to implement without follow-up questions]
- **RFC/PRD Section:** [Which section of the RFC or PRD user story this implements]
- **Acceptance Criteria:**
  - [ ] [Testable criterion 1]
  - [ ] [Testable criterion 2]
- **Dependencies:** None
- **Complexity:** S
- **Dispatch:** `[subagent]`
- **Files/Areas:** [Specific files, modules, or areas to modify]

#### Task 2: [Title] `[subagent]` `M`

- **Description:** [What needs to be done]
- **RFC/PRD Section:** [Reference]
- **Acceptance Criteria:**
  - [ ] [Testable criterion 1]
  - [ ] [Testable criterion 2]
- **Dependencies:** Task 1
- **Complexity:** M
- **Dispatch:** `[subagent]`
- **Files/Areas:** [Files]

### Parallelizable Work (can happen concurrently)

#### Task 3: [Title] `[subagent]` `S`

- **Description:** [What needs to be done]
- **RFC/PRD Section:** [Reference]
- **Acceptance Criteria:**
  - [ ] [Testable criterion 1]
- **Dependencies:** Task 1
- **Complexity:** S
- **Dispatch:** `[subagent]`
- **Files/Areas:** [Files]

#### Task 4: [Title] `[iterative]` `M`

- **Description:** [What needs to be done — iterative tasks need quality gates between attempts]
- **RFC/PRD Section:** [Reference]
- **Acceptance Criteria:**
  - [ ] [Testable criterion 1]
  - [ ] [Testable criterion 2]
- **Dependencies:** Task 1
- **Complexity:** M
- **Dispatch:** `[iterative]`
- **Quality Gate:** [Command to run between iterations — e.g., `pnpm test`, `pnpm run lint`]
- **Files/Areas:** [Files]

#### Task 5: [Title] `[collaborative]` `L`

- **Description:** [What needs to be done — collaborative tasks require inter-agent coordination]
- **RFC/PRD Section:** [Reference]
- **Acceptance Criteria:**
  - [ ] [Testable criterion 1]
  - [ ] [Testable criterion 2]
  - [ ] [Testable criterion 3]
- **Dependencies:** Task 2, Task 3
- **Complexity:** L
- **Dispatch:** `[collaborative]`
- **Collaborators:** [Which agents/roles need to coordinate]
- **Files/Areas:** [Files]

### Deferred / Future Work

- [Item] — Deferred because [reason]. Revisit after [milestone].

### Open Decisions

| Decision   | Owner | Due By | Blocks        |
| ---------- | ----- | ------ | ------------- |
| [Decision] | [Who] | [When] | [Which tasks] |
```

## Sizing Guide

- **S (Small):** Single file change, straightforward implementation, <2 hours
- **M (Medium):** Multiple files, some design decisions, 2-4 hours
- **L (Large):** Cross-cutting change, new subsystem, needs sub-tasks, 4-8 hours. Consider breaking L tasks into M tasks.

## Dispatch Type Tags

Tags determine how dp-cto:execute dispatches each task:

- **`[subagent]`** — Default. Spawns a single background agent. Use for self-contained tasks with clear inputs/outputs and no iterative refinement needed. Most tasks should be `[subagent]`.
- **`[subagent:isolated]`** — Like `[subagent]` but runs in a git worktree for filesystem isolation. Use when the task modifies files that other concurrent tasks also touch.
- **`[iterative]`** — Spawns sequential agent iterations with quality gate checks between rounds. Use for tasks that need iterative refinement: complex refactors, performance optimization, test-driven implementation where multiple passes are expected.
- **`[collaborative]`** — Spawns multiple agents that communicate via messaging. Use sparingly — only when tasks genuinely require real-time coordination between agents (e.g., API producer + consumer built simultaneously). Most "collaborative-sounding" tasks are better split into sequential `[subagent]` tasks with dependency edges.

### Dispatch Selection Heuristic

1. Can the task be done in one pass with clear acceptance criteria? -> `[subagent]`
2. Does the task touch files other concurrent tasks also modify? -> `[subagent:isolated]`
3. Does the task need multiple refinement cycles with validation between? -> `[iterative]`
4. Do two tasks genuinely need to exchange information during execution? -> `[collaborative]`
5. When in doubt, use `[subagent]`. It covers 80%+ of tasks.

## Rules

- Every task must trace to an RFC section or PRD user story
- No task should require reading another task to understand what to do
- Acceptance criteria must be testable — "it works" is not a criterion
- If a task is L, it probably needs to be broken down further
- Include setup/infra tasks that are easy to forget: CI config, env variables, DB migrations, monitoring dashboards
- Every task must have a dispatch type tag — the default is `[subagent]`
- `[iterative]` tasks must specify a **Quality Gate** command
- `[collaborative]` tasks must specify **Collaborators**
- Critical path tasks should be `[subagent]` (sequential dispatch handles ordering via dependency edges)
