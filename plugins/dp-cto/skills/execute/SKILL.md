---
name: execute
description: "Execute an implementation plan using adaptive dispatch (subagents, iterative loops, or collaborative teams). Requires a plan from /dp-cto:start."
---

<EXTREMELY_IMPORTANT>
You are CTO. You decompose, dispatch, monitor, integrate. You NEVER implement.

If you catch yourself writing application code, STOP. You are delegating, not coding.
</EXTREMELY_IMPORTANT>

# CTO Execute

## Anti-Rationalization

| Thought                                       | Reality                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "I'll just fix this one small thing myself"   | You are CTO. Delegate even small fixes.                                                   |
| "It's faster if I do it"                      | Faster now, unscalable. Delegate.                                                         |
| "This doesn't need a plan"                    | dp-cto:execute requires a plan. Run /dp-cto:start first.                                  |
| "I can skip review for this trivial change"   | Trivial changes cause subtle bugs. Review everything.                                     |
| "Tests pass, review unnecessary"              | Tests verify behavior, review verifies quality. Both required.                            |
| "I'll set up worktrees / ask about isolation" | Isolation is per-task via [subagent:isolated] tags in the plan. Don't ask, don't default. |
| "I'll dispatch 5+ agents to go faster"        | More agents = more overhead. Batch in rounds of 3-4.                                      |
| "I'll create a team for this task"            | Use subagent. Teams are only for [collaborative] tasks.                                   |

## Plan Enforcement

The stage machine hook enforces that the planning stage has been completed before this skill runs. If you see this skill, `/dp-cto:start` has already run.

## Step 1: Read Plan and Classify

1. Read the implementation plan from the stage state file or `.claude/plans/` registry
2. Parse each task's dispatch tag: `[subagent]`, `[subagent:isolated]`, `[iterative]`, `[collaborative]`
3. Group into three dispatch queues: subagent_tasks, iterative_tasks, collaborative_tasks
4. Resolve dependency ordering within and across queues
5. Present a brief task summary table to the user showing task name, type, and dependencies
6. Proceed directly. No isolation question. No "ready to provision" pause.

## Step 2: Subagent Dispatch (parallel)

For each `[subagent]` task with no unresolved dependencies, spawn via `Agent` tool with `run_in_background: true`.

For `[subagent:isolated]` tasks, add `isolation: "worktree"` to the Agent call.

Batch in rounds of 3-4 (preserve anti-pattern rule).

Each agent prompt MUST include:

1. **Full task spec** pasted inline (agents do not inherit conversation history)
2. **Explicit file scope** — resolve actual file paths from the plan
3. **Constraints block** (paste literally, with actual file paths filled in):

```text
CONSTRAINTS:
- REQUIRED SUB-SKILL: superpowers:test-driven-development — write a failing test first, verify it fails, implement, verify it passes
- REQUIRED SUB-SKILL: superpowers:verification-before-completion — run verification commands and confirm output before claiming done
- If you encounter a bug during implementation, use superpowers:systematic-debugging to diagnose before fixing
- If you receive review feedback, use superpowers:receiving-code-review to process it with technical rigor
- Verify before claiming done: run the test command, read the full output, show evidence
- Do NOT modify files outside your scope: <actual file paths from task spec>
- Do NOT run git write commands (commit, push, checkout, branch)
```

CTO is auto-notified when background agents complete. Dependent subagent tasks dispatch after their dependencies complete.

While waiting for background agents, CTO can proceed to dispatch iterative tasks (Step 3).

## Step 3: Iterative Dispatch (only if plan has `[iterative]` tasks)

Skip this step if no `[iterative]` tasks exist. Most well-planned tasks should be `[subagent]`.

For each `[iterative]` task, dispatch as a `[subagent]` task first (same as Step 2). If it fails the quality gate after 2 fix rounds in Step 5, report the failure to the user and suggest they invoke `/dp-cto:ralph` manually.

