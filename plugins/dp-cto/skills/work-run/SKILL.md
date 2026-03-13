---
name: work-run
description: "Execute an implementation plan using adaptive dispatch (primarily subagents; iterative loops and collaborative teams where needed). Requires a plan from /dp-cto:work-plan."
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
| "This doesn't need a plan"                    | dp-cto:work-run requires a plan. Run /dp-cto:work-plan first.                             |
| "I can skip review for this trivial change"   | Trivial changes cause subtle bugs. Review everything.                                     |
| "Tests pass, review unnecessary"              | Tests verify behavior, review verifies quality. Both required.                            |
| "I'll set up worktrees / ask about isolation" | Isolation is per-task via [subagent:isolated] tags in the plan. Don't ask, don't default. |
| "I'll dispatch 5+ agents to go faster"        | More agents = more overhead. Batch in rounds of 3-4.                                      |
| "I'll create a team for this task"            | Use subagent. Teams are only for [collaborative] tasks.                                   |

## Plan Enforcement

The stage machine hook enforces that the planning stage has been completed before this skill runs. State is tracked on the beads epic (via `dp-cto=planned` label). If you see this skill, `/dp-cto:work-plan` has already run and the active epic is in the local cache.

## Step 1: Read Beads Molecule and Classify

1. Query the executable frontier — tasks with no open blockers:

```bash
bd ready --json
```

State is tracked on the epic. If no active epic is found in the cache, check `bd query` for suspended or planned epics (e.g., `bd query "label=dp-cto:planned" --json`).

2. For the full task list and dependency graph:

```bash
bd list --parent {epic-id} --json
```

3. Parse each task's dispatch tag from the title suffix: `[subagent]`, `[subagent:isolated]`, `[iterative]`, `[collaborative]`
4. Group into three dispatch queues: subagent_tasks, iterative_tasks, collaborative_tasks
5. Present a brief task summary table to the user showing task name, type, and dependencies
6. Proceed directly. No isolation question. No "ready to provision" pause.

Beads handles dependency resolution — `bd ready` only returns tasks whose blockers are all closed. No manual dependency tracking needed.

## Step 2: Subagent Dispatch (parallel)

For each `[subagent]` task returned by `bd ready`:

1. Mark the task in progress:

```bash
bd update {task-id} --status in-progress
```

2. Extract the agent prompt from the issue description:

```bash
bd show {task-id} --json
```

The `description` field contains the complete agent prompt written by `/dp-cto:work-plan`. For the first round, pass it verbatim to the `Agent` tool with `run_in_background: true`. For subsequent rounds, apply the file-change injection from Step 2.5 before dispatching — if upstream tasks modified files in this task's scope, prepend the `## Upstream Changes` section; otherwise pass verbatim.

3. **Track the dispatch** — record when the agent is spawned:

```bash
bd comments add {task-id} "dispatch: role=implementer type=subagent started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

4. **Label the task as dispatched** — makes agent state queryable via `bd query`:

```bash
bd label add {task-id} "agent:dispatched"
```

For `[subagent:isolated]` tasks, use `type=subagent:isolated` and add `isolation: "worktree"` to the Agent call.

5. **Capture the round baseline** before dispatching each round — this anchors file-change detection for Step 2.5:

```bash
ROUND_BASELINE=$(git rev-parse HEAD)
```

6. Batch in rounds of 3-4 (preserve anti-pattern rule).

The agent prompt is pre-built in the beads issue description. Do NOT modify it except for the `## Upstream Changes` injection described in Step 2.5 — when upstream file overlap is detected, prepend that section; otherwise pass verbatim.

CTO is auto-notified when background agents complete. After each agent completes, **track the outcome**, **update the label**, and mark it done:

On success:

```bash
bd comments add {task-id} "outcome: result=success iterations=1"
bd label remove {task-id} "agent:dispatched" && bd label add {task-id} "agent:done"
bd close {task-id}
```

**Collect modified files** — extract the "Files Modified" list from the agent's result text. Store a map for this round: `{task-id} -> [file1, file2, ...]`. If the agent result does not include a clear file list, run `git diff --name-only $ROUND_BASELINE` scoped to the task's declared file scope to infer what changed. Accumulate across rounds (append, do not overwrite).

On failure:

```bash
bd comments add {task-id} "outcome: result=failure iterations=1"
bd label remove {task-id} "agent:dispatched" && bd label add {task-id} "agent:failed"
```

Always remove the previous label before adding the new one to prevent label stacking.

After all agents in the current round complete, proceed to Step 2.5 (Round Checkpoint) before dispatching the next round.

While waiting for background agents, CTO can proceed to dispatch iterative tasks (Step 3).

## Step 2.5: Round Checkpoint

After each dispatch round completes (all agents in the round have returned), emit a progress summary and evaluate whether to continue.

### Progress Summary

Query the full task list to compute progress:

```bash
bd list --parent {epic-id} --json
```

Count tasks by status and labels, then emit:

