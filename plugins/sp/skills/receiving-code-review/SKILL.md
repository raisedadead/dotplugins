---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions. Requires technical rigor and verification, not performative agreement.
---

# Receiving Code Review

Evaluate feedback technically. Verify before implementing. Push back if wrong.

## Response Pattern

1. **Read** — Complete feedback without reacting.
2. **Understand** — Restate the requirement in your own words. If unclear, ask before implementing anything.
3. **Verify** — Check against actual codebase. Is the reviewer's claim accurate?
4. **Evaluate** — Is this technically sound for THIS codebase? Does it break existing functionality?
5. **Respond** — Technical acknowledgment or reasoned pushback. Never "You're absolutely right!" or "Great point!"
6. **Implement** — One item at a time. Test each fix individually.

## Implementation Order

1. Clarify anything unclear FIRST
2. Blocking issues (bugs, security)
3. Simple fixes (typos, imports)
4. Complex fixes (refactoring, logic)
5. Test each fix, verify no regressions

## When to Push Back

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Feature is unused (YAGNI — grep codebase to verify)
- Technically incorrect for this stack
- Conflicts with architectural decisions

Push back with technical reasoning and evidence, not defensiveness.

## Correct Acknowledgment Style

- "Fixed. [Brief description]"
- "Good catch — [specific issue]. Fixed in [location]."
- Or just fix it silently and show the diff.
