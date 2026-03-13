# dotplugins

A plugin marketplace for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## dp-cto — CTO Orchestration Plugin

dp-cto turns Claude Code into a CTO that plans features, dispatches agents to build them, reviews their work, and polishes the result.

### Install

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```

Requires: `jq` on PATH. Optional: `bd` CLI (beads) for structured task scheduling.

### The Workflow (3 commands)

```
/dp-cto:work-plan   →  You describe the feature. Plugin brainstorms approaches,
                        asks clarifying questions, writes a plan with tasks.

/dp-cto:work-run    →  Plugin dispatches agents in parallel to implement each task.
                        Reviews their work. Fix loop if needed. Runs autonomously.

/dp-cto:work-polish →  Auto-chained after work-run. 6 specialist review agents
                        (security, dead code, test gaps, linting, perf, docs)
                        find issues, auto-fix critical/warning, you pick suggestions.
```

```
                  writes        dispatches       fixes
                   plan           agents        findings
  /dp-cto:work-plan ────────> /dp-cto:work-run ────────> /dp-cto:work-polish ────────> Done
       ^                                                                                 │
       └────────────────────── new feature ──────────────────────────────────────────────┘
```

### Quality Skills (use anytime)

| Skill                                | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `/dp-cto:quality-red-green-refactor` | Enforces RED-GREEN-REFACTOR. No code without failing test. |
| `/dp-cto:quality-deep-debug`         | 4-phase root cause investigation before any fix attempt.   |
| `/dp-cto:quality-check-done`         | Blocks completion claims without test output evidence.     |
| `/dp-cto:quality-code-review`        | Dispatches review agent, processes feedback with rigor.    |
| `/dp-cto:quality-sweep-code`         | Finds and fixes dead code, naming drift, stale comments.   |

### Escape Hatches

| Skill                        | When                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `/dp-cto:work-run-loop`      | Task keeps failing — iterative loop with fresh agent each attempt + quality gate |
| `/dp-cto:work-stop-loop`     | Stop an active work-run-loop                                                     |
| `/dp-cto:quality-fact-check` | Deep-validate research findings claim by claim                                   |

### What Happens Behind the Scenes

Hooks enforce discipline automatically — you never invoke them:

- **Stage machine** prevents running work-run before work-plan, or work-polish before work-run
- **Completion gate** warns when agents claim "tests pass" without showing test output
- **Research validator** injects verification checklists after web searches and MCP calls
- **Session recovery** detects interrupted workflows and offers to resume next session

### Mental Model

You are the CTO. You never write code or review code yourself. You:

1. Describe what to build
2. Approve the plan
3. Watch agents implement
4. Pick which suggestions to apply in polish

---

## Architecture

### Adaptive Dispatch

Work-run classifies each task and picks the right primitive:

| Classification        | Primitive                    | When                                        |
| --------------------- | ---------------------------- | ------------------------------------------- |
| `[subagent]`          | `Agent(run_in_background)`   | Independent work, parallelizable            |
| `[subagent:isolated]` | `Agent(isolation: worktree)` | Needs filesystem isolation from other tasks |
| `[iterative]`         | `/dp-cto:work-run-loop`      | Needs quality gate + multiple attempts      |
| `[collaborative]`     | `TeamCreate + SendMessage`   | Rare — agents need to coordinate            |

Task scheduling uses beads dependency graphs (`bd ready --json`) to discover what's unblocked after each round.

### Harness Engineering

Hooks act as defense-in-depth guardrails. They don't block — they catch failure modes early:

```
  ┌─ SessionStart ──────────────────────────────────────────────────────┐
  │  Inject enforcement context, prime beads, detect session recovery   │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PreToolUse (on Skill calls) ───────────────────────────────────────┐
  │                                                                     │
  │   Skill invoked                                                     │
  │       │                                                             │
  │       ├── dp-cto skill? ──> Stage valid? ──yes──> ALLOW             │
  │       │                          │                                  │
  │       │                         no ──> DENY (with reason)           │
  │       │                                                             │
  │       └── other skill? ──> Tiered filtering:                        │
  │               Tier 1 WARN  — orchestration-adjacent ──> allow+warn  │
  │               Tier 2 PASS  — everything else ──> allow              │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ PostToolUse ───────────────────────────────────────────────────────┐
  │  After WebSearch / WebFetch / MCP  ──>  verification checklist      │
  │  After dp-cto Skill completion     ──>  advance stage machine       │
  │  After Agent completion            ──>  completion claim gate       │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ SessionEnd ────────────────────────────────────────────────────────┐
  │  Preserve stage files for next-session recovery                     │
  └─────────────────────────────────────────────────────────────────────┘
