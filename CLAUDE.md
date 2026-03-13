# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal Claude Code plugin marketplace (monorepo). One plugin:

| Plugin     | Runtime         | Category       | Purpose                                                                                                      |
| ---------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| **dp-cto** | Claude Code CLI | `productivity` | CTO orchestration with beads-based planning, native quality skills, iterative loops, and research validation |

## Commands

Uses `pnpm` scripts with `turbo` for parallel task orchestration:

```bash
pnpm test                   # run vitest hook contract + schema tests
pnpm run lint               # oxlint on tests/
pnpm run fmt:check          # oxfmt formatting check
pnpm run check              # turbo: test + lint + fmt:check in parallel
pnpm run validate           # check + shell-based plugin validation (scripts/validate.sh)
pnpm run release -- patch   # release: patch|minor|major|x.y.z (scripts/release.sh)
pnpm run version            # show current plugin version from marketplace.json
```

No build step. Plugins are plain Markdown skills + shell hooks.

## Architecture

State is tracked via epic-scoped beads labels (`dp-cto:<stage>`) with a local `cache.json` for fast reads:

```
.claude/dp-cto/cache.json         <- local state cache: {active_epic, stage, sprint, suspended[], synced_at}
.claude-plugin/marketplace.json    <- marketplace registry (lists all plugins + versions)
plugins/
  dp-cto/                          <- CTO orchestration plugin
    .claude-plugin/plugin.json     <- plugin metadata + version (synced from marketplace.json)
    hooks/
      hooks.json                   <- hook definitions (SessionStart, PreToolUse, PostToolUse, SessionEnd)
      session-start.sh             <- injects enforcement context + bd prime on session start
      intercept-orchestration.sh   <- PreToolUse hook: stage enforcement for dp-cto skills,
                                      warns on orchestration-adjacent unknowns
      intercept-bd-init.sh        <- PreToolUse hook: denies bare `bd init` without --stealth flag
      research-validator.sh        <- PostToolUse hook: injects verification checklists
                                      after WebSearch, WebFetch, and MCP tool calls
      completion-gate.sh           <- PostToolUse hook: detects Agent completion claims
                                      without test evidence, injects advisory warning
      stage-transition.sh          <- PostToolUse hook: tracks stage transitions after
                                      dp-cto skill execution
      session-cleanup.sh           <- SessionEnd hook: preserves legacy stage files with ended status
      lib-stage.sh                 <- shared library for legacy stage file read/write/breadcrumb ops
      lib-state.sh                 <- shared library for beads-backed state management (cache r/w,
                                      sync_from_beads, write_state, suspend_state, resume_state)
    skills/work-plan/SKILL.md          <- /dp-cto:work-plan brainstorming, planning, beads molecule creation
    skills/work-run/SKILL.md           <- /dp-cto:work-run adaptive dispatch via bd ready scheduling
    skills/work-run-loop/SKILL.md      <- /dp-cto:work-run-loop subagent-based iterative loop coordinator
    skills/work-stop-loop/SKILL.md     <- /dp-cto:work-stop-loop graceful loop cancellation
    skills/work-polish/SKILL.md        <- /dp-cto:work-polish multi-perspective review and polishing
    skills/quality-fact-check/SKILL.md <- /dp-cto:quality-fact-check manual deep-validation of research
    skills/quality-red-green-refactor/SKILL.md <- /dp-cto:quality-red-green-refactor test-driven development (RED-GREEN-REFACTOR)
    skills/quality-deep-debug/SKILL.md <- /dp-cto:quality-deep-debug systematic 4-phase debugging
    skills/quality-check-done/SKILL.md <- /dp-cto:quality-check-done gate function, evidence-before-claims
    skills/quality-code-review/SKILL.md <- /dp-cto:quality-code-review dispatch review agent + process feedback
    skills/quality-sweep-code/SKILL.md <- /dp-cto:quality-sweep-code entropy management and pattern drift detection
    skills/ops-show-board/SKILL.md     <- /dp-cto:ops-show-board read-only dashboard
    skills/ops-track-sprint/SKILL.md   <- /dp-cto:ops-track-sprint lifecycle management
    skills/work-park/SKILL.md          <- /dp-cto:work-park context-preserving suspension
    skills/work-unpark/SKILL.md        <- /dp-cto:work-unpark restore suspended epic
    skills/ops-clean-slate/SKILL.md    <- /dp-cto:ops-clean-slate sprint-boundary cleanup
```

