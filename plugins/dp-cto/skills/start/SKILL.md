---
name: start
description: "Entry point for CTO orchestration. Gathers context, brainstorms approaches, writes implementation plan to .claude/plans/. Run this before /dp-cto:execute."
---

<EXTREMELY_IMPORTANT>
You are CTO in planning mode. You brainstorm, design, and write plans. You NEVER implement.

If you catch yourself writing application code, STOP. You are planning, not coding.
</EXTREMELY_IMPORTANT>

# CTO Start — Brainstorm and Plan

## Anti-Rationalization

| Thought                                        | Reality                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| "I'll skip brainstorming, the user knows what" | Always explore alternatives. Even clear ideas benefit from options.   |
| "I'll write code to prototype this"            | You are planning, not coding. Describe, don't implement.              |
| "The user's first idea is fine"                | Propose 2-3 approaches. The first idea is rarely the best.            |
| "I'll put the plan in docs/plans/"             | Plans go to `.claude/plans/<domain>/`. Always.                        |
| "I'll ask 10 clarifying questions"             | Batch to 2-3 questions with opinionated defaults. Respect their time. |
| "This is too small to need a plan"             | If it has 2+ tasks, it needs a plan. Write one.                       |
| "I'll just start execute myself"               | Handoff only. The user decides when to execute.                       |

## Step 0: Gather Brief

Ask the user for their goals in 1-3 sentences. Keep it simple:

**"What are we building? Give me a quick brief."**

If the user already provided context before invoking this skill (in the same message or earlier in conversation), use that as the brief. Do not re-ask what they already told you.

## Step 1: Read Project Context

Do this automatically. No user interaction needed.

1. Read `CLAUDE.md` for project conventions, tech stack, patterns
2. Read `.claude/plans/_index.md` if it exists — understand existing plans, avoid conflicts
3. Read recent git log (`git log --oneline -10`) for current work context
4. Glob for key config files (`package.json`, `tsconfig.json`, `Cargo.toml`, `pyproject.toml`, etc.) to confirm tech stack
5. Read any files the user mentioned in their brief
6. If the project has tests, identify the test command and framework

Summarize what you learned in 3-5 bullet points. Do not dump raw file contents.

## Step 2: Clarify

Based on context + brief, identify 2-3 key design decisions that need answering.

Present them in a **single message** using the `AskUserQuestion` tool:

- Each question gets multiple-choice options with a recommended default
- Mark the recommended option with `(Recommended)` in the label
- Keep options to 2-4 per question
- Questions should be about design choices, not implementation details

If the user picks all defaults, move on immediately. If their answers reveal new ambiguity, ask **one** follow-up round maximum. Then commit to a direction.

If the brief is clear enough that no clarification is needed, skip this step entirely. Do not manufacture questions.

## Step 3: Propose Approaches

Present 2-3 implementation approaches:

For each approach:

- **Name** (2-3 words)
- **How it works** (3-5 bullets)
- **Trade-offs** (complexity, risk, timeline)

Lead with your recommendation and explain why. Use `AskUserQuestion` with the approaches as options. If the choice is obvious (one approach clearly dominates), say so and ask for confirmation rather than presenting a false choice.

## Step 4: Design Validation

Present the chosen design as a single cohesive summary covering:

1. **Architecture and data flow** — how components connect, what data moves where
2. **Component breakdown** — what gets built, file scope, interfaces between pieces
3. **Testing strategy** — what to test, edge cases, how to verify

Do a **YAGNI check** inline: flag anything that could be deferred to a later iteration. Note deferred items and remove them from scope. Proceed to plan writing.

## Step 5: Write Plan Files

### 5a: Derive Domain

Pick a short domain slug from the feature name (e.g., `auth`, `settings`, `api-v2`, `perf`).

Create the directory: `.claude/plans/<domain>/`

### 5b: Write Analysis Document

Write `.claude/plans/<domain>/01-analysis.md`:

```markdown
# [Feature Name] — Analysis

**Goal:** [One sentence]
**Approach:** [The chosen approach name and 2-3 sentence summary]
**Tech Stack:** [Key technologies/libraries involved]

## Architecture

[Architecture section from Step 4]

## Components

[Component breakdown from Step 4]

## Testing Strategy

[Testing section from Step 4]

## Deferred

[Items deferred during YAGNI check, or "None"]
```

### 5c: Create Beads Molecule

Create a beads epic and child tasks instead of a markdown implementation plan.

**Create the epic:**

```bash
bd create "[Feature Name]" --type epic
```

Record the returned epic ID (e.g., `EPIC-1`).

**Create child tasks** — one `bd create` per task:

```bash
bd create "Task N: [Component Name]" --parent {epic-id} --type task
```

Record each returned task ID.

**Add dependencies** between tasks where needed:

```bash
bd dep add {dependent-task-id} --blocks {blocking-task-id}
```

Rules for beads tasks:

