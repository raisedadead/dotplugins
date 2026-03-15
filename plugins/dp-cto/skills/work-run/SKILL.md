---
name: work-run
description: "Execute an implementation plan using adaptive dispatch (primarily subagents; iterative loops and Agent Teams for collaborative work where needed). Requires a plan from /dp-cto:work-plan."
---

<EXTREMELY_IMPORTANT>
You are CTO. You decompose, dispatch, monitor, integrate. You NEVER implement.

If you catch yourself writing application code, STOP. You are delegating, not coding.
</EXTREMELY_IMPORTANT>

# CTO Execute

## Anti-Rationalization

| Thought                                                         | Reality                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "I'll just fix this one small thing myself"                     | You are CTO. Delegate even small fixes.                                                              |
| "It's faster if I do it"                                        | Faster now, unscalable. Delegate.                                                                    |
| "This doesn't need a plan"                                      | dp-cto:work-run requires a plan. Run /dp-cto:work-plan first.                                        |
| "I can skip review for this trivial change"                     | Trivial changes cause subtle bugs. Review everything.                                                |
| "Tests pass, review unnecessary"                                | Tests verify behavior, review verifies quality. Both required.                                       |
| "I'll set up worktrees / ask about isolation"                   | Isolation is per-task via [subagent:isolated] tags in the plan. Don't ask, don't default.            |
| "I'll dispatch 5+ agents to go faster"                          | More agents = more overhead. Batch in rounds of 3-4.                                                 |
| "I'll create a team for this task"                              | Use subagent. Teams are only for [collaborative] tasks.                                              |
| "The agent said it passed, no need to validate"                 | Agents hallucinate completion. Always validate independently via the validator agent.                |
| "Validation is overhead, tests already passed"                  | Tests verify behavior. Validation verifies the agent did not lie about running tests. Both required. |
| "I will review the code myself instead of spawning a validator" | You are CTO. Delegate validation. You never review code directly.                                    |
| "This task is too small to need a receipt"                      | Every task needs a receipt. Receipts are how the system tracks what actually happened.               |

## Plan Enforcement

The stage machine hook enforces that the planning stage has been completed before this skill runs. State is tracked on the beads epic (via `dp-cto=planned` label). If you see this skill, `/dp-cto:work-plan` has already run and the active epic is in the local cache.

All bd commands use `-q` (quiet) to suppress human-readable output. Only JSON output and exit codes are needed.

## Step 1: Read Beads Molecule and Classify

1. Query the executable frontier — tasks with no open blockers:

```bash
bd ready -q --json
```

State is tracked on the epic. If no active epic is found in the cache, check `bd query -q` for suspended or planned epics (e.g., `bd query -q "label=dp-cto:planned" --json`).

2. For the full task list and dependency graph:

```bash
bd list -q --parent {epic-id} --json
```

3. Parse each task's dispatch tag from the title suffix: `[subagent]`, `[subagent:isolated]`, `[iterative]`, `[collaborative]`
4. Group into three dispatch queues: subagent_tasks, iterative_tasks, collaborative_tasks
5. Present a brief task summary table to the user showing task name, type, and dependencies
6. Proceed directly. No isolation question. No "ready to provision" pause.

Beads handles dependency resolution — `bd ready -q` only returns tasks whose blockers are all closed. No manual dependency tracking needed.

## Step 1.5: Mirror Tasks to Native Task List

Native Tasks mirror beads task state for cross-session sync and Ctrl+T visibility. Tasks API is a sync mechanism — the structured text output (see Progress Output Format) is the primary progress indicator in the main chat. If TaskCreate fails (e.g., non-TTY), skip silently.

Before dispatching, create native Tasks for Ctrl+T visibility:

1. For each task returned by `bd ready -q --json`, create a native Task:

   ```
   TaskCreate(subject: "{beads-task-title}", description: "Beads: {beads-task-id}. {first-line-of-description}", activeForm: "Implementing {short-task-name}")
   ```

2. Record the mapping: `{beads-task-id} -> {native-task-id}`

