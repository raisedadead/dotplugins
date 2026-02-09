---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code. Tests first, always.
---

# Test-Driven Development

No production code without a failing test first. If you didn't watch the test fail, you don't know if it tests the right thing.

## The Cycle

### 1. RED — Write One Failing Test

- One minimal test showing what SHOULD happen
- Clear name describing the behavior
- Tests real behavior, not implementation details
- Avoid mocks unless unavoidable

### 2. Verify RED — MANDATORY

Run the test. Watch it fail. Confirm it fails for the RIGHT reason.

- Test passes immediately? You're testing existing behavior — fix the test.
- Test errors (not fails)? Fix the error first, then re-run until it fails correctly.

### 3. GREEN — Write Minimal Code

The simplest code that makes the test pass. Nothing more.

- Don't add features, don't refactor, don't "improve while here"
- One change at a time

### 4. Verify GREEN — MANDATORY

Run the test. Watch it pass. Run ALL tests — nothing else broke.

- Test still fails? Fix the code, not the test.
- Other tests broke? Fix now, not later.

### 5. REFACTOR — Clean Up (After Green Only)

Remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### 6. Repeat

Next failing test for next behavior.

## Red Flags — STOP and Restart the Cycle

| Flag | What's Wrong |
|------|-------------|
| Writing code before test | Violates the iron law |
| Test passes immediately | Not testing new behavior |
| Can't explain why test failed | Don't understand what you're testing |
| "Too simple to test" | Simple code breaks; test takes 30 seconds |
| "I'll test after" | Tests-after prove nothing — they pass immediately |
| "Just this once" | No exceptions |
| "I already manually tested" | Ad-hoc is not systematic |
| Skipping verify-red or verify-green | You don't know if it works |

## When TDD Doesn't Apply

Ask the user first: throwaway prototypes, generated code, config-only changes.