### Key design: dp-cto hook system

The dp-cto plugin uses a multi-hook architecture across all four lifecycle events. State-aware hooks (`intercept-orchestration.sh`, `stage-transition.sh`, `session-start.sh`) source `lib-state.sh` for beads-backed state management.

**PreToolUse** — two hooks:

`intercept-orchestration.sh` — tiered Skill interception:

- **dp-cto skills**: stage enforcement — validates the current workflow stage allows the requested skill (e.g., `work-run` requires `planned` stage). Quality skills (`quality-red-green-refactor`, `quality-deep-debug`, `quality-check-done`, `quality-code-review`, `quality-sweep-code`, `ops-show-board`, `ops-track-sprint`) and `work-stop-loop` always pass. `work-park` is allowed from `executing` or `polishing`. `work-unpark` is allowed from `idle`.
- **Tier 1 WARN**: unknown skills with orchestration-adjacent names get a warning
- **Tier 2 PASS**: everything else passes silently

`intercept-bd-init.sh` (matcher: `Bash`) — denies `bd init` without `--stealth` flag to prevent polluting project `.gitignore`

**PostToolUse** — three hooks:

- `research-validator.sh` — fires on `WebSearch|WebFetch|mcp__.*`, injects verification checklists
- `stage-transition.sh` — fires on `Skill`, tracks dp-cto stage transitions (including `work-park` -> `suspend_state` and `work-unpark` -> skill-managed restoration)
- `completion-gate.sh` — fires on `Agent`, detects completion claims without test evidence, injects advisory warning (defense-in-depth for `dp-cto:quality-check-done`)

**SessionStart** (`session-start.sh`) — injects enforcement context, syncs state from beads via `sync_from_beads()`, runs `bd prime` for beads context injection (with broadened tag sanitization — strips all XML-like tags from `bd prime` output), detects recoverable prior sessions, and scans for orphaned in-progress tasks when resuming an `executing` or `polishing` epic.

**SessionEnd** (`session-cleanup.sh`) — no-op in v4.0. State lives on beads epics, synced in real-time.

### Key design: dp-cto:work-run adaptive dispatch

`/dp-cto:work-run` uses beads-driven adaptive dispatch — `bd ready --json` returns tasks with all dependencies resolved, and work-run dispatches them using the right Claude Code primitive:

- **Beads scheduling**: `bd ready --json` replaces manual plan parsing. CTO dispatches whatever is ready, marks done with `bd close {task-id}`, then re-queries `bd ready` to discover newly unblocked tasks.
- **Agent prompt extraction**: What were previously fenced `agent-prompt` blocks in markdown are now stored as beads issue descriptions (written by `/dp-cto:work-plan`). Work-run extracts them via `bd show {task-id} --json` and passes them verbatim to Agent calls — work-run is a near-mechanical dispatcher.
- **Agent identity labels**: On dispatch: `bd label add {task-id} "agent:dispatched"`. On completion: swap to `agent:done`. On failure: swap to `agent:failed`. Labels use remove-before-add to prevent stacking. Supplements (not replaces) the existing `bd comments add` dispatch/outcome protocol.
- **Round checkpoints**: After each dispatch round completes, CTO queries `bd list --parent {epic-id} --json` and emits a progress summary: `{done}/{total} tasks done, {running} running, {ready} ready. {failed} failed.`
- **Circuit breaker**: If >50% of agents in a dispatch round fail, CTO pauses with `AskUserQuestion` offering three options: continue, re-dispatch failed tasks, or stop execution.
- **File-change injection**: Between rounds, CTO collects modified files from completed agents, matches them against downstream task scopes, and prepends `## Upstream Changes` context to downstream prompts when overlap exists. Uses a round-baseline SHA (`git rev-parse HEAD` before each round) for reliable diff references.
- **Phase 1 — Subagent dispatch**: `[subagent]` tasks spawn via `Agent(run_in_background=true)` for parallel execution. `[subagent:isolated]` adds `isolation: "worktree"` for filesystem isolation.
- **Phase 2 — Iterative dispatch**: `[iterative]` tasks invoke `/dp-cto:work-run-loop` (sequential foreground subagent loop). No team collision since work-run-loop is subagent-based.
- **Phase 3 — Collaborative dispatch**: `[collaborative]` tasks (rare) use `TeamCreate` + teammates + `SendMessage` for inter-agent coordination. Only phase that creates a team.
- **Review**: Subagent results reviewed via fresh review agents. Fix loop spawns fresh fix agents. After 2 failed fix rounds, mark done with `bd close`, report failure, and suggest user invoke `/dp-cto:work-run-loop` manually.
- **Hands-off execution**: No confirmation pauses during work-run. No commit checkpoints, no "ready to integrate" gate. Work-run runs autonomously with the stage machine, completion gate, and quality gate as safety nets.