3. When a beads task moves to in-progress, update the native Task:

   ```
   TaskUpdate(taskId: "{native-task-id}", status: "in_progress")
   ```

4. When a beads task completes or fails, update the native Task:

   ```
   TaskUpdate(taskId: "{native-task-id}", status: "completed")
   ```

5. For subsequent rounds (after Step 2.5), create native Tasks for newly unblocked beads tasks.

## Step 2: Subagent Dispatch (parallel)

For each `[subagent]` task returned by `bd ready -q`:

1. Mark the task in progress:

```bash
bd update -q {task-id} --status in-progress
```

2. Extract the agent prompt from the issue description:

```bash
bd show -q {task-id} --json
```

The agent prompt is the issue description from `bd show -q`. For subsequent rounds, also apply the file-change injection from Step 2.5 — if upstream tasks modified files in this task's scope, prepend the `## Upstream Changes` section.

Each dispatched agent prompt MUST include explicit scope boundaries. The agent must know:

- Which files it owns (can modify)
- Which files it must not touch
- What commands it must run to verify
- What to do when stuck (escalate, not guess)

These boundaries are already defined in the `## Files` and `## Constraints` sections written by `/dp-cto:work-plan`. Verify they are present before dispatching. If missing, extract from the task spec and append.

Dispatch via the `Agent` tool with `subagent_type: "dp-cto-implementer"` and `run_in_background: true`.

3. **Track the dispatch** — record when the agent is spawned and register the agent state:

```bash
bd agent state -q {task-id} spawning
bd slot set -q {task-id} hook {task-id}
bd audit record -q --type dispatch --actor dp-cto --ref {task-id} --data '{"role":"implementer","dispatch_type":"subagent","started":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
bd agent state -q {task-id} running
```

For `[subagent:isolated]` tasks, use `dispatch_type: "subagent:isolated"` and add `isolation: "worktree"` to the Agent call.

4. **Capture the round baseline** before dispatching each round — this anchors file-change detection for Step 2.5:

```bash
ROUND_BASELINE=$(git rev-parse HEAD)
```

5. Batch in rounds of 3-4 (preserve anti-pattern rule).

The agent prompt is pre-built in the beads issue description. Do NOT modify it except for: (a) prepending the `## Upstream Changes` injection when file overlap is detected (Step 2.5), and (b) verifying scope boundaries are present.

### Pre-Dispatch Validation

Before dispatching agents, validate that all task specs meet quality requirements:

```bash
bd lint -q --parent {epic-id}
```

If any tasks are missing acceptance criteria, stop and report. Do not dispatch tasks with incomplete specs.

### Agent Constraints (baked in)

The dp-cto-implementer agent has the Completion Receipt format, TDD discipline, scope enforcement, and escalation protocol baked into its system prompt. Do NOT append these to the dispatch prompt — the agent already has them.

The task-specific content (files, acceptance criteria, architectural context) still comes from the beads issue description (`bd show -q {task-id} --json`).

### Progress Output Format

The CTO emits structured text blocks at two boundaries to keep the main chat a clean progress dashboard.

**On dispatch** (after spawning each agent in a round):

```
── Round {N} ───────────────────────────
[dispatched] {task-title} [{dispatch-type}]
[dispatched] {task-title} [{dispatch-type}]
```

**On round completion** (at the start of Step 2.5, before the progress query):

```
── Round {N} Complete ──────────────────
[done]  {task-title}  ✓
[stuck] {task-title}  ✗
Progress: {done}/{total} done, {running} running, {ready} ready
```

CTO is auto-notified when background agents complete. After each agent completes, **track the outcome**, **update the agent state**, and mark it done:

On success:

```bash
bd audit record -q --type outcome --actor dp-cto --ref {task-id} --data '{"result":"success","iterations":1}'
bd agent state -q {task-id} done
bd slot clear -q {task-id} hook
bd close -q {task-id}
```

**Collect modified files** — extract the "Files Modified" list from the agent's Completion Receipt. Store a map for this round: `{task-id} -> [file1, file2, ...]`. If the agent result does not include a clear file list, run `git diff --name-only $ROUND_BASELINE` scoped to the task's declared file scope to infer what changed. Accumulate across rounds (append, do not overwrite).

