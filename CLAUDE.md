# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal Claude Code plugin marketplace (monorepo). Two plugins:

| Plugin      | Runtime         | Category       | Purpose                                                                                                                                                       |
| ----------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **dp-cto**  | Claude Code CLI | `productivity` | CTO orchestration with beads-based planning, native quality skills, iterative loops, and research validation                                                  |
| **dp-spec** | Claude Code CLI | `productivity` | Spec authoring pipeline — structured discovery, brainstorming, research, tiered document authoring (ADR/RFC/PRD), adversarial review, and agent-ready handoff |

## Commands

Uses `pnpm` scripts with `turbo` for parallel task orchestration:

```bash
pnpm test                              # run vitest hook contract + schema tests
pnpm run lint                          # oxlint on tests/
pnpm run fmt:check                     # oxfmt formatting check
pnpm run check                         # turbo: test + lint + fmt:check in parallel
pnpm run validate                      # check + shell-based plugin validation (scripts/validate.sh)
pnpm run release -- patch              # release all plugins: patch|minor|major|x.y.z
pnpm run release -- dp-spec patch      # release single plugin: <plugin-name> <bump>
pnpm run release -- all patch          # explicit all-plugins release (same as bare bump)
pnpm run version                       # show current plugin version from marketplace.json
```

No build step. Plugins are plain Markdown skills + shell hooks.

## Architecture

```
.claude-plugin/marketplace.json    <- marketplace registry (lists all plugins + versions)
plugins/
  dp-cto/                          <- CTO orchestration plugin
    .claude-plugin/plugin.json     <- plugin metadata + version (synced from marketplace.json)
    hooks/
      hooks.json                   <- hook definitions (SessionStart, PreToolUse, PostToolUse, SessionEnd)
      session-start.sh             <- injects enforcement context + bd prime on session start
      intercept-orchestration.sh   <- PreToolUse hook: stage enforcement for dp-cto skills,
                                      warns on orchestration-adjacent unknowns
      research-validator.sh        <- PostToolUse hook: injects verification checklists
                                      after WebSearch, WebFetch, and MCP tool calls
      completion-gate.sh           <- PostToolUse hook: detects Agent completion claims
                                      without test evidence, injects advisory warning
      stage-transition.sh          <- PostToolUse hook: tracks stage transitions after
                                      dp-cto skill execution
      session-cleanup.sh           <- SessionEnd hook: preserves stage files with ended status
      lib-stage.sh                 <- shared library for stage file read/write/breadcrumb ops
    skills/start/SKILL.md          <- /dp-cto:start brainstorming, planning, beads molecule creation
    skills/execute/SKILL.md        <- /dp-cto:execute adaptive dispatch via bd ready scheduling
    skills/ralph/SKILL.md          <- /dp-cto:ralph subagent-based iterative loop coordinator
    skills/ralph-cancel/SKILL.md   <- /dp-cto:ralph-cancel graceful loop cancellation
    skills/polish/SKILL.md         <- /dp-cto:polish multi-perspective review and polishing
    skills/verify/SKILL.md         <- /dp-cto:verify manual deep-validation of research
    skills/tdd/SKILL.md            <- /dp-cto:tdd test-driven development (RED-GREEN-REFACTOR)
    skills/debug/SKILL.md          <- /dp-cto:debug systematic 4-phase debugging
    skills/verify-done/SKILL.md    <- /dp-cto:verify-done gate function, evidence-before-claims
    skills/review/SKILL.md         <- /dp-cto:review dispatch review agent + process feedback
    skills/sweep/SKILL.md          <- /dp-cto:sweep entropy management and pattern drift detection
  dp-spec/                          <- Spec authoring pipeline plugin
    .claude-plugin/plugin.json     <- plugin metadata + version (synced from marketplace.json)
    hooks/
      hooks.json                   <- hook definitions (SessionStart, PreToolUse, PostToolUse, SessionEnd)
      session-start.sh             <- injects enforcement context + session recovery on start
      intercept-skills.sh          <- PreToolUse hook: stage enforcement for dp-spec skills
      research-validator.sh        <- PostToolUse hook: injects verification checklists
                                      after WebSearch, WebFetch, and MCP tool calls
      stage-transition.sh          <- PostToolUse hook: tracks stage transitions after
                                      dp-spec skill execution
      session-cleanup.sh           <- SessionEnd hook: preserves stage files with ended status
      lib-stage.sh                 <- shared library for stage file read/write/breadcrumb ops
    skills/discover/SKILL.md       <- /dp-spec:discover project discovery, context gathering
    skills/brainstorm/SKILL.md     <- /dp-spec:brainstorm iterative requirements and approach exploration
    skills/research/SKILL.md       <- /dp-spec:research evidence-based validation (pipeline + standalone)
    skills/draft/SKILL.md          <- /dp-spec:draft tiered document authoring (ADR/RFC/PRD)
    skills/challenge/SKILL.md      <- /dp-spec:challenge adversarial review with 5 devil agents
    skills/handoff/SKILL.md        <- /dp-spec:handoff spec-to-tasks decomposition (beads or markdown)
    skills/plan/                   <- /dp-spec:plan shortcut (runs discover + brainstorm)
    references/
      adr-template.md              <- ADR document template
      rfc-template.md              <- RFC document template
      prd-template.md              <- PRD document template
      task-breakdown-template.md   <- Implementation task breakdown template
```

