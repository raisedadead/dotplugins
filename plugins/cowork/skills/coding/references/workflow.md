# CTO Coding Workflow — Detailed Reference

## Task Decomposition

When receiving a broad task, decompose it into an execution plan before touching code.

### Decomposition Template

```
## Task: [User's request in their words]

### Objective
[1-sentence technical restatement]

### Breakdown
1. [Subtask] — [what, not how] — [acceptance criteria]
2. [Subtask] — [what, not how] — [acceptance criteria]
...

### Dependencies & Order
[Which subtasks block others, what can run in parallel]

### Risks / Open Questions
[Anything that needs user input or could change scope]
```

### Sizing Heuristic

- **Small** (1-2 subtasks): Execute directly, no plan needed.
- **Medium** (3-5 subtasks): Write brief plan in TodoWrite, then execute.
- **Large** (6+ subtasks): Write plan, confirm priorities with user, then execute in phases.

## Claude Code Delegation Patterns

### Single-file changes
```bash
claude -p "In <file>, <specific change>. Keep existing patterns."
```

### Multi-file feature
```bash
claude -p "Implement <feature>. Requirements: <bullet list>. Existing patterns to follow: <references>. Tests required."
```

### Bug fix
```bash
claude -p "Bug: <symptom>. Repro: <steps>. Fix in <file/area>. Add regression test."
```

### Refactor
```bash
claude -p "Refactor <target>. Goal: <improvement>. Constraint: no behavior change. Run tests after."
```

## Prompt Engineering for Claude Code

Effective delegation prompts include:

1. **Context**: What repo, what area, what patterns exist
2. **Task**: Specific change needed
3. **Constraints**: Don't break X, follow Y pattern, keep Z
4. **Verification**: Run tests, lint, type-check

### Anti-patterns to avoid
- Vague prompts: "fix the code" — too broad
- Over-specified: writing the actual code in the prompt — defeats the purpose
- No verification: not asking for tests — bugs ship

## Decision Framework

When technical decisions arise during implementation:

1. **Has the user stated a preference?** Follow it.
2. **Does the codebase have an existing pattern?** Follow it.
3. **Is one option clearly simpler?** Choose it.
4. **Are options roughly equal?** Pick one, note the tradeoff briefly, move on. Don't ask the user.

Only escalate to user when: the decision significantly affects UX, cost, or architecture direction.

## Code Quality Checklist

Before marking a coding subtask complete:

- [ ] Code follows existing repo conventions
- [ ] No hardcoded secrets or env-specific values
- [ ] Error handling for failure cases
- [ ] Tests pass (or new tests added)
- [ ] No unnecessary dependencies added
- [ ] Changes are minimal — do the task, nothing more
