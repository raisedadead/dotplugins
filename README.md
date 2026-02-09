# dotplugins

Personal Claude Code plugin marketplace.

## Plugins

| Plugin     | Install                                   | Description                                                               |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| **cowork** | `claude plugin install cowork@dotplugins` | Deep web research with persistent storage, CTO-mode coding                |
| **sp**     | `claude plugin install sp@dotplugins`     | TDD, debugging, planning, code review, CTO orchestration with Agent Teams |

## Install

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install sp@dotplugins
claude plugin install cowork@dotplugins
```

## Structure

```
dotplugins/
├── .claude-plugin/marketplace.json
└── plugins/
    ├── cowork/
    │   ├── .claude-plugin/plugin.json
    │   ├── commands/{code,research}.md
    │   └── skills/{coding,research}/SKILL.md
    └── sp/
        ├── .claude-plugin/plugin.json
        ├── agents/code-reviewer.md
        └── skills/
            ├── brainstorming/
            ├── writing-plans/
            ├── test-driven-development/
            ├── systematic-debugging/
            ├── verification-before-completion/
            ├── requesting-code-review/
            ├── receiving-code-review/
            ├── dispatching-parallel-agents/
            ├── writing-skills/
            ├── cto-but/
            └── cto-wt/
```
