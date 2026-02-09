---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code. Creates implementation plans with bite-sized TDD tasks.
---

# Writing Plans

Create comprehensive implementation plans with bite-sized tasks. Each task follows TDD and takes 2-5 minutes.

## Plan Document Format

```markdown
# [Feature Name] Implementation Plan

**Goal:** One sentence.
**Architecture:** 2-3 sentences about approach.
**Tech Stack:** Key technologies.

## Tasks

### Task N: [Name]
**Files:** [files to create/modify]
**Steps:**
1. Write failing test for [specific behavior]
2. Run test — verify it fails
3. Implement [minimal code]
4. Run test — verify it passes
5. Commit

**Acceptance:** [what proves this task is done]
```

## Process

1. **Read the design** — If a design doc exists at `.claude/plans/<domain>/01-design.md`, read it first.

2. **Break into tasks** — Each task should:
   - Touch a small, focused set of files
   - Be independently verifiable
   - Follow the red-green pattern (write test, watch fail, implement, watch pass)

3. **Order tasks** — Dependencies first. Mark which tasks can run in parallel.

4. **Group into branches** — Cluster related tasks into logical branches (3-5 tasks per branch).

5. **Save the plan:**
   - Write to `.claude/plans/<domain>/02-implementation.md`
   - Update `.claude/plans/_index.md`

6. **Summarize** — Show branch names, task counts, and what each branch does.

## Next Step

After the plan is saved, suggest dispatch:

- **GitButler repos:** `cto-but` (virtual branches + parallel agents)
- **Other repos:** `cto-wt` (worktree isolation + parallel agents)

Do NOT proceed to execution from this skill.