### Key design: dp-cto:work-run-loop iterative loops

`/dp-cto:work-run-loop` provides subagent-based iterative execution:

- Each iteration spawns a fresh `general-purpose` subagent via the Agent tool (no teams, no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations, wrapped with `timeout 300` (exit code 124 = gate timeout, treated as failure)
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates
- No confirmation pause — proceeds automatically with resolved config
- **Crash detection** (Step 0d): scans `.claude/ralph/` for orphaned state files with `status: running` from prior sessions. Uses `AskUserQuestion` to offer resume or abandon. Abandoned files get `status: abandoned` (not deleted).
- **State file validation** (Step 2a): validates YAML frontmatter integrity before each iteration. On corruption, warns and re-creates from the `# Task` section or original prompt.
- **Quality gate timeout** (Step 2d): wraps gate commands with `timeout 300`. Exit code 124 handled explicitly. Consecutive gate failures tracked — warns user after 3.

**CTO integration** (three points):

- CTO classifies beads tasks as `[subagent]`, `[iterative]`, or `[collaborative]`; `[iterative]` tasks are first dispatched as subagents — if they fail after 2 fix rounds, CTO reports the failure and suggests the user invoke `/dp-cto:work-run-loop` manually
- CTO's review fix loop reports failure after 2 fix attempts and suggests user invoke work-run-loop manually
- work-run-loop reads from active CTO plan when invoked without args

### Key design: dp-cto:work-polish multi-perspective review

`/dp-cto:work-polish` adds a post-implementation polishing phase that spawns parallel review agents with configurable lenses:

- **Core lenses** (default): Security, Simplification/Dead Code, Test Coverage Gaps, Linting/Formatting
- **Extended lenses** (opt-in): Performance, Documentation/Comments
- User selects which lenses to run via `AskUserQuestion` (multiSelect)
- Each lens spawns a `general-purpose` agent that reviews only changed files through its specific focus
- Findings are severity-graded: `[CRITICAL]`, `[WARNING]`, `[SUGGESTION]`
- CRITICAL and WARNING findings are auto-fixed by delegated agents; suggestions are user's choice
- Quality gate runs after fixes to verify no regressions

**Workflow integration**:

- After `/dp-cto:work-run` completes, the stage transitions to `polishing` — the user must manually invoke `/dp-cto:work-polish` to run the polishing phase (the hook sets the stage but does not auto-invoke the skill)
- Also available standalone from `complete` stage for re-polishing
- State machine stage: `polishing` (between `executing` and `complete`)

### Key design: dp-cto research validation

The dp-cto plugin includes a PostToolUse hook (`research-validator.sh`) that fires after WebSearch, WebFetch, and MCP tool calls. It injects verification checklists prompting the agent to cross-check sources. The `/dp-cto:quality-fact-check` skill provides manual deep-validation on demand.

### Key design: agent protocol

dp-cto uses `bd comments add` and `bd label add` to track structured dispatch and outcome data on beads issues:

- **Task-level labels**: `agent:dispatched` (running), `agent:done` (completed), `agent:failed` (failed). Labels use remove-before-add to prevent stacking. Queryable via `bd query "label=agent:*"`.
- **Task-level comments**: dispatch comments record which agent was assigned and the prompt used; outcome comments record pass/fail, test evidence, and any fix attempts.
- **Epic-level comments**: review comments record review agent findings; fix comments record fix agent results per round.

This provides a persistent audit trail per-epic that survives session boundaries and enables `/dp-cto:ops-show-board` to display progress via label-based queries (not comment parsing).

### Key design: sprint framework

`/dp-cto:ops-track-sprint` manages sprint lifecycle via `bd` labels:

- **Plan**: Create a sprint, assign epics to it, set sprint goals
- **Review**: Check sprint progress, surface blocked/at-risk epics
- **Retro**: Retrospective — summarize completed vs. carried-over work, capture learnings
- **Close**: Close the sprint, carry over incomplete epics to next sprint

Sprint state is stored as beads labels (`sprint:<name>`) on epics. The `cache.json` `sprint` field tracks the active sprint name. Sprint is a quality skill — no stage transitions, allowed from any stage.

### Key design: beads integration

dp-cto v4.0 uses beads (via the `bd` CLI) for plan storage, task scheduling, and stage state, replacing both markdown plans and per-session stage files:

- **`/dp-cto:work-plan` molecule creation**: After brainstorming and analysis (unchanged), creates a beads epic via `bd create`, child tasks via `bd create --parent`, and dependency edges via `bd dep add`. Analysis content is stored as the epic's body via `bd edit --body`. Agent prompts are stored as task descriptions via `bd edit --body`.
- **`/dp-cto:work-run` beads dispatch**: Queries `bd ready --json` for tasks with all blockers resolved, extracts agent prompts from `bd show {task-id} --json`, dispatches agents, and marks completion with `bd close {task-id}`. Re-queries `bd ready` after each round to discover newly unblocked tasks.
- **`bd prime` context injection**: SessionStart hook runs `bd prime` when `bd` is available and `.beads/` exists in the working directory. Injects a compact 1-2k token summary into the session context (instead of the full plan).
- **Graceful degradation**: If `bd` is not installed or no `.beads/` directory exists, beads features are skipped silently. Hooks still fail open, but orchestration skills (work-plan, work-run, work-polish, ops-track-sprint, work-park, work-unpark) are disabled without `bd`.
- **Unified state**: Beads labels (`dp-cto:<stage>`) are the source of truth for stage state. Local `cache.json` (`.claude/dp-cto/cache.json`) is synced from beads on session start and updated in real-time by hooks. No per-session stage files.

### Key design: harness engineering hooks

dp-cto v4.0 applies harness engineering patterns — defense-in-depth hooks that catch common agent failure modes:

- **Completion gate** (`completion-gate.sh`): PostToolUse hook on Agent returns. Detects completion claims ("all tests pass", "implementation complete", etc.) that lack test execution evidence (test runner output, pass/fail counts, exit codes). Injects an advisory warning — does NOT block. Defense-in-depth for the `dp-cto:quality-check-done` skill.
- **Sweep** (`/dp-cto:quality-sweep-code`): Entropy management skill inspired by the principle "Entropy Management Is Garbage Collection." Agents replicate all patterns they find — good and bad. Sweep spawns parallel drift-detection agents per category (dead code, inconsistent patterns, stale comments, naming violations), severity-grades findings, and auto-fixes critical/warning items via one-shot agents with quality gate verification.

### Key design: native quality skills

dp-cto ships seven native quality skills:

- **`dp-cto:quality-red-green-refactor`** — Iron law, RED-GREEN-REFACTOR, rationalization prevention
- **`dp-cto:quality-deep-debug`** — 4-phase investigation, 3-fix architecture check
- **`dp-cto:quality-check-done`** — Gate function, evidence-before-claims (reinforced by completion-gate hook)
- **`dp-cto:quality-code-review`** — Dispatch review agent + process feedback with technical rigor
- **`dp-cto:quality-sweep-code`** — Entropy management, pattern drift detection and cleanup
- **`dp-cto:ops-show-board`** — Read-only project dashboard (epic status, task progress, blockers)
- **`dp-cto:ops-track-sprint`** — Sprint lifecycle management (Plan/Review/Retro/Close)

These are side-effect-free quality skills: no stage transitions, always allowed by the hook system regardless of workflow stage.

### Key design: session recovery

Recovery is primarily via beads query (`bd query "label=dp-cto:*"`) and `sync_from_beads()` in `lib-state.sh`:

- SessionStart calls `sync_from_beads()` which queries beads for epics with `dp-cto:*` labels and populates `cache.json`
- Epics in non-terminal stages (`planning`, `planned`, `executing`, `polishing`) are detected as recoverable
- Suspended epics (label `dp-cto:suspended`) are tracked in the `cache.json` `suspended[]` array
- **Orphan detection**: when resuming an `executing` or `polishing` epic, scans for in-progress tasks via `bd list --parent {epic-id} --status in-progress --json`. Injects actionable context (task IDs, titles, max 5 with overflow count) pointing to `/dp-cto:ops-show-board` and `/dp-cto:work-run`
- Breadcrumb file at `.claude/dp-cto/active.json` still exists as a fast-path fallback, with legacy `*.stage.json` scan as final fallback
- `cache.json` is the primary local state file, synced from beads on each session start

### Key design: stage machine

The dp-cto plugin enforces a linear workflow via epic-scoped beads labels (`dp-cto:<stage>`) cached locally in `cache.json`:

```
idle ──→ planning ──→ planned ──→ executing ──→ polishing ──→ complete
 ↑        (work-plan   (work-plan   (work-run    (work-run      │
 │         running)      done)       running)      done)         │
 └───────────────────────────────────────────────────────────────┘
                           new cycle (work-plan)

executing ──→ suspended ──→ executing   (via work-park → work-unpark)
polishing ──→ suspended ──→ polishing
```

**Transient states** (`planning`, `executing`, `polishing`): Set by PreToolUse when a skill starts. If interrupted, recovery detects these as non-terminal.

**Resting states** (`idle`, `planned`, `complete`, `suspended`): Set by PostToolUse when a skill completes. Stable between skill invocations. `suspended` is entered via `/dp-cto:work-park` and exited via `/dp-cto:work-unpark` (which restores the epic to its pre-suspension stage).

Side-effect-free skills (`quality-red-green-refactor`, `quality-deep-debug`, `quality-check-done`, `quality-code-review`, `quality-sweep-code`, `ops-show-board`, `ops-track-sprint`) and `work-stop-loop` are allowed from any stage. `ops-clean-slate` is also stage-unrestricted but has side effects (cache deletion, epic closure, label cleanup).

## Prerequisites

| Dependency       | Required                              | If Missing                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash`           | Yes (runtime)                         | Hooks cannot execute at all                                                                                                                                                                                                                                                                                                                                                                          |
| `jq`             | Yes (runtime)                         | All hooks fail open — no stage tracking, no enforcement, no research validation, no completion gate                                                                                                                                                                                                                                                                                                  |
| `bd` CLI (beads) | Yes (required for full functionality) | Hooks degrade gracefully — orchestration skills (`work-plan`, `work-run`, `work-polish`, `ops-track-sprint`, `work-park`, `work-unpark`) disabled without `bd`. Quality skills (`quality-red-green-refactor`, `quality-deep-debug`, `quality-check-done`, `quality-code-review`, `quality-sweep-code`, `ops-show-board`, `ops-clean-slate`) remain available. `bd prime` context injection disabled. |
| `shellcheck`     | No (dev only)                         | `pnpm run validate` fails but plugin functions normally at runtime                                                                                                                                                                                                                                                                                                                                   |

All hooks are designed to **fail open** — if a dependency is missing, the hook exits 0 without blocking the user. This means the plugin degrades gracefully but silently: stage enforcement, research validation, and completion gates all become inactive without `jq`.

## Versioning and Releases

- **Versions in three places, kept in sync:** `marketplace.json` plugins array, `marketplace.json` metadata, and each `plugin.json`. All must match.
- `pnpm run release -- <bump>` validates current state, bumps all version fields, re-validates, commits, and pushes. No tags, no GitHub releases — version in `plugin.json` is what Claude Code uses for update detection.
- `pnpm run validate` runs: turbo checks (test + lint + fmt:check), then shell-based validation (JSON validity, version sync, plugin directory existence, SKILL.md frontmatter name vs directory, shellcheck, hooks.json script cross-reference, and `claude plugin validate`).
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

- `CLAUDE.md` is globally gitignored (`~/.gitignore`) — do not attempt `git add CLAUDE.md`
- `pnpm run release -- <bump>` prompts for confirmation — pipe `echo "y"` for non-interactive use
- Shellcheck runs on `plugins/*/hooks/*.sh` during `pnpm run validate` — all hook scripts must pass `-S warning`
- Plugin skills live in `skills/<name>/SKILL.md` (not `commands/`) — must have YAML frontmatter with `---`
- Work-run-loop state files go in `.claude/ralph/` (not `.claude/` root) — session-scoped by timestamp
- dp-cto PostToolUse hook fires on ALL MCP tools (`mcp__.*`) — if this causes noise, narrow the matcher
- `cache.json` (`.claude/dp-cto/cache.json`) is the local state file, not per-session — one file per project, synced from beads on session start
- `.claude/dp-cto/active.json` breadcrumb still exists as a recovery fast-path fallback
- `bd` CLI must be on `$PATH` for orchestration skills — hooks check `command -v bd` and degrade gracefully if absent
- `ops-show-board` and `ops-track-sprint` are quality skills (side-effect-free, allowed from any stage)
- Completion gate hook fires on ALL Agent returns — may produce advisory warnings on non-implementation agents

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```
