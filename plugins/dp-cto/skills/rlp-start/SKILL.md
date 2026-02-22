---
name: rlp-start
description: "Use to run iterative autonomous loops on well-defined tasks. Each iteration spawns a fresh agent with clean context. Args: PROMPT [--max-iterations N] [--completion-promise TEXT] [--quality-gate CMD]"
---

<EXTREMELY_IMPORTANT>
You are a loop coordinator. You spawn, monitor, and retire iterative work agents.
You NEVER implement the task yourself. You read progress, spawn agents, check gates, repeat.

If you catch yourself writing application code, STOP. Spawn an agent for that.
</EXTREMELY_IMPORTANT>

# dp-cto:rlp-start — Teammate Loop Coordinator

## Anti-Rationalization

| Thought                                      | Reality                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| "I'll just do this small piece myself"       | You are coordinator. Never implement.                               |
| "The teammate failed, I'll fix it"           | Spawn next iteration. Track failure in progress file.               |
| "Completion promise looks close enough"      | ONLY declare done when promise appears verbatim in teammate output. |
| "Quality gate failed but it's minor"         | Failed gate = failed iteration. Log it, spawn again.                |
| "I'll skip the progress file this iteration" | Progress file is the only cross-iteration memory. Always write it.  |
| "Max iterations is just a suggestion"        | Max iterations is a hard stop. Never exceed it.                     |
| "I'll run multiple iterations in parallel"   | This is a sequential loop. One active iteration at a time.          |

## Step 0: Resolve Configuration

This skill can be invoked three ways:

1. **Full explicit args**: `/dp-cto:rlp-start "Fix the auth bug" --max-iterations 15 --quality-gate "npm test"`
2. **Partial args**: `/dp-cto:rlp-start "Fix the auth bug"` (other options inferred)
3. **No args**: `/dp-cto:rlp-start` (everything inferred from session context)

### 0a: Parse Any Explicit Arguments

If args are provided, parse them:

- **PROMPT** — the task description (everything that is not a flag or flag value)
- **--max-iterations N** — hard stop after N iterations
- **--completion-promise TEXT** — exact phrase teammate must output to signal done
- **--quality-gate CMD** — bash command to run between iterations; non-zero exit = iteration failed

### 0b: Infer Missing Options from Context

For anything NOT explicitly provided, infer from the current session:

**PROMPT** (if not provided):

- First, check for an active CTO plan: read `.claude/plans/_index.md`
  - If an active plan exists, read the referenced plan file
  - Look for tasks marked as "iterative", in-progress, or failing
  - If a suitable task is found, use its description + acceptance criteria as the prompt
  - Include the plan task reference (e.g., "Plan task #3 from domain/02-implementation.md")
- If no plan or no suitable task: review the conversation history in this session
  - Identify the task the user has been working on or discussing
  - Synthesize a clear, actionable prompt from that context
- If neither yields a task, ask the user: "What task should the loop work on?"

**--max-iterations** (if not provided):

- Small, well-scoped tasks (bug fix, single file change): suggest 5
- Medium tasks (feature addition, multi-file refactor): suggest 10
- Large tasks (new subsystem, broad refactor): suggest 15-20
- Default to 10 if scope is unclear

**--completion-promise** (if not provided):

- Look for natural completion signals in the task: test suites, build commands, lint checks
- If the task has a clear success condition, derive a promise phrase (e.g., "ALL TESTS PASS", "BUILD SUCCEEDS", "LINT CLEAN")
- If no clear signal exists, leave as none — rely on agent self-assessment + quality gate

**--quality-gate** (if not provided):

- Detect the project's toolchain by checking for config/lock files:
  - `package.json` → try `npm test` or `npx tsc --noEmit` (check scripts section)
  - `pnpm-lock.yaml` → use `pnpm test` or `pnpm run typecheck`
  - `Cargo.toml` → `cargo test`
  - `pyproject.toml` / `setup.py` → `pytest`
  - `go.mod` → `go test ./...`
  - `Makefile` with `test` target → `make test`
