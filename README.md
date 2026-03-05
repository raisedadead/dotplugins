# dotplugins

A plugin marketplace for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — orchestration, iterative development loops, and automated research validation.

## Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```

---

## dp-cto — CTO Orchestration Plugin

A CTO-style orchestration layer that sits on top of [superpowers](https://github.com/obra/superpowers). Superpowers handles individual contributor skills (TDD, debugging, code review); dp-cto handles planning, parallel execution, and iterative automation.

### Skills

| Skill                  | Purpose                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/dp-cto:start`        | Brainstorm approaches, write an implementation plan to `.claude/plans/`                                                       |
| `/dp-cto:execute`      | Execute a plan with [Agent Teams](https://docs.anthropic.com/en/docs/claude-code/agent-teams) and optional worktree isolation |
| `/dp-cto:ralph`        | Teammate-based iterative loop — fresh agent context per iteration                                                             |
| `/dp-cto:ralph-cancel` | Cancel an active ralph loop                                                                                                   |
| `/dp-cto:polish`       | Multi-perspective code review with configurable lenses                                                                        |
| `/dp-cto:verify`       | Manual deep-validation of research findings                                                                                   |

### Workflow

The standard development cycle:

```
                  writes        dispatches       fixes
                   plan           agents        findings
  /dp-cto:start ────────> /dp-cto:execute ────────> /dp-cto:polish ────────> Complete
       ^                                                                        │
       └────────────────────── new feature ─────────────────────────────────────┘
```

### Stage Enforcement

Every session follows a strict state machine. The plugin tracks the current stage and blocks out-of-order skill invocations:

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
  │ planned  │ ──────────────────┐
  └────┬─────┘                   │
       │ /execute                │
       v                         │
  ┌──────────────────────┐       │
  │      executing       │       │
  │ (/ralph, /verify ok) │       │
  └──────────┬───────────┘       │
             │ exec complete     │
             v                   │
  ┌──────────────────────┐       │
  │      polishing       │       │
  └──────────┬───────────┘       │
             │ /polish done      │
             v                   │
  ┌──────────────────────┐       │
  │      complete        │       │
  └──────────┬───────────┘       │
             │ /start (new cycle)│
             └───────────────────┘

  /ralph-cancel is always allowed regardless of stage.
```

### Hook System

Four lifecycle hooks drive the plugin's behavior:

```
  ┌─ SessionStart ────────────────────────────────────────────────────────┐
  │  Inject enforcement context (stage machine rules, skill list)         │
  └───────────────────────────────────────────────────────────────────────┘

  ┌─ PreToolUse (on Skill calls) ─────────────────────────────────────────┐
  │                                                                       │
  │   Skill invoked                                                       │
  │       │                                                               │
  │       ├── dp-cto:* skill? ──yes──> Stage valid? ──yes──> ALLOW        │
  │       │                                │                              │
  │       │                               no ──> DENY (with reason)       │
  │       │                                                               │
  │       └── other skill? ──> Tiered filtering:                          │
  │               Tier 1 DENY  — orchestration skills ──> block           │
  │               Tier 2 PASS  — quality skills ──> allow                 │
  │               Tier 3 WARN  — orchestration-adjacent ──> allow + warn  │
  │               Tier 4 PASS  — everything else ──> allow                │
  │                                                                       │
  └───────────────────────────────────────────────────────────────────────┘

  ┌─ PostToolUse ────────────────────────────────────────────────────────┐
  │  After WebSearch / WebFetch / MCP  -->  inject verification checklist│
  │  After dp-cto Skill completion     -->  advance stage machine       │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ SessionEnd ──────────────────────────────────────────────────────────┐
  │  Clean up session state files                                         │
  └───────────────────────────────────────────────────────────────────────┘
```

### Tiered Skill Interception

The PreToolUse hook classifies every `Skill` call through four tiers:

| Tier         | Action                     | Skills                                                                                                                                                                                   |
| ------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Deny** | Block + redirect to dp-cto | `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch`, `brainstorming`, `writing-plans`, `ralph-loop` |
| **2 — Pass** | Allow through              | `test-driven-development`, `requesting-code-review`, `receiving-code-review`, `systematic-debugging`, `verification-before-completion`, `writing-skills`, `using-superpowers`            |
| **3 — Warn** | Allow with warning         | Unknown skills matching `*parallel*`, `*dispatch*`, `*orchestrat*`, `*worktree*`, `*subagent*`                                                                                           |
| **4 — Pass** | Silent pass-through        | Everything else                                                                                                                                                                          |

### Ralph: Iterative Loops

`/dp-cto:ralph` replaces the upstream `ralph-loop` with a Teammates-based architecture:

- Each iteration spawns a fresh `general-purpose` agent (prevents context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md`
- Configurable quality gates run between iterations
- Smart defaults: infers prompt from active plan, detects project toolchain for gates

```
/dp-cto:ralph "Fix all lint errors" --max-iterations 5 --quality-gate "pnpm run lint"
```

### Polish: Multi-Perspective Review

`/dp-cto:polish` spawns parallel review agents, each with a specific lens:

| Lens           | Focus                                        |
| -------------- | -------------------------------------------- |
| Security       | Vulnerabilities, injection, auth issues      |
| Simplification | Dead code, unnecessary complexity            |
| Test Coverage  | Gaps in test coverage                        |
| Linting        | Formatting and style violations              |
| Performance    | Bottlenecks, inefficient patterns _(opt-in)_ |
| Documentation  | Missing or stale docs _(opt-in)_             |

Findings are severity-graded (`[CRITICAL]`, `[WARNING]`, `[SUGGESTION]`). Critical and warning findings are auto-fixed; suggestions are the user's choice.

### Research Validation

A PostToolUse hook fires after every `WebSearch`, `WebFetch`, and MCP tool call, injecting a verification checklist that prompts the agent to cross-check sources. `/dp-cto:verify` provides on-demand deep-validation for research-heavy tasks.

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
│       │   ├── session-start.sh  # Injects enforcement context
│       │   ├── session-cleanup.sh
│       │   ├── intercept-orchestration.sh  # PreToolUse: tiered skill filtering
│       │   ├── stage-transition.sh         # PostToolUse: stage machine advances
│       │   ├── lib-stage.sh               # Shared stage read/write helpers
│       │   └── research-validator.sh      # PostToolUse: verification checklists
│       └── skills/
│           ├── start/SKILL.md
│           ├── execute/SKILL.md
│           ├── ralph/SKILL.md
│           ├── ralph-cancel/SKILL.md
│           ├── polish/SKILL.md
│           └── verify/SKILL.md
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
