# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal Claude Code plugin marketplace (monorepo). Two plugins targeting different runtimes:

| Plugin     | Runtime               | Purpose                                         |
| ---------- | --------------------- | ----------------------------------------------- |
| **sp**     | Claude Code CLI       | CTO orchestration + iterative ralph loops       |
| **cowork** | Claude Desktop Cowork | Research with persistent storage, coding spikes |

**These are mutually exclusive platforms.** sp is only installable in Claude Code CLI. cowork is only installable in Claude Desktop Cowork. They do not run in each other's environment and should never be cross-installed.

## Commands

All development tasks use `just` (see `justfile`):

```bash
just                    # list available recipes
just version            # show current plugin versions (from marketplace.json)
just validate           # run per-plugin validation checks
just release sp patch   # release a plugin: just release <plugin> <patch|minor|major|x.y.z>
```

No build step, no tests, no linting. Plugins are plain Markdown skills + shell hooks.

## Architecture

```
.claude-plugin/marketplace.json    ← marketplace registry (lists all plugins + versions)
plugins/
  sp/                              ← CTO orchestration plugin
    .claude-plugin/plugin.json     ← plugin metadata + version (synced from marketplace.json)
    hooks/
      hooks.json                   ← hook definitions (SessionStart, PreToolUse)
      session-start.sh             ← injects enforcement context on session start
      intercept-orchestration.sh   ← PreToolUse hook: denies 5 superpowers orchestration
                                     skills, passes quality skills, warns on unknown
    skills/cto/SKILL.md            ← the /sp:cto skill prompt (dispatches iterative tasks to ralph)
    skills/ralph/SKILL.md          ← /sp:ralph teammate-based iterative loop coordinator
    skills/cancel-ralph/SKILL.md   ← /sp:cancel-ralph graceful loop cancellation
  cowork/                          ← Claude Desktop Cowork plugin (experimental)
    .claude-plugin/plugin.json
    skills/
      research/
        SKILL.md                   ← research skill prompt
        scripts/research_db.py     ← SQLite-backed research storage
      coding/SKILL.md              ← coding spike skill prompt
```

### Key design: sp hook system

The sp plugin intercepts superpowers orchestration skills via a tiered PreToolUse hook (`intercept-orchestration.sh`):

- **Tier 1 DENY**: `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch`, `ralph-loop` → redirects to `/sp:cto` or `/sp:ralph`
- **Tier 2 PASS**: quality skills (TDD, code review, debugging, etc.) pass through
- **Tier 3 WARN**: unknown skills with orchestration-adjacent names get a warning
- **Tier 4 PASS**: everything else passes silently

The SessionStart hook (`session-start.sh`) injects context about this enforcement into every session.

### Key design: sp:ralph teammate loops

`/sp:ralph` replaces the upstream `ralph-loop` stop-hook plugin with a Teammates-based architecture:

- Each iteration spawns a fresh `general-purpose` agent (no context rot)
- Session-scoped state files in `.claude/ralph/{SESSION_ID}.md` (no cross-terminal interference)
- Quality gates run configurable commands between iterations
- Progress tracking via structured iteration log in the state file
- Smart defaults: infers prompt from session/plan context, detects project toolchain for gates

**CTO integration** (three points):

- CTO classifies plan tasks as one-shot vs iterative; iterative tasks dispatch via `/sp:ralph`
- CTO's review fix loop escalates to ralph after 2 failed SendMessage attempts
- Ralph reads from active CTO plan when invoked without args

## Versioning and Releases

- **Versions in two places, kept in sync:** `marketplace.json` is the primary source. Each `plugin.json` also carries a `version` field because the Cowork resolver requires it (CLI reads from marketplace.json, Cowork reads from plugin.json).
- `just release <plugin> <bump>` bumps both files, validates, commits, and pushes. No tags, no GitHub releases.
- `just validate` checks version sync between the two files, plus per-plugin checks (JSON validity, shellcheck for sp hooks, Python syntax for cowork scripts, SKILL.md frontmatter).
- CI runs `just validate` on every push to `main` and on PRs.
- Never edit versions manually — always use `just release`.

## Gotchas

- `CLAUDE.md` is globally gitignored (`~/.gitignore`) — do not attempt `git add CLAUDE.md`
- `just release <plugin> <bump>` prompts for confirmation — pipe `echo "y"` for non-interactive use
- Shellcheck runs on `plugins/sp/hooks/*.sh` during `just validate` — all hook scripts must pass `-S warning`
- Plugin skills live in `skills/<name>/SKILL.md` (not `commands/`) — must have YAML frontmatter with `---`
- Ralph state files go in `.claude/ralph/` (not `.claude/` root) — session-scoped by timestamp

## Plugin Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install sp@dotplugins
claude plugin install cowork@dotplugins
```