On failure:

```bash
bd audit record -q --type outcome --actor dp-cto --ref {task-id} --data '{"result":"failure","iterations":1}'
bd agent state -q {task-id} stuck
bd slot clear -q {task-id} hook
```

After all agents in the current round complete, proceed to Step 2.5 (Round Checkpoint) before dispatching the next round.

While waiting for background agents, CTO can proceed to dispatch iterative tasks (Step 3).

## Step 2.5: Round Checkpoint

After each dispatch round completes (all agents in the round have returned), emit a progress summary and evaluate whether to continue.

### Progress Summary

Query the full task list to compute progress:

```bash
bd list -q --parent {epic-id} --json
```

Count tasks by status and agent state, then emit:

```
{done}/{total} tasks done, {running} running, {ready} ready. {stuck} stuck.
```

Where:

- `{done}` = tasks in `done` agent state (or status `closed`)
- `{total}` = all child tasks of the epic
- `{running}` = tasks in `running` agent state
- `{ready}` = tasks returned by `bd ready -q` (unblocked, not yet dispatched)
- `{stuck}` = tasks in `stuck` agent state

### Circuit Breaker

If >50% of agents in the just-completed dispatch round are in `stuck` state, pause execution and ask the user:

```
AskUserQuestion: "50%+ of this round failed. Options: Continue to next round / Re-dispatch failed tasks / Stop execution."
```

Act on the user's choice:

- **Continue to next round**: Re-query `bd ready -q --json` and dispatch the next batch normally. Stuck tasks remain in `stuck` state.
- **Re-dispatch failed tasks**: For each stuck task, run `bd agent state -q {task-id} spawning`, set them back to `in-progress`, re-extract their prompts, and re-dispatch as a fresh round. Follow the same dispatch protocol (agent state tracking, audit records).
- **Stop execution**: Halt work-run. The stage remains `executing` — the user can re-invoke `/dp-cto:work-run` to resume, or `/dp-cto:work-park` to suspend.

If <=50% stuck, proceed to the next `bd ready -q` round automatically (no pause).

### File-Change Injection for Downstream Tasks

Before dispatching the next round, check whether any just-completed tasks modified files that overlap with downstream tasks' declared scope. This prevents downstream agents from blindly overwriting upstream work.

1. **Collect completed-task file maps** — use the modified-files map accumulated in Step 2 (and Steps 3-4 if applicable). Each entry is `{task-id} -> [file1, file2, ...]` along with the task title from `bd show -q {task-id} --json`.

2. **Query next-round tasks** — run `bd ready -q --json` to get the tasks about to be dispatched.

3. **Extract downstream file scope** — for each next-round task, extract its file scope from the `## Files` section of the issue description (`bd show -q {task-id} --json`, parse the `description` field for lines under `## Files`). Collect these as a set of file paths.

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

Then re-query `bd ready -q --json` to discover newly unblocked tasks and dispatch the next round.

## Step 3: Iterative Dispatch (only if plan has `[iterative]` tasks)

Skip this step if no `[iterative]` tasks exist. Most well-planned tasks should be `[subagent]`.

For each `[iterative]` task:

1. Mark in progress: `bd update -q {task-id} --status in-progress`
2. Extract the agent prompt from `bd show -q {task-id} --json` (the `description` field). Apply file-change injection from Step 2.5 if upstream overlap exists.
3. **Track the dispatch** — record when the agent is spawned and register agent state:

```bash
bd agent state -q {task-id} spawning
bd slot set -q {task-id} hook {task-id}
bd audit record -q --type dispatch --actor dp-cto --ref {task-id} --data '{"role":"implementer","dispatch_type":"iterative","started":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","max_iterations":'${N}'}'
bd agent state -q {task-id} running
```

4. Dispatch via the `Agent` tool with `subagent_type: "dp-cto-implementer"` and `run_in_background: true` (same as Step 2)

After completion, **track the outcome**, **collect modified files** (same as Step 2 — extract from Completion Receipt or infer via `git diff`), and **update the agent state**:

