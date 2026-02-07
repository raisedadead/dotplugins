---
description: CTO-mode autonomous coding via claude-code CLI
argument-hint: [what to build or fix]
---

# Code

Execute a coding task autonomously using claude-code CLI.

## Usage

```
/cowork:code [what to build, fix, or refactor]
```

## Workflow

1. Understand the request — clarify *what*, decide *how* yourself
2. Explore the codebase for existing patterns
3. Decompose into subtasks (medium+ tasks)
4. Delegate to `claude -p` with focused prompts
5. Verify with tests/lint/build
6. Report: what changed, what was tested, decisions made