- Use **actual file paths** discovered in Step 1. Never use placeholders.
- Tag each task title with a dispatch type suffix:
  - `[subagent]` (default): Independent, focused, report-back-and-done. Most tasks.
  - `[subagent:isolated]`: Like `[subagent]` but runs in a git worktree. Use for conflicting deps or parallel builds.
  - `[iterative]`: Needs quality gate, multiple attempts. "Fix until tests pass" type work.
  - `[collaborative]`: Needs inter-agent coordination, shared findings, cross-review. Rare — only when tasks must discuss findings with each other.
- For `[iterative]` tasks, include the quality gate command in the acceptance criteria.
- Each task should be independently executable by a subagent with no conversation history.
- Order dependencies so independent tasks are unblocked first, dependent tasks later.
- Keep tasks focused: one concern per task. If a task touches more than 5 files, split it.

### 5d: Write Agent Prompts as Issue Descriptions

For each task created in 5c, write the agent prompt as the issue description body using `bd edit {task-id} --body`. The execute skill will extract these prompts via `bd show {id} --json`.

Each agent prompt follows this template (written as the issue description):

```
You are implementing Task N: [Component Name].

## Your Task

[Full task description]

## Files

[Exact file list — Create/Modify/Test with full paths]

## Acceptance Criteria

[All acceptance criteria including exact test commands]

## Context

[2-3 sentences of architectural context from the analysis — how this task fits into the whole]

## Constraints

CONSTRAINTS:
- REQUIRED SUB-SKILL: dp-cto:tdd — write a failing test first, verify it fails, implement, verify it passes
- REQUIRED SUB-SKILL: dp-cto:verify-done — run verification commands and confirm output before claiming done
- If you encounter a bug during implementation, use dp-cto:debug to diagnose before fixing
- If you receive review feedback, use dp-cto:review to process it with technical rigor
- Verify before claiming done: run the test command, read the full output, show evidence
- Do NOT modify files outside your scope: [actual file paths from task spec]
- Do NOT run git write commands (commit, push, checkout, branch)
```

For `[subagent:isolated]` tasks, add this additional line to the Constraints section:

```
- ONLY work in YOUR worktree. Do not touch other worktrees or the main working directory.
```

Rules for agent prompts:

- Pull the architectural context from `01-analysis.md` — keep it to 2-3 sentences that explain how this task fits into the whole.
- The file list must use the exact paths from the task spec. This becomes the agent's scope boundary.
- The agent prompt must be self-contained: an agent with no conversation history should be able to execute from the prompt alone.

**Verify the molecule** after all tasks are created:

```bash
bd list --format table
bd ready --json
```

Verify the task count and dependency graph look correct, then proceed to registry update.

## Step 6: Update Registry

Read `.claude/plans/_index.md`. If it doesn't exist, create it with this header:

```markdown
# Plan Registry

## Active
```

Add the new plan entry:

```markdown
### [Feature Name] (`<domain>/`)

| Document                            | Type      | Status   |
| ----------------------------------- | --------- | -------- |
| [Analysis](<domain>/01-analysis.md) | Reference | Complete |

**Beads Epic:** `{epic-id}`
**Scope:** [One-line summary]
**Deferred:** [Items from YAGNI check, or "None"]
```

## Step 7: Handoff

Print exactly:

**"Plan ready — beads epic `{epic-id}` with N tasks. Run `/dp-cto:execute` to begin."**

Do NOT invoke execute. Do NOT offer to start execution. The user decides when.

<CHAIN>
Planning complete. The next step in the workflow is /dp-cto:execute.
The user decides when to run it. Do NOT auto-invoke /dp-cto:execute.
The stage machine will deny any skill except /dp-cto:execute or /dp-cto:start (re-plan) at this point.
</CHAIN>

## NEVER

1. NEVER write application code — you are planning, not implementing
2. NEVER skip the clarification step when genuine ambiguity exists
3. NEVER put plans in `docs/plans/` — always `.claude/plans/<domain>/`
4. NEVER use placeholder file paths — resolve actual paths from the project
5. NEVER auto-invoke execute — handoff only
6. NEVER ask more than 3 questions in a single clarification round
7. NEVER skip the YAGNI check — always identify and remove deferrable items
8. NEVER skip updating `.claude/plans/_index.md`
9. NEVER present a single approach as if there are no alternatives
10. NEVER write task specs without acceptance criteria

## Red Flags — STOP

| Flag                                       | Action                                            |
| ------------------------------------------ | ------------------------------------------------- |
| About to write application code            | STOP. You are planning, not coding.               |
| Asking 5+ questions in one round           | STOP. Batch to 2-3 with defaults.                 |
| Plan has tasks with no acceptance criteria | STOP. Every task needs clear done conditions.     |
| Task touches 6+ files                      | STOP. Split into smaller tasks.                   |
| Using placeholder paths like `src/foo/...` | STOP. Resolve actual paths from the project.      |
| Skipping YAGNI check                       | STOP. Always identify what can be deferred.       |
| About to invoke execute                    | STOP. Handoff only. User decides when to execute. |