On success:

```bash
bd audit record -q --type outcome --actor dp-cto --ref {task-id} --data '{"result":"success","iterations":'${N}'}'
bd agent state -q {task-id} done
bd slot clear -q {task-id} hook
bd close -q {task-id}
```

On failure:

```bash
bd audit record -q --type outcome --actor dp-cto --ref {task-id} --data '{"result":"failure","iterations":'${N}'}'
bd agent state -q {task-id} stuck
bd slot clear -q {task-id} hook
```

If it fails the quality gate after 2 fix rounds in Step 5, mark it done with `bd close -q {task-id}`, report the failure to the user, and suggest they invoke `/dp-cto:work-run-loop` manually.

After all iterative tasks in the current round complete, proceed to Step 2.5 (Round Checkpoint) before continuing.

`work-run-loop` is an opt-in tool for tasks that genuinely need multiple iteration cycles. Do NOT auto-dispatch to work-run-loop — let the user decide.

## Step 4: Collaborative Dispatch (team, only if needed)

Skip this entire step if there are no `[collaborative]` tasks in the plan.

### Pre-check: Agent Teams Availability

Agent Teams requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Before creating a team:

1. Attempt `TeamCreate`. If it fails with an "experimental" or "not enabled" error:
   - **Fallback**: Dispatch `[collaborative]` tasks as sequential `[subagent]` tasks instead. Log: "Agent Teams not enabled — falling back to sequential subagent dispatch for collaborative tasks."
   - Cross-review between tasks is skipped in fallback mode.
2. If TeamCreate succeeds, proceed with team-based dispatch below.

### Team-Based Dispatch

1. `TeamCreate({ team_name: "{feature}-collab" })`
2. For each collaborative task: `TaskCreate` with description, file scope, acceptance criteria
3. Set `addBlockedBy` for sequential dependencies
4. Spawn teammates via `Agent` tool with `team_name` and `name` parameters. Each teammate is named `{task-id}-impl` for beads correlation:

```
Agent(name: "{task-id}-impl", team_name: "{feature}-collab", ...)
```

5. Extract the agent prompt from `bd show -q {task-id} --json` (the `description` field) for each teammate. Apply file-change injection from Step 2.5 if upstream overlap exists.

> **Note**: TeammateIdle and TaskCompleted hooks automatically enforce completion receipt discipline on dp-cto teams (identified by the `-collab` suffix). Teammates will be reminded to include receipts before going idle.

6. **Track the dispatch and agent state** — for each teammate dispatched:

```bash
bd agent state -q {task-id} spawning
bd slot set -q {task-id} hook {task-id}
bd audit record -q --type dispatch --actor dp-cto --ref {task-id} --data '{"role":"implementer","dispatch_type":"collaborative","started":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
bd agent state -q {task-id} running
```

7. Monitor via `TaskList`, steer via `SendMessage`
8. After all teammates report completion, instruct cross-review via SendMessage:

```
SendMessage({ to: "{task-id-A}-impl", message: "Cross-review {task-id-B}-impl's work. Check: file scope compliance, test coverage, pattern consistency. Report CONFIRMED or DISPUTED." })
```

9. When all collaborative tasks complete and cross-reviews are resolved: shut down teammates via `SendMessage({ type: "shutdown_request" })`, then `TeamDelete()`
10. **Update agent state, collect modified files, and mark done** — for each completed collaborative task, collect modified files (same as Step 2 — extract from Completion Receipt or infer via `git diff`):

On success:

```bash
bd audit record -q --type outcome --actor dp-cto --ref {task-id} --data '{"result":"success"}'
bd agent state -q {task-id} done
bd slot clear -q {task-id} hook
bd close -q {task-id}
```

On failure:

```bash
bd audit record -q --type outcome --actor dp-cto --ref {task-id} --data '{"result":"failure"}'
bd agent state -q {task-id} stuck
bd slot clear -q {task-id} hook
```

After all collaborative tasks complete, proceed to Step 2.5 (Round Checkpoint) before continuing to Step 5.

