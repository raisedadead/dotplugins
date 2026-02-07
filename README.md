# cc-marketplace

Personal Claude plugin marketplace for Claude Code and Claude Cowork.

## Plugins

### cowork

Deep web research with persistent queryable storage, and CTO-mode coding via claude-code CLI.

| Type | Name | Description |
|------|------|-------------|
| Command | `/cowork:code` | Autonomous coding via claude-code CLI |
| Command | `/cowork:research` | Web research with fact-checking and persistent storage |
| Skill | `coding` | CTO-mode task decomposition and delegation to claude-code |
| Skill | `research` | Structured research with SQLite-backed persistence and full-text search |

## Install

```bash
claude plugin marketplace add raisedadead/cc-marketplace
claude plugin install cowork@cc-marketplace
```

## Structure

```
cc-marketplace/
├── .claude-plugin/marketplace.json
└── plugins/
    └── cowork/
        ├── .claude-plugin/plugin.json
        ├── commands/
        │   ├── code.md
        │   └── research.md
        └── skills/
            ├── coding/
            │   ├── SKILL.md
            │   └── references/workflow.md
            └── research/
                ├── SKILL.md
                └── scripts/research_db.py
```
