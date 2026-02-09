# dotplugins

Personal [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin marketplace.

## Setup

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install sp@dotplugins
claude plugin install cowork@dotplugins
```

## Plugins

### sp — CTO Orchestration

Orchestrate parallel development with [Agent Teams](https://docs.anthropic.com/en/docs/claude-code/agent-teams) and optional worktree isolation. Requires [superpowers](https://github.com/obra/superpowers) for planning, TDD, debugging, and code review.

| Skill | What it does                                                            |
| ----- | ----------------------------------------------------------------------- |
| `cto` | Orchestrate Agent Teams for parallel tasks, optional worktree isolation |

**Workflow:**

```
/brainstorm          → explore the idea, save design       (superpowers)
/write-plan          → break into tasks, save plan         (superpowers)
/sp:cto              → dispatch agents to execute parallel  (sp)
```

Planning comes from superpowers. Execution comes from sp. Hooks intercept superpowers' execution skills (`executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`) and redirect to `/sp:cto`.

### cowork — Research & Coding (Experimental)

Deep web research with persistent SQLite storage, and quick idea spikes via subagent delegation. **Claude Desktop Cowork only** — not for standard Claude Code CLI sessions.

| Skill      | What it does                                                 |
| ---------- | ------------------------------------------------------------ |
| `research` | Web research with fact-checking, saves to queryable database |
| `coding`   | Task decomposition and subagent delegation                   |

## Structure

```
dotplugins/
├── .claude-plugin/marketplace.json
└── plugins/
    ├── sp/
    │   ├── .claude-plugin/plugin.json
    │   ├── hooks/
    │   │   ├── hooks.json
    │   │   ├── session-start.sh
    │   │   └── intercept-orchestration.sh
    │   └── skills/cto/SKILL.md
    └── cowork/
        ├── .claude-plugin/plugin.json
        └── skills/
            ├── research/
            │   ├── SKILL.md
            │   └── scripts/research_db.py
            └── coding/SKILL.md
```

---

The `sp` plugin is a CTO orchestration layer complementary to [superpowers](https://github.com/obra/superpowers) by Jesse Vincent. Superpowers handles individual contributor skills (TDD, debugging, planning, code review). sp handles parallel execution via Agent Teams.