### Key design: dp-cto hook system

The dp-cto plugin uses a multi-hook architecture across all four lifecycle events:

**PreToolUse** (`intercept-orchestration.sh`) — tiered Skill interception:

- **dp-cto skills**: stage enforcement — validates the current workflow stage allows the requested skill (e.g., `execute` requires `planned` stage). Quality skills (`tdd`, `debug`, `verify-done`, `review`, `sweep`) and `ralph-cancel` always pass.
- **Tier 1 WARN**: unknown skills with orchestration-adjacent names get a warning
- **Tier 2 PASS**: everything else passes silently

**PostToolUse** — three hooks:

- `research-validator.sh` — fires on `WebSearch|WebFetch|mcp__.*`, injects verification checklists
- `stage-transition.sh` — fires on `Skill`, tracks dp-cto stage transitions
- `completion-gate.sh` — fires on `Agent`, detects completion claims without test evidence, injects advisory warning (defense-in-depth for `dp-cto:verify-done`)

**SessionStart** (`session-start.sh`) — injects enforcement context, runs `bd prime` for beads context injection, detects recoverable prior sessions.

**SessionEnd** (`session-cleanup.sh`) — preserves stage files with `ended` status for recovery detection.

### Key design: dp-cto:execute adaptive dispatch

`/dp-cto:execute` uses beads-driven adaptive dispatch — `bd ready --json` returns tasks with all dependencies resolved, and execute dispatches them using the right Claude Code primitive:

- **Beads scheduling**: `bd ready --json` replaces manual plan parsing. CTO dispatches whatever is ready, marks done with `bd close {task-id}`, then re-queries `bd ready` to discover newly unblocked tasks.
- **Agent prompt extraction**: What were previously fenced `agent-prompt` blocks in markdown are now stored as beads issue descriptions (written by `/dp-cto:start`). Execute extracts them via `bd show {task-id} --json` and passes them verbatim to Agent calls — execute is a near-mechanical dispatcher.
- **Phase 1 — Subagent dispatch**: `[subagent]` tasks spawn via `Agent(run_in_background=true)` for parallel execution. `[subagent:isolated]` adds `isolation: "worktree"` for filesystem isolation.
- **Phase 2 — Iterative dispatch**: `[iterative]` tasks invoke `/dp-cto:ralph` (sequential foreground subagent loop). No team collision since ralph is subagent-based.
- **Phase 3 — Collaborative dispatch**: `[collaborative]` tasks (rare) use `TeamCreate` + teammates + `SendMessage` for inter-agent coordination. Only phase that creates a team.
- **Review**: Subagent results reviewed via fresh review agents. Fix loop spawns fresh fix agents. After 2 failed fix rounds, mark done with `bd close`, report failure, and suggest user invoke `/dp-cto:ralph` manually.
- **Hands-off execution**: No confirmation pauses during execute. No commit checkpoints, no "ready to integrate" gate. Execute runs autonomously with the stage machine, completion gate, and quality gate as safety nets.

### Key design: dp-cto:ralph iterative loops

`/dp-cto:ralph` provides subagent-based iterative execution:

