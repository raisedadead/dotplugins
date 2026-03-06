# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal Claude Code plugin marketplace (monorepo). One plugin:

| Plugin     | Runtime         | Category       | Purpose                                                   |
| ---------- | --------------- | -------------- | --------------------------------------------------------- |
| **dp-cto** | Claude Code CLI | `productivity` | CTO orchestration + iterative loops + research validation |

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
      hooks.json                   <- hook definitions (SessionStart, PreToolUse, PostToolUse)
      session-start.sh             <- injects enforcement context on session start
      intercept-orchestration.sh   <- PreToolUse hook: denies superpowers orchestration
                                      skills, passes quality skills, warns on unknown
      research-validator.sh        <- PostToolUse hook: injects verification checklists
                                      after WebSearch, WebFetch, and MCP tool calls
    skills/start/SKILL.md          <- /dp-cto:start brainstorming and planning
    skills/execute/SKILL.md        <- /dp-cto:execute adaptive dispatch (subagents, iterative, collaborative)
    skills/ralph/SKILL.md          <- /dp-cto:ralph subagent-based iterative loop coordinator
    skills/ralph-cancel/SKILL.md   <- /dp-cto:ralph-cancel graceful loop cancellation
    skills/polish/SKILL.md         <- /dp-cto:polish multi-perspective review and polishing
    skills/verify/SKILL.md         <- /dp-cto:verify manual deep-validation of research
```

### Key design: dp-cto hook system

The dp-cto plugin intercepts superpowers orchestration skills via a tiered PreToolUse hook (`intercept-orchestration.sh`):

- **Tier 1 DENY**: `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch`, `ralph-loop`, `brainstorming`, `writing-plans` -> redirects to `/dp-cto:start` or `/dp-cto:execute`
- **Tier 2 PASS**: quality skills (TDD, code review, debugging, etc.) pass through
- **Tier 3 WARN**: unknown skills with orchestration-adjacent names get a warning
- **Tier 4 PASS**: everything else passes silently

The SessionStart hook (`session-start.sh`) injects context about this enforcement into every session.

### Key design: dp-cto:execute adaptive dispatch

`/dp-cto:execute` uses adaptive dispatch — the plan (from `/dp-cto:start`) classifies each task's dispatch strategy, and execute picks the right Claude Code primitive:

- **Plan-heavy dispatch**: Start now generates complete agent prompts per task in fenced `agent-prompt` blocks. Execute extracts these prompts and passes them verbatim to Agent calls — execute is a near-mechanical dispatcher that handles dispatch mechanics but not prompt content.
- **Phase 1 — Subagent dispatch**: `[subagent]` tasks spawn via `Agent(run_in_background=true)` for parallel execution. `[subagent:isolated]` adds `isolation: "worktree"` for filesystem isolation.
- **Phase 2 — Iterative dispatch**: `[iterative]` tasks invoke `/dp-cto:ralph` (sequential foreground subagent loop). No team collision since ralph is subagent-based.
- **Phase 3 — Collaborative dispatch**: `[collaborative]` tasks (rare) use `TeamCreate` + teammates + `SendMessage` for inter-agent coordination. Only phase that creates a team.
- **Review**: Subagent results reviewed via fresh review agents. Fix loop spawns fresh fix agents. After 2 failed fix rounds, report failure and suggest user invoke `/dp-cto:ralph` manually.
- **Commit checkpoints**: After each task batch passes review, CTO asks user if they want to commit progress.
- **Confirmation points**: Only "Ready to integrate" pause. No isolation question, no "ready to provision" pause.

### Key design: dp-cto:ralph iterative loops

`/dp-cto:ralph` replaces the upstream `ralph-loop` stop-hook plugin with a subagent-based architecture:

- Each iteration spawns a fresh `general-purpose` subagent via the Agent tool (no teams, no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates
- No confirmation pause — proceeds automatically with resolved config

**CTO integration** (three points):

- CTO classifies plan tasks as `[subagent]`, `[iterative]`, or `[collaborative]`; iterative tasks dispatch via `/dp-cto:ralph`
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

### Key design: session recovery

Breadcrumb file at `.claude/dp-cto/active.json` tracks the active session:

- Written on `planned`, updated through stage transitions, cleared on `complete`
- SessionStart checks the breadcrumb (fast path), then scans `*.stage.json` for non-terminal states (fallback)
- Multiple orphaned stage files resolved by latest `started_at`
- SessionEnd preserves stage files with `ended` status instead of deleting — enables recovery detection on next session start

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

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```
