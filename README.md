# dotplugins

A plugin marketplace for [Claude Code](https://code.claude.com/docs/en/overview).

## Orchestration Plugin

dp-cto turns Claude Code into a CTO that plans features, dispatches agents to build them, reviews their work, and polishes the result. You describe what to build — agents do the rest.

### Install

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```

Requires: `jq` on PATH. Required for full functionality: [`bd` CLI (beads)](https://github.com/steveyegge/beads) for structured task scheduling.

---

## How It Works

### The Core Loop

Three commands drive the entire workflow:

```
  You describe                Agents build              Specialists
  the feature                  each task                  review
       │                          │                         │
       v                          v                         v
  ┌─────────────┐  planned  ┌──────────────┐  done   ┌──────────────┐
  │  work-plan  │ ────────> │   work-run   │ ──────> │  work-polish │ ──> Done
  └─────────────┘           └──────────────┘         └──────────────┘
       │                          │                         │
       │ Brainstorms              │ Dispatches 3-4          │ Spawns 4-6
       │ approaches,              │ agents per round,       │ review lenses
       │ asks questions,          │ reviews results,        │ (security, dead
       │ writes tasks             │ fix loop if needed      │ code, test gaps,
       │ with deps                │                         │ linting, perf,
       │                          │                         │ docs), auto-fixes
       v                          v                         v
  Beads epic +              Parallel agents           Severity-graded
  dependency graph          with monitoring           findings + fixes
```

```bash
/dp-cto:work-plan    # Step 1: Plan
/dp-cto:work-run     # Step 2: Execute
/dp-cto:work-polish  # Step 3: Polish
```

### What Happens Inside work-run

```
  ┌─ Round 1 ──────────────────────────────────────────────────────────┐
  │                                                                    │
  │  bd ready ──> Tasks 1, 3, 4 (no blockers)                          │
  │                                                                    │
  │  ┌─────────┐   ┌─────────┐   ┌─────────┐                           │
  │  │ Agent 1 │   │ Agent 3 │   │ Agent 4 │    parallel background    │
  │  │ [sub]   │   │ [sub]   │   │ [sub]   │    agents                 │
  │  └────┬────┘   └────┬────┘   └────┬────┘                           │
  │       │             │             │                                │
  │       v             v             v                                │
  │  label: done    label: done   label: failed                        │
  │                                                                    │
  │  ── Round Checkpoint ──────────────────────────────────────────    │
  │  3/5 done, 0 running, 2 ready. 1 failed.                           │
  │                                                                    │
  │  Circuit breaker: 1/3 failed (33%) ── below 50%, continue          │
  │                                                                    │
  │  ── Review ────────────────────────────────────────────────────    │
  │  Spawn review agent per completed task                             │
  │  Issues found? → Spawn fix agent → Re-review (max 2 rounds)        │
  │                                                                    │
  │  ── File-Change Injection ─────────────────────────────────────    │
  │  Task 1 modified work-run/SKILL.md                                 │
  │  Task 2 (next round) also touches work-run/SKILL.md                │
  │  → Prepend "## Upstream Changes" to Task 2's prompt                │
  └────────────────────────────────────────────────────────────────────┘

  ┌─ Round 2 ──────────────────────────────────────────────────────────┐
  │                                                                    │
  │  bd ready ──> Tasks 2, 5 (unblocked by Task 1)                     │
  │                                                                    │
  │  ┌─────────┐   ┌─────────┐                                         │
  │  │ Agent 2 │   │ Agent 5 │   Task 2 gets upstream context          │
  │  │ [sub]   │   │ [sub]   │                                         │
  │  └────┬────┘   └────┬────┘                                         │
  │       v             v                                              │
  │  label: done    label: done                                        │
  │                                                                    │
  │  5/5 done. All tasks complete. → Stage: polishing                  │
  └────────────────────────────────────────────────────────────────────┘
```

### Adaptive Dispatch

Work-run classifies each task and picks the right primitive:

```
  Task tag in plan          How it runs                  When to use
  ──────────────────────    ─────────────────────────    ──────────────────────
  [subagent]                Agent(background: true)      Independent, parallel
  [subagent:isolated]       Agent(isolation: worktree)   Needs filesystem isolation
  [iterative]               /dp-cto:work-run-loop        Needs quality gate + retries
  [collaborative]           TeamCreate + SendMessage      Agents must coordinate
```

### What Happens Inside work-polish

```
  ┌─ Lens Selection ───────────────────────────────────────────────────┐
  │  User picks which lenses to run (core 4 selected by default)       │
  └────────────────────────────────────────────────────────────────────┘
                                    │
                                    v
  ┌─ Parallel Review ──────────────────────────────────────────────────┐
  │                                                                    │
  │  ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌─────────┐            │
  │  │ Security │ │ Dead Code  │ │ Test Gaps  │ │ Linting │  core      │
  │  └────┬─────┘ └─────┬──────┘ └─────┬──────┘ └────┬────┘            │
  │       │             │              │              │                │
  │  ┌────────────┐ ┌──────────────┐                                   │
  │  │ Performance│ │ Documentation│  extended (opt-in)                │
  │  └────┬───────┘ └──────┬───────┘                                   │
  │       │                │                                           │
  │       v                v                                           │
  │  ┌──────────────────────────────────────────────────────────────┐  │
  │  │  Consolidated findings: [CRITICAL] [WARNING] [SUGGESTION]    │  │
  │  └──────────────────────────────────────────────────────────────┘  │
  │       │                                            │               │
  │       v                                            v               │
  │  CRITICAL + WARNING                          SUGGESTION            │
  │  → auto-fix agents                           → user picks          │
  │  → quality gate                              which to apply        │
  └────────────────────────────────────────────────────────────────────┘
```

---

## All Skills Reference

### Workflow Skills (stage-enforced)

| Skill                 | Stage Required             | What It Does                                          |
| --------------------- | -------------------------- | ----------------------------------------------------- |
| `/dp-cto:work-plan`   | `idle` or `complete`       | Brainstorm, plan, create beads epic with tasks + deps |
| `/dp-cto:work-run`    | `planned`                  | Dispatch agents, monitor rounds, review + fix         |
| `/dp-cto:work-polish` | `executing` or `complete`  | Multi-lens review, auto-fix critical/warning          |
| `/dp-cto:work-park`   | `executing` or `polishing` | Suspend epic with context — switch to urgent work     |
| `/dp-cto:work-unpark` | `idle`                     | Restore a suspended epic and resume                   |

### Quality Skills (use from any stage)

| Skill                                | What It Does                                           |
| ------------------------------------ | ------------------------------------------------------ |
| `/dp-cto:quality-red-green-refactor` | TDD enforcement — no code without a failing test first |
| `/dp-cto:quality-deep-debug`         | 4-phase root cause investigation before any fix        |
| `/dp-cto:quality-check-done`         | Blocks "done" claims without test output evidence      |
| `/dp-cto:quality-code-review`        | Dispatch review agent, process feedback with rigor     |
| `/dp-cto:quality-sweep-code`         | Find and fix dead code, naming drift, stale comments   |
| `/dp-cto:quality-fact-check`         | Deep-validate research findings claim by claim         |

### Operations Skills (use from any stage)

| Skill                      | What It Does                                           |
| -------------------------- | ------------------------------------------------------ |
| `/dp-cto:ops-show-board`   | Dashboard — epic status, agent labels, sprint progress |
| `/dp-cto:ops-track-sprint` | Sprint lifecycle — plan, review, retro, close          |
| `/dp-cto:ops-clean-slate`  | Sprint-boundary cleanup — close epics, prune state     |

### Escape Hatches

| Skill                    | When                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `/dp-cto:work-run-loop`  | Task keeps failing — iterative loop, fresh agent each attempt |
| `/dp-cto:work-stop-loop` | Cancel an active work-run-loop                                |

---

## Architecture

### Stage Machine

The stage machine prevents out-of-order skill invocations. Hooks enforce this automatically:

```
  ┌──────┐                                                    ┌───────────┐
  │ idle │                                                    │ executing │
  └──┬───┘                                                    └───┬───┬───┘
     │ work-plan                                          ────────┘   │
     v                                                   │            │
  ┌──────────┐                                           │       work-park
  │ planning │                                           │            │
  └────┬─────┘                                           │            v
       │ done                                            │      ┌───────────┐
       v                                                 │      │ suspended │
  ┌─────────┐             work-run                       │      └─────┬─────┘
  │ planned │ ───────────────────────────────────────────┘            │
  └─────────┘                                                   work-unpark
                                                                     │
  ┌──────────┐            work-polish done                           v
  │ complete │ <──────────────────────────── ┌───────────┐     (restores to
  └────┬─────┘                               │ polishing │    prior stage)
       │                                     └───────────┘
       │ work-plan
       │ (new cycle)
       v
    (idle)

  Quality + ops skills bypass the stage machine entirely.
```

### Harness Engineering

Hooks act as defense-in-depth guardrails. They catch failure modes early without blocking:

```
  ┌─ SessionStart ─────────────────────────────────────────────────────┐
  │                                                                    │
  │  1. Sync state from beads (sync_from_beads)                        │
  │  2. Inject enforcement context (stage rules, skill list)           │
  │  3. Run bd prime (sanitize all XML tags from output)               │
  │  4. Detect recoverable prior sessions                              │
  │  5. Scan for orphaned in-progress tasks                            │
  │     → injects task IDs + actionable recovery guidance              │
  └────────────────────────────────────────────────────────────────────┘

  ┌─ PreToolUse ───────────────────────────────────────────────────────┐
  │                                                                    │
  │  intercept-orchestration.sh                                        │
  │  ├── dp-cto skill? → stage valid? → ALLOW / DENY                   │
  │  ├── orchestration-adjacent? → ALLOW + WARN                        │
  │  └── everything else → ALLOW                                       │
  │                                                                    │
  │  intercept-bd-init.sh                                              │
  │  └── bd init without --stealth? → DENY                             │
  └────────────────────────────────────────────────────────────────────┘

  ┌─ PostToolUse ──────────────────────────────────────────────────────┐
  │                                                                    │
  │  research-validator.sh     → verification checklist after search   │
  │  stage-transition.sh       → advance stage machine after skill     │
  │  completion-gate.sh        → warn on "tests pass" without output   │
  └────────────────────────────────────────────────────────────────────┘
```

### Execute Monitoring (v4.1)

Work-run tracks agent state via beads labels and provides real-time visibility:

```
  Agent dispatched ──> bd label add "agent:dispatched"
  Agent succeeded  ──> bd label remove "agent:dispatched"
                       bd label add "agent:done"
  Agent failed     ──> bd label remove "agent:dispatched"
                       bd label add "agent:failed"

  After each round:
  ┌──────────────────────────────────────────────────────┐
  │  3/5 done, 0 running, 2 ready. 1 failed.             │
  │                                                      │
  │  Circuit breaker: >50% failed? → AskUser:            │
  │    [Continue] [Re-dispatch failed] [Stop]            │
  └──────────────────────────────────────────────────────┘

  Between rounds:
  ┌──────────────────────────────────────────────────────┐
  │  File-change injection:                              │
  │  Task 1 modified foo.ts → Task 3 also touches foo.ts │
  │  → Prepend ## Upstream Changes to Task 3's prompt    │
  │  Uses round-baseline SHA for reliable diffs          │
  └──────────────────────────────────────────────────────┘
```

### Work-Run-Loop Resilience (v4.1)

Iterative loops have crash recovery and timeout protection:

```
  ┌─ Step 0d: Crash Detection ────────────────────────────┐
  │  Scan .claude/ralph/ for orphaned "status: running"   │
  │  files from prior sessions                            │
  │  → AskUser: [Resume] [Abandon]                        │
  │  Abandoned files get status: abandoned (not deleted)  │
  └───────────────────────────────────────────────────────┘

  ┌─ Step 2a: State Validation ───────────────────────────┐
  │  Validate YAML frontmatter before each iteration      │
  │  Missing or corrupt? → Re-create from # Task section  │
  └───────────────────────────────────────────────────────┘

  ┌─ Step 2d: Gate Timeout ───────────────────────────────┐
  │  timeout 300 {quality-gate-cmd}                       │
  │  Exit 124 → "Gate timed out after 5 minutes"          │
  │  3 consecutive failures → warn user                   │
  └───────────────────────────────────────────────────────┘
```

### Fresh Context Architecture

Every agent spawned by work-run and work-run-loop starts with a clean context. No long-running conversations that accumulate stale assumptions. Review agents, fix agents, and iteration agents all get fresh context with only the structured task description as input.

## Design Influences

| Tenet                         | Inspiration                                                                  | Source                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan before code              | Structured planning as a prerequisite to execution                           | Plan-and-execute agent architecture                                                                                                                                               |
| RED-GREEN-REFACTOR            | No production code without a failing test first                              | Kent Beck, [Canon TDD](https://tidyfirst.substack.com/p/canon-tdd)                                                                                                                |
| Evidence before claims        | Output proves the claim, not the agent's word                                | Inspired by [harness engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html) verification loops                                                 |
| Entropy is garbage collection | Agents replicate all patterns — good and bad — without curation              | [OpenAI harness engineering](https://openai.com/index/harness-engineering/)                                                                                                       |
| Defense-in-depth              | Hooks catch common agent failure modes without blocking                      | [Harness engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html) (Böckeler/Fowler)                                                              |
| Context rot prevention        | Fresh agent per iteration — long-running agents accumulate stale assumptions | [Chroma Research](https://research.trychroma.com/context-rot), [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Orchestrate, don't implement  | Delegate everything, review everything, write nothing                        | —                                                                                                                                                                                 |
| Adaptive dispatch             | Subagents for parallel, iterative for stubborn, collaborative for coupled    | —                                                                                                                                                                                 |

### Built With

- [Claude Code](https://code.claude.com/docs/en/overview) — Anthropic's agentic CLI ([plugins docs](https://code.claude.com/docs/en/plugins))
- [beads](https://github.com/steveyegge/beads) — git-backed task tracking for AI agents (Steve Yegge)

## License

ISC