- If a test/lint/typecheck command is found, suggest it as the quality gate
- If no obvious command is found, leave as none

### 0c: Confirm Configuration with User

Present the resolved configuration using `AskUserQuestion` and ask for confirmation. Show what was explicit vs inferred:

```
Ralph loop configuration:

Task: {PROMPT} {(inferred from session) or (explicit)}
Max iterations: {N} {(inferred: medium-scope task) or (explicit)}
Completion promise: {TEXT or "none"} {(inferred) or (explicit)}
Quality gate: {CMD or "none"} {(detected from package.json) or (explicit)}
```

Ask: "Start the loop with this configuration?"

Options:

- **Start** — proceed with the shown config
- **Adjust** — let me change something first

If the user selects "Adjust", ask which option(s) to change and re-confirm.

Do NOT proceed to Step 1 until the user confirms.

### 0d: Derive Session ID

After confirmation, derive a session ID: current timestamp in format `YYYYMMDD-HHMMSS`.

State file path: `.claude/ralph/{SESSION_ID}.md`

## Step 1: Initialize Team + State

1. Call `TeamCreate({ team_name: "ralph-{SESSION_ID}" })`

2. Create the sessions directory via Bash: `mkdir -p .claude/ralph`

3. Write the state file `.claude/ralph/{SESSION_ID}.md` using the Write tool with this EXACT structure:

```markdown
---
session_id: {SESSION_ID}
team_name: ralph-{SESSION_ID}
status: running
current_iteration: 0
max_iterations: {N}
completion_promise: "{TEXT}" or null
quality_gate: "{CMD}" or null
plan_task: "{plan file path + task reference}" or null
started_at: "{ISO timestamp}"
completed_at: null
---

# Task

{PROMPT}

# Iteration Log
```

Do NOT skip writing this file. It is the only persistent state between iterations.

## Step 2: Run Iteration Loop

Repeat the following until a stop condition is met.

### 2a: Pre-Iteration Checks

Read the state file. Check:

- If `status` is `cancelled` — STOP immediately (someone ran `/dp-cto:rlp-cancel`). Jump to Step 3 with reason "cancelled".
- Increment `current_iteration` by 1. Update the state file frontmatter with the new count.

### 2b: Spawn Iteration Agent

Create a task for tracking:

```
TaskCreate({
  subject: "Ralph iteration {N}: {first 50 chars of PROMPT}",
  description: "Iteration {N} of ralph loop {SESSION_ID}.",
  activeForm: "Working on iteration {N}"
})
```

Spawn a teammate via the `Task` tool:

- `team_name`: `"ralph-{SESSION_ID}"`
- `name`: `"worker-{N}"` (where N is the current iteration number)
- `subagent_type`: `"general-purpose"`

The teammate prompt MUST be constructed EXACTLY as follows — do NOT abbreviate or omit sections:

```
You are iteration {N} of an iterative development loop.
You have NO memory of prior iterations. Read the progress file FIRST.

## Your Task

{PROMPT}

## Prior Work

Read this file IMMEDIATELY before doing anything else:
`.claude/ralph/{SESSION_ID}.md`

It contains the full task description and a log of all prior iterations including
what was done, what worked, and what failed. Use this to avoid repeating mistakes
and to build on prior progress.

## Instructions

1. Read `.claude/ralph/{SESSION_ID}.md` NOW.
2. Understand what prior iterations accomplished (if any).
3. Work on the task. Make real changes to files.
4. Run tests or verification commands to confirm your changes work.
5. Do NOT declare done unless the work is genuinely complete.

## Completion Report

When you are finished working, you MUST output a completion report with EXACTLY these sections:

### Summary
(3-5 sentences: what you did this iteration)

### Files Modified
(bullet list of files you changed or created)

### Current State
(what works, what does not, what remains)

### Complete
YES or NO
{IF completion_promise is set: If YES, include this EXACT phrase: {COMPLETION_PROMISE}}

## Constraints

- Do NOT run git write commands (commit, push, checkout, branch). Read-only git is fine.
- Do NOT modify `.claude/ralph/{SESSION_ID}.md` — the coordinator manages this file.
- Work in the current directory.
- Be thorough but focused. Do not expand scope beyond the task.
```

