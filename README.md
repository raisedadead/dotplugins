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
/dp-cto:start   →  You describe the feature. Plugin brainstorms approaches,
                    asks clarifying questions, writes a plan with tasks.

/dp-cto:execute →  Plugin dispatches agents in parallel to implement each task.
                    Reviews their work. Fix loop if needed. Commit checkpoints.

/dp-cto:polish  →  Auto-chained after execute. 6 specialist review agents
                    (security, dead code, test gaps, linting, perf, docs)
                    find issues, auto-fix critical/warning, you pick suggestions.
```

```
                  writes        dispatches       fixes
                   plan           agents        findings
  /dp-cto:start ────────> /dp-cto:execute ────────> /dp-cto:polish ────────> Done
       ^                                                                       │
       └────────────────────── new feature ────────────────────────────────────┘
```

### Quality Skills (use anytime)

| Skill                 | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `/dp-cto:tdd`         | Enforces RED-GREEN-REFACTOR. No code without failing test. |
| `/dp-cto:debug`       | 4-phase root cause investigation before any fix attempt.   |
| `/dp-cto:verify-done` | Blocks completion claims without test output evidence.     |
| `/dp-cto:review`      | Dispatches review agent, processes feedback with rigor.    |
| `/dp-cto:sweep`       | Finds and fixes dead code, naming drift, stale comments.   |

### Escape Hatches

| Skill                  | When                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `/dp-cto:ralph`        | Task keeps failing — iterative loop with fresh agent each attempt + quality gate |
| `/dp-cto:ralph-cancel` | Stop an active ralph loop                                                        |
| `/dp-cto:verify`       | Deep-validate research findings claim by claim                                   |

### What Happens Behind the Scenes

Hooks enforce discipline automatically — you never invoke them:

- **Stage machine** prevents running execute before start, or polish before execute
- **Completion gate** warns when agents claim "tests pass" without showing test output
- **Research validator** injects verification checklists after web searches and MCP calls
- **Session recovery** detects interrupted workflows and offers to resume next session
- **Superpowers blocked** — dp-cto replaces all superpowers skills natively; the old ones are denied

### Mental Model

You are the CTO. You never write code or review code yourself. You:

1. Describe what to build
2. Approve the plan
3. Watch agents implement
4. Approve commit checkpoints
5. Pick which suggestions to apply in polish

---

## Architecture

### Adaptive Dispatch

Execute classifies each task and picks the right primitive:

| Classification        | Primitive                    | When                                        |
| --------------------- | ---------------------------- | ------------------------------------------- |
| `[subagent]`          | `Agent(run_in_background)`   | Independent work, parallelizable            |
| `[subagent:isolated]` | `Agent(isolation: worktree)` | Needs filesystem isolation from other tasks |
| `[iterative]`         | `/dp-cto:ralph`              | Needs quality gate + multiple attempts      |
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
  │               Tier 1 DENY  — superpowers skills ──> block           │
  │               Tier 2 WARN  — orchestration-adjacent ──> allow+warn  │
  │               Tier 3 PASS  — everything else ──> allow              │
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
       │ /start
       v
  ┌──────────┐
  │ planning │
  └────┬─────┘
       │ plan written
       v
  ┌──────────┐ <── /start (revise)
  │ planned  │
  └────┬─────┘
       │ /execute
       v
  ┌──────────────────────────┐
  │        executing         │
  │  (/ralph, /verify ok)    │
  └────────────┬─────────────┘
               │ auto-chain
               v
  ┌──────────────────────────┐
  │        polishing         │
  └────────────┬─────────────┘
               │ /polish done
               v
  ┌──────────────────────────┐
  │        complete          │──── /start (new cycle)
  └──────────────────────────┘

  Quality skills bypass the stage machine entirely.
  /ralph-cancel is always allowed.
```

### Fresh Context Architecture

Ralph spawns a new `general-purpose` agent per iteration instead of continuing in-context. This prevents context rot — each iteration starts clean with only the structured state file as memory. Same pattern applies to review and fix agents in execute.

---

## Design Influences

| Tenet                         | Inspiration                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Plan before code              | [obra/superpowers](https://github.com/obra/superpowers) — structured planning as a prerequisite to execution |
| RED-GREEN-REFACTOR            | Kent Beck's TDD — no production code without a failing test first                                            |
| Evidence before claims        | Scientific method applied to completion — output proves the claim, not the agent's word                      |
| Entropy is garbage collection | Systems entropy compounds when agents replicate patterns — good and bad — without curation                   |
| Defense-in-depth              | Harness engineering — hooks catch common agent failure modes without blocking the workflow                   |
| Context rot prevention        | Fresh agent per iteration — long-running agents accumulate stale assumptions                                 |
| Orchestrate, don't implement  | CTO mental model — delegate everything, review everything, write nothing                                     |
| Adaptive dispatch             | Not all tasks are alike — subagents for parallel, iterative for stubborn, collaborative for coupled          |

dp-cto v3.0 started as a layer on top of [superpowers](https://github.com/obra/superpowers) and evolved to replace it entirely — native quality skills, beads-based scheduling, and harness engineering hooks made the external dependency unnecessary.

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
│           ├── start/SKILL.md
│           ├── execute/SKILL.md
│           ├── ralph/SKILL.md
│           ├── ralph-cancel/SKILL.md
│           ├── polish/SKILL.md
│           ├── verify/SKILL.md
│           ├── tdd/SKILL.md
│           ├── debug/SKILL.md
│           ├── verify-done/SKILL.md
│           ├── review/SKILL.md
│           └── sweep/SKILL.md
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