```
{done}/{total} tasks done, {running} running, {ready} ready. {failed} failed.
```

Where:

- `{done}` = tasks with status `closed`
- `{total}` = all child tasks of the epic
- `{running}` = tasks with label `agent:dispatched`
- `{ready}` = tasks returned by `bd ready` (unblocked, not yet dispatched)
- `{failed}` = tasks with label `agent:failed`

### Circuit Breaker

If >50% of agents in the just-completed dispatch round failed (have the `agent:failed` label), pause execution and ask the user:

```
AskUserQuestion: "50%+ of this round failed. Options: Continue to next round / Re-dispatch failed tasks / Stop execution."
```

Act on the user's choice:

- **Continue to next round**: Re-query `bd ready --json` and dispatch the next batch normally. Failed tasks remain with `agent:failed` label.
- **Re-dispatch failed tasks**: Remove the `agent:failed` label from each failed task, set them back to `in-progress`, re-extract their prompts, and re-dispatch as a fresh round. Follow the same dispatch protocol (label as `agent:dispatched`, track via comments).
- **Stop execution**: Halt work-run. The stage remains `executing` — the user can re-invoke `/dp-cto:work-run` to resume, or `/dp-cto:work-park` to suspend.

If <=50% failed, proceed to the next `bd ready` round automatically (no pause).

### File-Change Injection for Downstream Tasks

Before dispatching the next round, check whether any just-completed tasks modified files that overlap with downstream tasks' declared scope. This prevents downstream agents from blindly overwriting upstream work.

1. **Collect completed-task file maps** — use the modified-files map accumulated in Step 2 (and Steps 3-4 if applicable). Each entry is `{task-id} -> [file1, file2, ...]` along with the task title from `bd show {task-id} --json`.

2. **Query next-round tasks** — run `bd ready --json` to get the tasks about to be dispatched.

3. **Extract downstream file scope** — for each next-round task, extract its file scope from the `## Files` section of the issue description (`bd show {task-id} --json`, parse the `description` field for lines under `## Files`). Collect these as a set of file paths.

4. **Detect overlap** — for each next-round task, compare its file scope set against ALL completed-task file maps (across all prior rounds). If any file appears in both sets, that file has overlap.

5. **Inject context** — if overlap exists for a task, prepend an `## Upstream Changes` section to the agent prompt BEFORE dispatching. Format:

```
## Upstream Changes

The following files in your scope were modified by upstream tasks. Review these changes before starting:

- `{file-path}` — modified by Task {task-id}: {task-title}
- `{file-path}` — modified by Task {task-id}: {task-title}

Run `git diff {ROUND_BASELINE} -- {file-path}` to see what changed (where `{ROUND_BASELINE}` is the SHA captured before the round that modified this file).
```

Place this section at the very top of the prompt, before the original issue description content.

6. **No overlap = no injection** — if a downstream task has no file overlap with any completed task, pass the prompt verbatim (unchanged behavior).

Then re-query `bd ready --json` to discover newly unblocked tasks and dispatch the next round.

## Step 3: Iterative Dispatch (only if plan has `[iterative]` tasks)

Skip this step if no `[iterative]` tasks exist. Most well-planned tasks should be `[subagent]`.

For each `[iterative]` task:

1. Mark in progress: `bd update {task-id} --status in-progress`
2. Extract the agent prompt from `bd show {task-id} --json` (the `description` field). Apply file-change injection from Step 2.5 if upstream overlap exists; otherwise pass verbatim.
3. **Track the dispatch** — record when the agent is spawned:

```bash
bd comments add {task-id} "dispatch: role=implementer type=iterative started=$(date -u +%Y-%m-%dT%H:%M:%SZ) max_iterations={N}"
```

4. **Label the task as dispatched** — same protocol as Step 2:

```bash
bd label add {task-id} "agent:dispatched"
```

5. Dispatch as a `[subagent]` task first (same as Step 2)

After completion, **track the outcome**, **collect modified files** (same as Step 2 — extract from agent result or infer via `git diff`), and **update the label**:

On success:

```bash
bd comments add {task-id} "outcome: result=success iterations={N}"
bd label remove {task-id} "agent:dispatched" && bd label add {task-id} "agent:done"
bd close {task-id}
```

On failure:

```bash
bd comments add {task-id} "outcome: result=failure iterations={N}"
bd label remove {task-id} "agent:dispatched" && bd label add {task-id} "agent:failed"
```

Always remove the previous label before adding the new one to prevent label stacking.

If it fails the quality gate after 2 fix rounds in Step 5, mark it done with `bd close {task-id}`, report the failure to the user, and suggest they invoke `/dp-cto:work-run-loop` manually.

After all iterative tasks in the current round complete, proceed to Step 2.5 (Round Checkpoint) before continuing.

Ralph is an opt-in tool for tasks that genuinely need multiple iteration cycles. Do NOT auto-dispatch to work-run-loop — let the user decide.

## Step 4: Collaborative Dispatch (team, only if needed)