### 2c: Wait for Teammate Response

Messages from teammates are auto-delivered. Wait for the teammate to complete and send its message. Do not poll. Do not act until the message arrives.

When the message arrives, extract:

- Summary of work done
- Files modified
- Current state
- Completion status (YES/NO)
- Full message text (for promise detection)

Mark the tracking task as completed via `TaskUpdate`.

### 2d: Run Quality Gate (if configured)

If `--quality-gate CMD` was specified:

Run the command via Bash tool. Capture exit code and output (first 500 chars).

- Exit 0 = gate PASSED
- Non-zero = gate FAILED

Track consecutive gate failures. If gate has failed 3 consecutive iterations, warn the user:
"Quality gate has failed 3 consecutive iterations. Consider adjusting the prompt or gate command. Continuing loop."

### 2e: Detect Completion

Check stop conditions IN THIS ORDER:

1. **Completion promise detected**: If `--completion-promise` is set AND the teammate's full message text contains the promise phrase verbatim — STOP. Reason: "promise detected".

2. **Agent confirmed complete + gate passed**: If teammate reported `Complete: YES` AND quality gate passed (or not configured) AND no completion promise is set — STOP. Reason: "agent confirmed completion".

3. **Max iterations reached**: If `current_iteration >= max_iterations` — STOP. Reason: "max iterations exhausted".

4. **Otherwise**: Continue to next iteration.

### 2f: Update Progress File

Append an iteration entry to the state file BELOW the `# Iteration Log` heading using the Edit tool:

```markdown
## Iteration {N} — {ISO timestamp}

**Status**: {complete / failed-gate / in-progress}
**Quality gate**: {passed / failed / skipped}

### Agent Summary

{agent's summary text}

### Files Modified

{agent's file list}

### Current State

{agent's current state text}
```

Also update the frontmatter:

- `current_iteration: {N}`
- If stopping: `status: complete` or `status: exhausted`, and `completed_at: "{timestamp}"`

## Step 3: Report Completion

When the loop stops, report to the user:

```
Ralph loop complete.

Session: {SESSION_ID}
Iterations run: {N} of {MAX}
Stop reason: {promise detected / agent confirmed completion / max iterations exhausted / cancelled}
Final status: {complete / exhausted / cancelled}

State file: .claude/ralph/{SESSION_ID}.md
```

If stopped by exhaustion: add "Max iterations reached without confirmed completion. Review the state file for iteration history and consider running again with a refined prompt."

## Step 4: Cleanup

1. Send shutdown request to the last active teammate: `SendMessage({ type: "shutdown_request", recipient: "worker-{N}" })`
2. Call `TeamDelete()`
3. Leave the state file in place — it is a permanent record of the run. Do NOT delete it.

## NEVER

1. NEVER implement the task yourself — delegate everything to iteration agents
2. NEVER declare completion without the promise appearing verbatim (if a promise was set)
3. NEVER exceed max_iterations
4. NEVER skip writing the progress file before spawning the next iteration
5. NEVER send incomplete prompts to teammates — use the full template from Step 2b
6. NEVER delete the state file — it is the run record
7. NEVER spawn more than one iteration agent at a time — this is a sequential loop
8. NEVER trust "YES complete" without also passing the quality gate (if configured)
9. NEVER continue after detecting `status: cancelled` in the state file

## Red Flags — STOP

| Flag                                   | Action                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| About to write application code        | STOP. That is the teammate's job.                           |
| Promise not in output but want to stop | Keep looping or exhaust iterations.                         |
| Quality gate failing every iteration   | Warn user after 3 consecutive failures. Continue.           |
| State file missing or corrupted        | STOP. Re-create from Step 1.                                |
| Teammate never responded               | Check TaskList. If stuck, log it and spawn fresh iteration. |
| State file shows `status: cancelled`   | STOP immediately. Jump to Step 3.                           |