```

### Stage Machine

Strict state transitions prevent out-of-order skill invocations:

```
  ┌──────────┐
  │   idle   │
  └────┬─────┘
       │ /work-plan
       v
  ┌──────────┐
  │ planning │
  └────┬─────┘
       │ plan written
       v
  ┌──────────┐ <── /work-plan (revise)
  │ planned  │
  └────┬─────┘
       │ /work-run
       v
  ┌──────────────────────────────────────┐
  │        executing                     │
  │  (/work-run-loop, /quality-fact-check ok) │
  └────────────┬─────────────────────────┘
               │ auto-chain
               v
  ┌──────────────────────────────────────┐
  │        polishing                     │
  └────────────┬─────────────────────────┘
               │ /work-polish done
               v
  ┌──────────────────────────────────────┐
  │        complete                      │──── /work-plan (new cycle)
  └──────────────────────────────────────┘

  Quality skills bypass the stage machine entirely.
  /work-stop-loop is always allowed.
```

### Fresh Context Architecture

Work-run-loop spawns a new `general-purpose` agent per iteration instead of continuing in-context. This prevents context rot — each iteration starts clean with only the structured state file as memory. Same pattern applies to review and fix agents in work-run.

---

## Design Influences

| Tenet                         | Inspiration                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Plan before code              | Structured planning as a prerequisite to execution — brainstorm → plan → implement                  |
| RED-GREEN-REFACTOR            | Kent Beck's TDD — no production code without a failing test first                                   |
| Evidence before claims        | Scientific method applied to completion — output proves the claim, not the agent's word             |
| Entropy is garbage collection | Systems entropy compounds when agents replicate patterns — good and bad — without curation          |
| Defense-in-depth              | Harness engineering — hooks catch common agent failure modes without blocking the workflow          |
| Context rot prevention        | Fresh agent per iteration — long-running agents accumulate stale assumptions                        |
| Orchestrate, don't implement  | CTO mental model — delegate everything, review everything, write nothing                            |
| Adaptive dispatch             | Not all tasks are alike — subagents for parallel, iterative for stubborn, collaborative for coupled |

dp-cto v3.0 evolved from prompt-based skill enforcement to hook-based mechanical enforcement — native quality skills, beads-based scheduling, and harness engineering hooks.

---

## Repository Structure

```
dotplugins/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace registry (plugins + versions)
├── plugins/
│   └── dp-cto/
│       ├── .claude-plugin/
│       │   └── plugin.json       # Plugin metadata + version
│       ├── hooks/
│       │   ├── hooks.json        # Hook definitions
│       │   ├── session-start.sh  # Injects enforcement context + beads prime
│       │   ├── session-cleanup.sh
│       │   ├── intercept-orchestration.sh  # PreToolUse: stage enforcement + skill filtering
│       │   ├── stage-transition.sh         # PostToolUse: stage machine advances
│       │   ├── completion-gate.sh          # PostToolUse: completion claim verification
│       │   ├── lib-stage.sh               # Shared stage read/write helpers
│       │   └── research-validator.sh      # PostToolUse: verification checklists
│       └── skills/
│           ├── work-plan/SKILL.md
│           ├── work-run/SKILL.md
│           ├── work-run-loop/SKILL.md
│           ├── work-stop-loop/SKILL.md
│           ├── work-polish/SKILL.md
│           ├── quality-fact-check/SKILL.md
│           ├── quality-red-green-refactor/SKILL.md
│           ├── quality-deep-debug/SKILL.md
│           ├── quality-check-done/SKILL.md
│           ├── quality-code-review/SKILL.md
│           └── quality-sweep-code/SKILL.md
├── tests/                        # Vitest hook contract + schema tests
├── scripts/
│   ├── validate.sh               # Full plugin validation suite
│   └── release.sh                # Version bump + publish
└── package.json
```

## Development

```bash
pnpm test            # Run hook contract + schema tests (vitest)
pnpm run lint        # Lint tests/ with oxlint
pnpm run fmt:check   # Check formatting with oxfmt
pnpm run check       # All of the above in parallel (turbo)
pnpm run validate    # check + shell-based plugin validation
```

### Releasing

```bash
pnpm run release -- patch   # patch | minor | major | x.y.z
```

Bumps version in `marketplace.json` and `plugin.json`, validates, commits, and pushes. Requires clean working tree on `main`.

## License

ISC
