# dotplugins

Personal [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin marketplace.

## Setup

```bash
claude plugin marketplace add raisedadead/dotplugins
claude plugin install sp@dotplugins
claude plugin install cowork@dotplugins
```

## Plugins

### sp — Development Workflow Skills

Lean skills for planning, quality, and parallel execution. Skills are invoked via `/sp:<skill>`.

| Skill                            | What it does                                                       |
| -------------------------------- | ------------------------------------------------------------------ |
| `brainstorming`                  | Collaborative design before coding — one question at a time        |
| `writing-plans`                  | Break features into bite-sized TDD tasks, save to `.claude/plans/` |
| `test-driven-development`        | Red-green-refactor cycle with guardrails against skipping steps    |
| `systematic-debugging`           | 4-phase root cause investigation before attempting fixes           |
| `verification-before-completion` | Evidence before claims — run the command, then assert              |
| `requesting-code-review`         | Dispatch reviewer subagent with git range and context              |
| `receiving-code-review`          | Evaluate feedback technically, push back if wrong                  |
| `dispatching-parallel-agents`    | Run 2+ independent tasks via Agent Teams or Subagents              |
| `writing-skills`                 | Create new skills using TDD for documentation                      |
| `cto-but`                        | Parallel dev with GitButler virtual branches + Agent Teams         |
| `cto-wt`                         | Parallel dev with git worktrees + Agent Teams                      |

**Typical workflow:**

```
/sp:brainstorming        → explore the idea, save design
/sp:writing-plans        → break into tasks, save plan
/sp:cto-but or /sp:cto-wt → dispatch agents to execute in parallel
```

Each step is independent — you can enter the workflow at any point. Skills suggest next steps but never auto-chain.

### cowork — Research & Coding

Deep web research with persistent SQLite storage, and autonomous coding delegation via `claude -p`.

| Command            | What it does                                                 |
| ------------------ | ------------------------------------------------------------ |
| `/cowork:research` | Web research with fact-checking, saves to queryable database |
| `/cowork:code`     | Task decomposition and delegation to claude-code CLI         |

## Structure

```
dotplugins/
├── .claude-plugin/marketplace.json
└── plugins/
    ├── sp/
    │   ├── .claude-plugin/plugin.json
    │   ├── agents/code-reviewer.md
    │   └── skills/{11 skills}/SKILL.md
    └── cowork/
        ├── .claude-plugin/plugin.json
        ├── commands/{code,research}.md
        └── skills/{coding,research}/SKILL.md
```

---

The `sp` plugin is inspired by [superpowers](https://github.com/obra/superpowers) by Jesse Vincent — a comprehensive skills library for Claude Code. This plugin distills the core concepts into lean, token-optimized rewrites with added support for [Agent Teams](https://docs.anthropic.com/en/docs/claude-code/agent-teams) and [GitButler](https://gitbutler.com/).