- Each iteration spawns a fresh `general-purpose` subagent via the Agent tool (no teams, no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates
- No confirmation pause — proceeds automatically with resolved config

**CTO integration** (three points):

- CTO classifies beads tasks as `[subagent]`, `[iterative]`, or `[collaborative]`; `[iterative]` tasks are first dispatched as subagents — if they fail after 2 fix rounds, CTO reports the failure and suggests the user invoke `/dp-cto:ralph` manually
- CTO's review fix loop reports failure after 2 fix attempts and suggests user invoke ralph manually
- ralph reads from active CTO plan when invoked without args

### Key design: dp-cto:polish multi-perspective review

`/dp-cto:polish` adds a post-implementation polishing phase that spawns parallel review agents with configurable lenses:

- **Core lenses** (default): Security, Simplification/Dead Code, Test Coverage Gaps, Linting/Formatting
- **Extended lenses** (opt-in): Performance, Documentation/Comments
- User selects which lenses to run via `AskUserQuestion` (multiSelect)
- Each lens spawns a `general-purpose` agent that reviews only changed files through its specific focus
- Findings are severity-graded: `[CRITICAL]`, `[WARNING]`, `[SUGGESTION]`
- CRITICAL and WARNING findings are auto-fixed by delegated agents; suggestions are user's choice
- Quality gate runs after fixes to verify no regressions

**Workflow integration**:

- Auto-chained after `/dp-cto:execute` completes (execute → polishing → complete)
- Also available standalone from `complete` stage for re-polishing
- State machine stage: `polishing` (between `executing` and `complete`)

### Key design: dp-cto research validation

The dp-cto plugin includes a PostToolUse hook (`research-validator.sh`) that fires after WebSearch, WebFetch, and MCP tool calls. It injects verification checklists prompting the agent to cross-check sources. The `/dp-cto:verify` skill provides manual deep-validation on demand.

### Key design: beads integration

dp-cto v3.0 uses beads (via the `bd` CLI) for plan storage and task scheduling, replacing markdown-based implementation plans:

- **`/dp-cto:start` molecule creation**: After brainstorming and analysis (unchanged), creates a beads epic via `bd create`, child tasks via `bd create --parent`, and dependency edges via `bd dep add`. Analysis content is stored as the epic's body via `bd edit --body`. Agent prompts are stored as task descriptions via `bd edit --body`.
- **`/dp-cto:execute` beads dispatch**: Queries `bd ready --json` for tasks with all blockers resolved, extracts agent prompts from `bd show {task-id} --json`, dispatches agents, and marks completion with `bd close {task-id}`. Re-queries `bd ready` after each round to discover newly unblocked tasks.
- **`bd prime` context injection**: SessionStart hook runs `bd prime` when `bd` is available and `.beads/` exists in the working directory. Injects a compact 1-2k token summary into the session context (instead of the full plan).
- **Graceful degradation**: If `bd` is not installed or no `.beads/` directory exists, beads features are skipped silently. The hooks and skills still function for stage tracking and enforcement.
- **State coexistence**: Beads DB (`.beads/`) handles plan and task state. Stage files (`.claude/dp-cto/`) handle dp-cto's own skill sequencing (start -> execute -> polish). Both coexist.

### Key design: harness engineering hooks

dp-cto v3.0 applies harness engineering patterns — defense-in-depth hooks that catch common agent failure modes:

- **Completion gate** (`completion-gate.sh`): PostToolUse hook on Agent returns. Detects completion claims ("all tests pass", "implementation complete", etc.) that lack test execution evidence (test runner output, pass/fail counts, exit codes). Injects an advisory warning — does NOT block. Defense-in-depth for the `dp-cto:verify-done` skill.
- **Sweep** (`/dp-cto:sweep`): Entropy management skill inspired by the principle "Entropy Management Is Garbage Collection." Agents replicate all patterns they find — good and bad. Sweep spawns parallel drift-detection agents per category (dead code, inconsistent patterns, stale comments, naming violations), severity-grades findings, and auto-fixes critical/warning items via one-shot agents with quality gate verification.

### Key design: native quality skills

dp-cto ships five native quality skills:

- **`dp-cto:tdd`** — Iron law, RED-GREEN-REFACTOR, rationalization prevention
- **`dp-cto:debug`** — 4-phase investigation, 3-fix architecture check
- **`dp-cto:verify-done`** — Gate function, evidence-before-claims (reinforced by completion-gate hook)
- **`dp-cto:review`** — Dispatch review agent + process feedback with technical rigor
- **`dp-cto:sweep`** — Entropy management, pattern drift detection and cleanup

These are side-effect-free quality skills: no stage transitions, always allowed by the hook system regardless of workflow stage.

### Key design: session recovery

Breadcrumb file at `.claude/dp-cto/active.json` tracks the active session:

- Written on `planned` (after start completes), updated to `polishing` (after execute completes), cleared on `complete` (after polish completes)
- SessionStart checks the breadcrumb (fast path), then scans `*.stage.json` for non-terminal states (fallback)
- Multiple orphaned stage files resolved by latest `started_at`
- SessionEnd preserves stage files with `ended` status instead of deleting — enables recovery detection on next session start

### Key design: stage machine

The dp-cto plugin enforces a linear workflow via stage tracking in `.claude/dp-cto/{session}.stage.json`:

```
idle ──→ planning ──→ planned ──→ executing ──→ polishing ──→ complete
 ↑        (start       (start      (execute      (execute       │
 │         running)      done)       running)      done)         │
 └───────────────────────────────────────────────────────────────┘
                           new cycle (start)
```

**Transient states** (`planning`, `executing`, `polishing`): Set by PreToolUse when a skill starts. If interrupted, recovery detects these as non-terminal.

**Resting states** (`idle`, `planned`, `complete`): Set by PostToolUse when a skill completes. Stable between skill invocations.

Side-effect-free skills (`tdd`, `debug`, `verify-done`, `review`, `sweep`) and `ralph-cancel` are allowed from any stage.

### Key design: dp-spec hook system

The dp-spec plugin uses a four-hook architecture matching all lifecycle events:

**PreToolUse** (`intercept-skills.sh`) — dp-spec skill stage enforcement:

- Only intercepts `dp-spec:*` skills — everything else passes silently
- Validates the current workflow stage allows the requested skill (e.g., `draft` requires `researched` stage)
- `dp-spec:research` with `--standalone` flag bypasses stage enforcement (quality skill mode)
- `dp-spec:plan` is treated identically to `dp-spec:discover` (shortcut)
- Writes pre-execution transient stages on allowed transitions (e.g., `discovering`, `brainstorming`, `drafting`)
- Denied skills return a `permissionDecision: "deny"` with a reason explaining the required next step

**PostToolUse** — two hooks:

- `research-validator.sh` — fires on `WebSearch|WebFetch|mcp__.*`, injects verification checklists (same pattern as dp-cto)
- `stage-transition.sh` — fires on `Skill`, advances dp-spec stage machine after skill completion. Standalone research (`--standalone`) skips stage transition.

**SessionStart** (`session-start.sh`) — initializes session to `idle` stage, injects enforcement context listing all dp-spec skills and workflow order, detects recoverable prior sessions via breadcrumb file (fast path) or stage file scan (fallback).

**SessionEnd** (`session-cleanup.sh`) — preserves stage files with `ended` status for recovery detection on next session start.

### Key design: dp-spec stage machine

The dp-spec plugin enforces a linear 12-state workflow via stage tracking in `.claude/dp-spec/{session}.stage.json`:

```
idle ──→ discovering ──→ discovered ──→ brainstorming ──→ brainstormed ──→ researching ──→ researched ──→ drafting ──→ drafted ──→ challenging ──→ challenged ──→ complete
 ↑        (discover/      (discover/     (brainstorm      (brainstorm      (research       (research      (draft        (draft       (challenge      (challenge      │
 │         plan running)    plan done)     running)         done)            running)        done)          running)      done)        running)        done)           │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                        new cycle (plan)
```

**Transient states** (`discovering`, `brainstorming`, `researching`, `drafting`, `challenging`): Set by PreToolUse when a skill starts. If interrupted, recovery detects these as non-terminal.

**Resting states** (`idle`, `discovered`, `brainstormed`, `researched`, `drafted`, `challenged`, `complete`): Set by PostToolUse when a skill completes. Stable between skill invocations.

**Quality skill bypass**: `dp-spec:research` with `--standalone` flag is allowed from any stage — no stage enforcement, no stage transition.

### Key design: dp-spec skills

dp-spec ships 6 skills plus one shortcut:

- **`dp-spec:discover`** — Project discovery. Explores codebase silently (CLAUDE.md, architecture docs, schemas, CI config), then asks focused questions ONE AT A TIME (goal, project type, stakeholders, timeline, constraints). Produces a Discovery Summary with requirements seed. Never proposes solutions.
- **`dp-spec:brainstorm`** — Iterative requirements and approach exploration. Proposes 2-3 named approaches per decision point with tradeoff analysis. Challenges one assumption per round. Maintains a running MoSCoW-tiered requirements summary (Must/Should/Won't Have Yet). Exit requires explicit user satisfaction with the full summary.
- **`dp-spec:research`** — Evidence-based validation. Operates in pipeline mode (after brainstorm, validates decisions) or standalone mode (`--standalone` flag, ad-hoc research from any stage). Extracts 3-7 research questions, investigates with multi-source corroboration, calibrates confidence (High/Medium/Low), detects pivots that contradict brainstorming decisions.
- **`dp-spec:draft`** — Tiered document authoring. User selects ADR (single decision), RFC (full technical design, 14 sections), or PRD (product requirements with user stories). Reads the appropriate reference template, writes section by section with user review at each major group, runs a mandatory devil's advocate pre-check before final approval. Saves as `{TYPE}-<title>.md`.
- **`dp-spec:challenge`** — Adversarial review. Spawns 5 parallel devil agents (Scale, Security, Ops, Simplicity, Dependency) that stress-test the drafted document through their specific lens. Findings are severity-graded (`[CRITICAL]`, `[WARNING]`, `[SUGGESTION]`), deduplicated, and triaged with the user (revise/accept-risk/defer). Runs a mandatory pre-mortem exercise after resolution.
- **`dp-spec:handoff`** — Spec-to-tasks decomposition. Extracts protection boundaries from the spec, decomposes into 5-15 minute agent work units with dispatch tags (`[subagent]`, `[subagent:isolated]`, `[iterative]`, `[collaborative]`), acceptance criteria, and scope boundaries. Generates a beads molecule (if `bd` CLI available) or a structured markdown task breakdown (fallback). Output is agent-ready for `dp-cto:execute`.
- **`dp-spec:plan`** — Shortcut that runs discover + brainstorm as a single invocation. Treated identically to `discover` by the stage machine (enters `discovering` stage).

### Key design: dp-spec reference templates

dp-spec includes four reference templates in `plugins/dp-spec/references/`:

- **`adr-template.md`** — Lightweight Architecture Decision Record (one page). Sections: Context, Decision, Consequences, Alternatives Considered, References.
- **`rfc-template.md`** — Full technical design document (14 sections). Includes mandatory Protection Section (stable interfaces, invariants, migration constraints) and Alternatives Considered.
- **`prd-template.md`** — Product requirements document. Includes mandatory Agent-Ready Task Format section that bridges PRD to implementation. User stories use Given/When/Then acceptance criteria with MoSCoW tiering (P0/P1/P2).
- **`task-breakdown-template.md`** — Implementation task breakdown format for handoff. Tasks grouped into Critical Path and Parallelizable Work, each with dispatch type tags, complexity sizing (S/M/L), and quality gate specifications.

### Key design: dp-spec session recovery

Breadcrumb file at `.claude/dp-spec/active.json` tracks the active session:

- Written on each resting state transition (`discovered`, `brainstormed`, `researched`, `drafted`, `challenged`), cleared on `complete` (after handoff)
- SessionStart checks the breadcrumb (fast path), then scans `*.stage.json` for non-terminal states (fallback)
- Multiple orphaned stage files resolved by latest `started_at`
- SessionEnd preserves stage files with `ended` status instead of deleting — enables recovery detection on next session start
- Non-terminal states for recovery detection: `discovering`, `discovered`, `brainstorming`, `brainstormed`, `researching`, `researched`, `drafting`, `drafted`, `challenging`, `challenged`

### Key design: dp-spec and dp-cto integration

dp-spec and dp-cto are complementary plugins with a designed handoff point:

- dp-spec handles the **specification phase**: discover -> brainstorm -> research -> draft -> challenge -> handoff
- dp-cto handles the **implementation phase**: start -> execute -> polish
- `/dp-spec:handoff` produces output (beads molecule or markdown task breakdown) that `/dp-cto:execute` can dispatch directly
- Both plugins use independent stage machines (`.claude/dp-spec/` and `.claude/dp-cto/`) — no cross-plugin state interference
- Both plugins share the same hook patterns (research-validator, session recovery, stage tracking) but with independent implementations

## Prerequisites

| Dependency       | Required      | If Missing                                                                                                                                                                                                                                     |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash`           | Yes (runtime) | Hooks cannot execute at all (both plugins)                                                                                                                                                                                                     |
| `jq`             | Yes (runtime) | All hooks fail open — no stage tracking, no enforcement, no research validation, no completion gate (both plugins)                                                                                                                             |
| `bd` CLI (beads) | No (optional) | dp-cto: `/dp-cto:start` cannot create molecules, `/dp-cto:execute` cannot use `bd ready` scheduling, `bd prime` context injection disabled. dp-spec: `/dp-spec:handoff` falls back to markdown task breakdown instead of beads molecule output |
| `shellcheck`     | No (dev only) | `pnpm run validate` fails but plugins function normally at runtime                                                                                                                                                                             |

All hooks in both plugins are designed to **fail open** — if a dependency is missing, the hook exits 0 without blocking the user. This means each plugin degrades gracefully but silently: stage enforcement, research validation, and completion gates all become inactive without `jq`.

## Versioning and Releases

- **Per-plugin versioning:** Each plugin has its own version in `marketplace.json` (plugins array) and its own `plugin.json`. These two must match per plugin. The `marketplace.json` `metadata.version` is bumped only during all-plugins releases.
- **Three release modes:**
  - `pnpm run release -- <bump>` — bumps all plugins + metadata version
  - `pnpm run release -- all <bump>` — explicit all-plugins bump (same as above)
  - `pnpm run release -- <plugin-name> <bump>` — bumps only the named plugin (e.g., `pnpm run release -- dp-spec patch`)
- `pnpm run validate` runs: turbo checks (test + lint + fmt:check), then shell-based validation (JSON validity, version sync across all plugins, plugin directory existence, SKILL.md frontmatter name vs directory, shellcheck on all plugin hook scripts, hooks.json script cross-reference, and `claude plugin validate` for each plugin).
- Release script requires clean working tree on main branch.
- CI runs `pnpm run validate` on every push to `main` and on PRs.
- Never edit versions manually — always use `pnpm run release`.

## Marketplace Structure

Follows Anthropic's official marketplace conventions:

- `$schema` — points to Anthropic's marketplace schema for validation
- `metadata` — marketplace-level version, description, and `pluginRoot`
- `tags` — array of strings in marketplace.json per plugin for searchability
- `keywords` — array of strings in plugin.json for discovery
- `category` — in marketplace.json only (NOT in plugin.json — rejected by official validator)

## Gotchas

### General

- `CLAUDE.md` is globally gitignored (`~/.gitignore`) — do not attempt `git add CLAUDE.md`
- `pnpm run release -- <bump>` prompts for confirmation — pipe `echo "y"` for non-interactive use
- Shellcheck runs on `plugins/*/hooks/*.sh` during `pnpm run validate` — all hook scripts must pass `-S warning`
- Plugin skills live in `skills/<name>/SKILL.md` (not `commands/`) — must have YAML frontmatter with `---`
- Per-plugin release (`pnpm run release -- <name> <bump>`) only bumps the named plugin's version — metadata version is unchanged

### dp-cto

- Ralph state files go in `.claude/ralph/` (not `.claude/` root) — session-scoped by timestamp
- dp-cto PostToolUse hook fires on ALL MCP tools (`mcp__.*`) — if this causes noise, narrow the matcher
- Stage files are preserved on SessionEnd (not deleted) — `.claude/dp-cto/active.json` is the recovery breadcrumb
- `bd` CLI must be on `$PATH` for beads features — hooks check `command -v bd` and degrade gracefully if absent
- Completion gate hook fires on ALL Agent returns — may produce advisory warnings on non-implementation agents

### dp-spec

- Stage files are preserved on SessionEnd (not deleted) — `.claude/dp-spec/active.json` is the recovery breadcrumb
- `dp-spec:plan` is a shortcut (discover + brainstorm) — the `skills/plan/` directory exists but has no SKILL.md; the hook system handles routing by treating `plan` identically to `discover`
- `dp-spec:research` has two modes: pipeline mode (stage-enforced, after brainstorm) and standalone mode (`--standalone` flag, bypasses stage enforcement from any stage)
- dp-spec PostToolUse hook fires on ALL MCP tools (`mcp__.*`) — same pattern as dp-cto
- `/dp-spec:challenge` spawns 5 parallel devil agents — requires Agent tool availability; each devil reviews ONLY through its designated lens
- `/dp-spec:handoff` generates beads molecule when `bd` CLI is available, falls back to markdown `TASKS-<title>.md` otherwise — never generates both
- dp-spec and dp-cto use separate stage directories (`.claude/dp-spec/` and `.claude/dp-cto/`) — no cross-plugin state interference

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
claude plugin install dp-spec@dotplugins
```