## Step 5: Builder/Validator Review

For each completed task (from any dispatch type), run a two-stage builder/validator review. The builder (implementation agent) has already finished. Now validate independently.

### Stage 1 — Validator Agent (read-only)

Spawn the `dp-cto-validator` agent via Agent tool with `subagent_type: "dp-cto-validator"`. The agent definition enforces read-only tool constraints structurally.

**Track the validation dispatch**:

```bash
bd audit record -q --type dispatch --actor dp-cto --ref {task-id} --data '{"role":"validator","dispatch_type":"subagent","started":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```

**Validator agent prompt** — pass exactly this structure. Before dispatching, substitute `{ROUND_BASELINE}` with the actual SHA captured at the start of the dispatch round (`ROUND_BASELINE=$(git rev-parse HEAD)` from Step 2):

```
## Your Task

Independently verify the builder's Completion Receipt for Task {task-id}: {task-title}.

## Builder's Completion Receipt

{paste the Completion Receipt from the builder agent's output}

## Original Task Spec

{paste the acceptance criteria from bd show -q {task-id} --json}

## File Scope

{list the files from the task's ## Files section}

## Round Baseline

The round baseline commit is `{ROUND_BASELINE}`. Use this to scope your file change checks:
- `git diff --name-only {ROUND_BASELINE}` — shows only files changed in this round
- Do NOT use `git diff --name-only` without a baseline — it shows ALL uncommitted changes across all tasks

## Instructions

1. Run the verification command from the receipt. Compare the output to what the receipt claims.
2. Check that every file listed in "Files Modified" exists and was actually changed since the round baseline. Run `git diff --name-only {ROUND_BASELINE}` to see actual changes.
3. Verify each acceptance criterion independently — do not trust the builder's claim.
4. Check that no files outside the declared scope were modified since the round baseline. Compare `git diff --name-only {ROUND_BASELINE}` against the task's declared file scope.

## Output

You MUST output exactly one of:
- "CONFIRMED: Receipt verified. [evidence summary]"
- "DISPUTED: [specific discrepancy]. Expected X, got Y."
```

**Track the validation outcome**:

```bash
bd audit record -q --type validation --actor dp-cto --ref {task-id} --data '{"result":"{confirmed|disputed}","role":"validator"}'
```

### Stage 2 — Code Quality Review (only if Stage 1 is CONFIRMED)

If the validator outputs **CONFIRMED**, proceed to code quality review via `dp-cto:quality-code-review`:

- Test coverage: are edge cases tested?
- Error handling: are failure modes addressed?
- Patterns: does the code match existing codebase conventions?

**Track the review dispatch**:

```bash
bd audit record -q --type dispatch --actor dp-cto --ref {task-id} --data '{"role":"reviewer","dispatch_type":"subagent","started":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```

Spawn a foreground review Agent with the builder's result + file diffs. After the review completes, **track the review outcome**:

```bash
bd audit record -q --type review --actor dp-cto --ref {task-id} --data '{"result":"{pass|fail}","issues_found":{N},"role":"reviewer"}'
```

If issues found, spawn a fresh fix Agent via `subagent_type: "dp-cto-implementer"` (foreground) with the review feedback + original task spec + file scope. Re-validate (Stage 1) after fix. Max 2 fix rounds, then report the failure to the user and suggest they invoke `/dp-cto:work-run-loop` manually.

If the validator outputs **DISPUTED**, skip code quality review. Spawn a fresh fix agent via `subagent_type: "dp-cto-implementer"` (foreground) with the discrepancy details + original task spec + file scope. Re-validate (Stage 1) after fix. Max 2 fix rounds.

### Review by dispatch type

**Subagent tasks**: Full builder/validator review (Stage 1 + Stage 2) as described above.

**Iterative tasks**: Dispatched as subagents (Step 3). Same builder/validator review as subagent tasks.

**Collaborative tasks**: Cross-review already happened in Step 4. CTO runs Stage 1 (validator) as a final spec-compliance check.

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
9. NEVER skip the builder/validator review for any task, regardless of size
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