Skip this entire step if there are no `[collaborative]` tasks in the plan.

1. `TeamCreate({ team_name: "<feature>-collab" })`
2. For each collaborative task: `TaskCreate` with description, file scope, acceptance criteria
3. Set `addBlockedBy` for sequential dependencies
4. Spawn teammates via `Agent` tool with `team_name` parameter
5. Extract the agent prompt from `bd show {task-id} --json` (the `description` field) for each teammate. Apply file-change injection from Step 2.5 if upstream overlap exists; otherwise pass verbatim.
6. **Track the dispatch and label** — for each teammate dispatched:

```bash
bd comments add {task-id} "dispatch: role=implementer type=collaborative started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
bd label add {task-id} "agent:dispatched"
```

7. Monitor via `TaskList`, steer via `SendMessage`
8. Ask teammates to cross-review each other's work
9. When all collaborative tasks complete: shut down teammates via `SendMessage({ type: "shutdown_request" })`, then `TeamDelete()`
10. **Update labels, collect modified files, and mark done** — for each completed collaborative task, collect modified files (same as Step 2 — extract from agent result or infer via `git diff`):

On success:

```bash
bd comments add {task-id} "outcome: result=success"
bd label remove {task-id} "agent:dispatched" && bd label add {task-id} "agent:done"
bd close {task-id}
```

On failure:

```bash
bd comments add {task-id} "outcome: result=failure"
bd label remove {task-id} "agent:dispatched" && bd label add {task-id} "agent:failed"
```

Always remove the previous label before adding the new one to prevent label stacking.

After all collaborative tasks complete, proceed to Step 2.5 (Round Checkpoint) before continuing to Step 5.

## Step 5: Two-Stage Review

For each completed task (from any dispatch type), run a two-stage review:

**Stage 1 — Spec compliance** via `dp-cto:quality-code-review`:

- Does the implementation match the task spec?
- Are all acceptance criteria met?
- Are files within declared scope?

**Stage 2 — Code quality**:

- Test coverage: are edge cases tested?
- Error handling: are failure modes addressed?
- Patterns: does the code match existing codebase conventions?

### Review by dispatch type

**Subagent tasks**: CTO reads the returned result. **Track the review dispatch**:

```bash
bd comments add {task-id} "dispatch: role=reviewer type=subagent started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Spawn a foreground review Agent with the result + file diffs. After the review completes, **track the review outcome**:

```bash
bd comments add {task-id} "outcome: result={pass|fail} issues_found={N}"
```

If issues found, spawn a fresh fix Agent (foreground) with the review feedback + original task spec + file scope. Re-review after fix. Max 2 fix rounds, then report the failure to the user and suggest they invoke `/dp-cto:work-run-loop` manually.

**Iterative tasks**: Dispatched as subagents (Step 3). Same review process as subagent tasks above.

**Collaborative tasks**: Cross-review already happened in Step 4. CTO does a final spec-compliance check by spawning a review Agent.

NEVER proceed with open review issues.

## Step 6: Integrate

- Run full test suite after all tasks complete
- If tests fail, use `dp-cto:quality-deep-debug` to identify the root cause
- Delegate the fix to a subagent — do not fix yourself
- Worktree integration is handled automatically by the `isolation: "worktree"` parameter — no manual merge choreography needed

## Step 7: Cleanup and Handoff

1. If Step 4 ran (collaborative tasks), verify the team was cleaned up
2. The hook sets `dp-cto=polishing` on the epic automatically. The user invokes `/dp-cto:work-polish` to run multi-perspective review.

## NEVER

1. NEVER write application code yourself — delegate everything
2. NEVER proceed past review with open issues
3. NEVER run without a completed plan from /dp-cto:work-plan
4. NEVER use placeholders in agent prompts — resolve actual file paths
5. NEVER spawn more than 4 agents in a single round
6. NEVER answer an agent's question by coding the solution — send guidance only
7. NEVER skip TDD in agent constraints
8. NEVER create a team for subagent or iterative tasks — teams are only for [collaborative] tasks
9. NEVER skip the two-stage review for any task, regardless of size
10. NEVER merge without passing integration tests

## Red Flags — STOP

| Flag                                           | Action                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| CTO writing application code                   | STOP immediately. Delegate.                                                                                           |
| Tasks in same round share files                | Go sequential for those tasks, or reassign scope. Cross-round overlap is handled by file-change injection (Step 2.5). |
| Agent modifying files outside scope            | Stop, redirect immediately                                                                                            |
| Creating a team for a non-collaborative task   | STOP. Use subagent dispatch.                                                                                          |
| More than 4 parallel agents                    | Batch into rounds of 3-4                                                                                              |
| Lead implementing instead of delegating        | STOP. You are CTO, not IC. Delegate.                                                                                  |
| Review has open issues and you want to proceed | STOP. Fix first.                                                                                                      |
| Asking the user about isolation mode           | STOP. Isolation is per-task via plan tags.                                                                            |
