# CLAUDE.md

Personal Claude Code plugin marketplace (monorepo). Single plugin: **dp-cto** (CTO orchestration with beads-based planning, quality skills, iterative loops). No build step — plugins are plain Markdown skills + shell hooks. All hooks fail open.

## Commands

```bash
pnpm test                   # vitest hook contract + schema tests
pnpm run lint               # oxlint on tests/
pnpm run fmt:check          # oxfmt formatting check
pnpm run check              # turbo: test + lint + fmt:check in parallel
pnpm run validate           # check + shell-based plugin validation (scripts/validate.sh)
pnpm run release -- patch   # release: patch|minor|major|x.y.z (scripts/release.sh)
```

## Versioning

- Versions live in three places: `marketplace.json` plugins array, `marketplace.json` metadata, and `plugins/dp-cto/.claude-plugin/plugin.json`. All must match.
- Never edit versions manually — always use `pnpm run release`.
- Release requires clean working tree on main branch.

## Gotchas

- `CLAUDE.md` is globally gitignored but negated in this repo's `.gitignore` — it IS tracked
- `category` goes in marketplace.json only (NOT in plugin.json — rejected by official validator)
- `pnpm run release -- <bump>` prompts for confirmation — pipe `echo "y"` for non-interactive use
- All hook scripts must pass `shellcheck -S warning`

## Installation

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install dp-cto@dotplugins
```

## Prerequisites

After installing the plugin, run `bd setup claude --project` in your repo to install beads native hooks (SessionStart context injection + PreCompact state preservation). dp-cto relies on these for full functionality.
