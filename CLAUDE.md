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

```
.claude-plugin/marketplace.json    <- marketplace registry (lists all plugins + versions)
plugins/
  dp-cto/                          <- CTO orchestration plugin
    .claude-plugin/plugin.json     <- plugin metadata + version (synced from marketplace.json)
    hooks/
      hooks.json                   <- hook definitions (SessionStart, PreToolUse, PostToolUse, SessionEnd)
      session-start.sh             <- injects enforcement context + bd prime on session start
      intercept-orchestration.sh   <- PreToolUse hook: stage enforcement for dp-cto skills,
                                      denies all superpowers skills, warns on unknown
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
```

### Key design: dp-cto hook system

The dp-cto plugin uses a multi-hook architecture across all four lifecycle events:

**PreToolUse** (`intercept-orchestration.sh`) — tiered Skill interception:

- **dp-cto skills**: stage enforcement — validates the current workflow stage allows the requested skill (e.g., `execute` requires `planned` stage). Quality skills (`tdd`, `debug`, `verify-done`, `review`, `sweep`) and `ralph-cancel` always pass.
- **Tier 1 DENY**: ALL superpowers skills (orchestration + quality + meta) — dp-cto v3.0 replaces all superpowers functionality natively. Full list: `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch`, `ralph-loop`, `brainstorming`, `writing-plans`, `test-driven-development`, `requesting-code-review`, `receiving-code-review`, `systematic-debugging`, `verification-before-completion`, `writing-skills`, `using-superpowers`.
- **Tier 3 WARN**: unknown skills with orchestration-adjacent names get a warning
- **Tier 4 PASS**: everything else passes silently

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
- **Commit checkpoints**: After each task batch passes review, CTO asks user if they want to commit progress.
- **Confirmation points**: Only "Ready to integrate" pause. No isolation question, no "ready to provision" pause.

### Key design: dp-cto:ralph iterative loops

`/dp-cto:ralph` provides subagent-based iterative execution:

- Each iteration spawns a fresh `general-purpose` subagent via the Agent tool (no teams, no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates
- No confirmation pause — proceeds automatically with resolved config

**CTO integration** (three points):

- CTO classifies beads tasks as `[subagent]`, `[iterative]`, or `[collaborative]`; iterative tasks dispatch via `/dp-cto:ralph`
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

- **`/dp-cto:start` molecule creation**: After brainstorming and analysis (unchanged), creates a beads epic via `bd create`, child tasks via `bd create --parent`, and dependency edges via `bd dep add`. Agent prompts are stored as beads issue descriptions via `bd edit --body`. The `01-analysis.md` analysis doc remains as a markdown reference.
- **`/dp-cto:execute` beads dispatch**: Queries `bd ready --json` for tasks with all blockers resolved, extracts agent prompts from `bd show {task-id} --json`, dispatches agents, and marks completion with `bd close {task-id}`. Re-queries `bd ready` after each round to discover newly unblocked tasks.
- **`bd prime` context injection**: SessionStart hook runs `bd prime` when `bd` is available and `.beads/` exists in the working directory. Injects a compact 1-2k token summary into the session context (instead of the full plan).
- **Graceful degradation**: If `bd` is not installed or no `.beads/` directory exists, beads features are skipped silently. The hooks and skills still function for stage tracking and enforcement.
- **State coexistence**: Beads DB (`.beads/`) handles plan and task state. Stage files (`.claude/dp-cto/`) handle dp-cto's own skill sequencing (start -> execute -> polish). Both coexist.

### Key design: harness engineering hooks

dp-cto v3.0 applies harness engineering patterns — defense-in-depth hooks that catch common agent failure modes:

- **Completion gate** (`completion-gate.sh`): PostToolUse hook on Agent returns. Detects completion claims ("all tests pass", "implementation complete", etc.) that lack test execution evidence (test runner output, pass/fail counts, exit codes). Injects an advisory warning — does NOT block. Defense-in-depth for the `dp-cto:verify-done` skill.
- **Sweep** (`/dp-cto:sweep`): Entropy management skill inspired by the principle "Entropy Management Is Garbage Collection." Agents replicate all patterns they find — good and bad. Sweep spawns parallel drift-detection agents per category (dead code, inconsistent patterns, stale comments, naming violations), severity-grades findings, and auto-fixes critical/warning items via one-shot agents with quality gate verification.

### Key design: native quality skills

dp-cto v3.0 ships five native quality skills, replacing external superpowers dependencies:

- **`dp-cto:tdd`** — Iron law, RED-GREEN-REFACTOR, rationalization prevention
- **`dp-cto:debug`** — 4-phase investigation, 3-fix architecture check
- **`dp-cto:verify-done`** — Gate function, evidence-before-claims (reinforced by completion-gate hook)
- **`dp-cto:review`** — Dispatch review agent + process feedback with technical rigor
- **`dp-cto:sweep`** — Entropy management, pattern drift detection and cleanup

These are side-effect-free quality skills: no stage transitions, always allowed by the hook system regardless of workflow stage.

### Key design: session recovery

Breadcrumb file at `.claude/dp-cto/active.json` tracks the active session:

- Written on `planned`, updated through stage transitions, cleared on `complete`
- SessionStart checks the breadcrumb (fast path), then scans `*.stage.json` for non-terminal states (fallback)
- Multiple orphaned stage files resolved by latest `started_at`
- SessionEnd preserves stage files with `ended` status instead of deleting — enables recovery detection on next session start

## Prerequisites

- **`bd` CLI** (beads): Required for plan storage and task scheduling. Without it, beads features degrade gracefully but `/dp-cto:start` cannot create molecules and `/dp-cto:execute` cannot use `bd ready` scheduling.
- **`jq`**: Required by all hooks for JSON parsing. Hooks fail open (exit 0) if jq is unavailable.
- **Claude Code CLI**: The runtime for the plugin system.

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
- Ralph state files go in `.claude/ralph/` (not `.claude/` root) — session-scoped by timestamp
- dp-cto PostToolUse hook fires on ALL MCP tools (`mcp__.*`) — if this causes noise, narrow the matcher
- Stage files are preserved on SessionEnd (not deleted) — `.claude/dp-cto/active.json` is the recovery breadcrumb
- `bd` CLI must be on `$PATH` for beads features — hooks check `command -v bd` and degrade gracefully if absent
- dp-cto v3.0 denies ALL superpowers skills (not just orchestration) — uninstall superpowers to avoid conflicts
- Completion gate hook fires on ALL Agent returns — may produce advisory warnings on non-implementation agents

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```
