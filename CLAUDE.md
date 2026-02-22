# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal Claude Code plugin marketplace (monorepo). Two plugins:

| Plugin     | Runtime         | Category       | Purpose                                          |
| ---------- | --------------- | -------------- | ------------------------------------------------ |
| **dp-cto** | Claude Code CLI | `productivity` | CTO orchestration + iterative loops              |
| **dp-sct** | Claude Code CLI | `productivity` | Research validation via PostToolUse hook + skill |

## Commands

All development tasks use `just` (see `justfile`):

```bash
just                        # list available recipes
just version                # show current plugin versions (from marketplace.json)
just validate               # run per-plugin validation checks
just release dp-cto patch   # release a plugin: just release <plugin> <patch|minor|major|x.y.z>
```

No build step, no tests, no linting. Plugins are plain Markdown skills + shell hooks.

## Architecture

```
.claude-plugin/marketplace.json    <- marketplace registry (lists all plugins + versions)
plugins/
  dp-cto/                          <- CTO orchestration plugin
    .claude-plugin/plugin.json     <- plugin metadata + version (synced from marketplace.json)
    hooks/
      hooks.json                   <- hook definitions (SessionStart, PreToolUse)
      session-start.sh             <- injects enforcement context on session start
      intercept-orchestration.sh   <- PreToolUse hook: denies superpowers orchestration
                                      skills, passes quality skills, warns on unknown
    skills/cto-start/SKILL.md      <- /dp-cto:cto-start brainstorming and planning
    skills/cto-execute/SKILL.md    <- /dp-cto:cto-execute parallel implementation with Agent Teams
    skills/rlp-start/SKILL.md      <- /dp-cto:rlp-start teammate-based iterative loop coordinator
    skills/rlp-cancel/SKILL.md     <- /dp-cto:rlp-cancel graceful loop cancellation
  dp-sct/                          <- Research validation plugin
    .claude-plugin/plugin.json     <- plugin metadata + version
    hooks/
      hooks.json                   <- hook definitions (PostToolUse)
      research-validator.sh        <- injects verification checklists after research tool calls
    skills/check/SKILL.md          <- /dp-sct:check manual deep-validation skill
```

### Key design: dp-cto hook system

The dp-cto plugin intercepts superpowers orchestration skills via a tiered PreToolUse hook (`intercept-orchestration.sh`):

- **Tier 1 DENY**: `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch`, `ralph-loop`, `brainstorming`, `writing-plans` -> redirects to `/dp-cto:cto-start` or `/dp-cto:cto-execute`
- **Tier 2 PASS**: quality skills (TDD, code review, debugging, etc.) pass through
- **Tier 3 WARN**: unknown skills with orchestration-adjacent names get a warning
- **Tier 4 PASS**: everything else passes silently

The SessionStart hook (`session-start.sh`) injects context about this enforcement into every session.

### Key design: dp-cto:rlp-start teammate loops

`/dp-cto:rlp-start` replaces the upstream `ralph-loop` stop-hook plugin with a Teammates-based architecture:

- Each iteration spawns a fresh `general-purpose` agent (no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates

**CTO integration** (three points):

- CTO classifies plan tasks as one-shot vs iterative; iterative tasks dispatch via `/dp-cto:rlp-start`
- CTO's review fix loop escalates to rlp-start after 2 failed SendMessage attempts
- rlp-start reads from active CTO plan when invoked without args

### Key design: dp-sct research validation

The dp-sct plugin adds a PostToolUse hook (`research-validator.sh`) that fires after WebSearch, WebFetch, and MCP tool calls. It injects verification checklists prompting the agent to cross-check sources. The `/dp-sct:check` skill provides manual deep-validation on demand.

## Versioning and Releases

- **Versions in two places, kept in sync:** `marketplace.json` is the primary source. Each `plugin.json` also carries a `version` field for consistency.
- `just release <plugin> <bump>` bumps both files, validates, commits, and pushes. No tags, no GitHub releases.
- `just validate` checks version sync between the two files, plus per-plugin checks (JSON validity, shellcheck for hook scripts, SKILL.md frontmatter).
- CI runs `just validate` on every push to `main` and on PRs.
- Never edit versions manually — always use `just release`.

## Marketplace Structure

Follows Anthropic's official marketplace conventions:

- `$schema` — points to Anthropic's marketplace schema for validation
- `metadata` — marketplace-level version and `pluginRoot`
- `category` — free-form string per plugin (e.g. `productivity`, `development`, `security`, `learning`)
- `tags` — array of strings for searchability
- `keywords` — array of strings in plugin.json for discovery

## Gotchas

- `CLAUDE.md` is globally gitignored (`~/.gitignore`) — do not attempt `git add CLAUDE.md`
- `just release <plugin> <bump>` prompts for confirmation — pipe `echo "y"` for non-interactive use
- Shellcheck runs on `plugins/*/hooks/*.sh` during `just validate` — all hook scripts must pass `-S warning`
- Plugin skills live in `skills/<name>/SKILL.md` (not `commands/`) — must have YAML frontmatter with `---`
- Ralph state files go in `.claude/ralph/` (not `.claude/` root) — session-scoped by timestamp
- dp-sct PostToolUse hook fires on ALL MCP tools (`mcp__.*`) — if this causes noise, narrow the matcher

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
claude plugin install dp-sct@dotplugins
```
