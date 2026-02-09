---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies. Supports both Agent Teams and Subagents.
---

# Dispatching Parallel Agents

Run 2+ independent tasks concurrently using Agent Teams or Subagents.

## When to Use

- 3+ test files failing with different root causes
- Multiple independent subsystems need work
- Tasks don't share state or files

## When NOT to Use

- Failures are related (fixing one might fix others)
- Tasks share files or state
- Need full system understanding first

## Step 1: Choose Dispatch Strategy

| Strategy | When | Cost |
|----------|------|------|
| **Agent Teams** | Tasks need cross-communication, long-running, cross-layer | Higher (separate sessions) |
| **Subagents** | Simple focused tasks, no coordination needed | Lower (Task() tool) |

Default to **Subagents** unless tasks need to talk to each other.

## Step 2: Identify Independent Domains

Group work by what's broken or what's needed. Each domain is one agent's scope.

## Step 3: Create Focused Prompts

Each agent/teammate gets:
- **Specific scope** — one test file, one subsystem, one feature area
- **Clear goal** — "make these tests pass" or "implement this feature"
- **Constraints** — "do NOT modify files outside your scope"
- **All context needed** — error messages, file paths, requirements (don't assume they have history)

## Step 4: Dispatch

### Subagents (default)

All `Task()` calls in ONE message for true parallelism:

```
Task("Fix auth tests in src/__tests__/auth.test.ts. Error: ...")
Task("Fix API tests in src/__tests__/api.test.ts. Error: ...")
```

### Agent Teams

1. `TeamCreate({ team_name: "fix-tests" })`
2. `TaskCreate` for each independent domain
3. Spawn teammates via `Task` tool with `team_name` and `name` parameters
4. Teammates self-claim tasks from shared list
5. Monitor via `TaskList` and incoming messages (auto-delivered)
6. Steer via `SendMessage` — don't implement yourself
7. When done: `SendMessage({ type: "shutdown_request" })` to each teammate
8. `TeamDelete()` to clean up

## Step 5: Review and Integrate

- Read each agent's output/summary
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes
