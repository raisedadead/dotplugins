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
    skills/execute/SKILL.md        <- /dp-cto:execute parallel implementation with Agent Teams
    skills/ralph/SKILL.md          <- /dp-cto:ralph teammate-based iterative loop coordinator
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

### Key design: dp-cto:ralph teammate loops

`/dp-cto:ralph` replaces the upstream `ralph-loop` stop-hook plugin with a Teammates-based architecture:

- Each iteration spawns a fresh `general-purpose` agent (no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates

**CTO integration** (three points):

- CTO classifies plan tasks as one-shot vs iterative; iterative tasks dispatch via `/dp-cto:ralph`
- CTO's review fix loop escalates to ralph after 2 failed SendMessage attempts
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

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```