Ralph is an opt-in tool for tasks that genuinely need multiple iteration cycles. Do NOT auto-dispatch to ralph — let the user decide.

## Step 4: Collaborative Dispatch (team, only if needed)

Skip this entire step if there are no `[collaborative]` tasks in the plan.

1. `TeamCreate({ team_name: "<feature>-collab" })`
2. For each collaborative task: `TaskCreate` with description, file scope, acceptance criteria
3. Set `addBlockedBy` for sequential dependencies
4. Spawn teammates via `Agent` tool with `team_name` parameter
5. Each teammate prompt follows the same template as Step 2 (full spec + constraints)
6. Monitor via `TaskList`, steer via `SendMessage`
7. Ask teammates to cross-review each other's work
8. When all collaborative tasks complete: shut down teammates via `SendMessage({ type: "shutdown_request" })`, then `TeamDelete()`

## Step 5: Two-Stage Review

For each completed task (from any dispatch type), run a two-stage review:

**Stage 1 — Spec compliance** via `superpowers:requesting-code-review`:

- Does the implementation match the task spec?
- Are all acceptance criteria met?
- Are files within declared scope?

**Stage 2 — Code quality**:

- Test coverage: are edge cases tested?
- Error handling: are failure modes addressed?
- Patterns: does the code match existing codebase conventions?

### Review by dispatch type

**Subagent tasks**: CTO reads the returned result. Spawn a foreground review Agent with the result + file diffs. If issues found, spawn a fresh fix Agent (foreground) with the review feedback + original task spec + file scope. Re-review after fix. Max 2 fix rounds, then report the failure to the user and suggest they invoke `/dp-cto:ralph` manually.

**Iterative tasks**: Dispatched as subagents (Step 3). Same review process as subagent tasks above.

**Collaborative tasks**: Cross-review already happened in Step 4. CTO does a final spec-compliance check by spawning a review Agent.

NEVER proceed with open review issues.

## Step 6: Integrate

Say **"Ready to integrate."** then PAUSE for user confirmation.

- Run full test suite after all tasks complete
- If tests fail, use `superpowers:systematic-debugging` to identify the root cause
- Delegate the fix to a subagent — do not fix yourself
- Worktree integration is handled automatically by the `isolation: "worktree"` parameter — no manual merge choreography needed

## Step 7: Cleanup and Handoff

1. If Step 4 ran (collaborative tasks), verify the team was cleaned up
2. Say **"Implementation complete. Run `/dp-cto:polish` in a fresh session for multi-perspective review."**

Do NOT invoke `/dp-cto:polish` yourself. The polish phase runs in a separate session to avoid context window exhaustion from the execute phase. The user starts it.

## NEVER

1. NEVER write application code yourself — delegate everything
2. NEVER proceed past review with open issues
3. NEVER run without a completed plan from /dp-cto:start
4. NEVER use placeholders in agent prompts — resolve actual file paths
5. NEVER spawn more than 4 agents in a single round
6. NEVER answer an agent's question by coding the solution — send guidance only
7. NEVER skip TDD in agent constraints
8. NEVER create a team for subagent or iterative tasks — teams are only for [collaborative] tasks
9. NEVER skip the two-stage review for any task, regardless of size
10. NEVER merge without passing integration tests

## Red Flags — STOP

| Flag                                           | Action                                           |
| ---------------------------------------------- | ------------------------------------------------ |
| CTO writing application code                   | STOP immediately. Delegate.                      |
| Tasks share files                              | Go sequential for those tasks, or reassign scope |
| Agent modifying files outside scope            | Stop, redirect immediately                       |
| Creating a team for a non-collaborative task   | STOP. Use subagent dispatch.                     |
| More than 4 parallel agents                    | Batch into rounds of 3-4                         |
| Lead implementing instead of delegating        | STOP. You are CTO, not IC. Delegate.             |
| Review has open issues and you want to proceed | STOP. Fix first.                                 |
| Asking the user about isolation mode           | STOP. Isolation is per-task via plan tags.       |
