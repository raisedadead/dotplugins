---
name: tdd
description: "Test-driven development discipline enforcement. Invoke before writing any production code. Enforces RED-GREEN-REFACTOR with no exceptions."
---

# TDD Enforcement

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it. Not "set aside." Not "use as reference." Delete. Implement fresh from the failing test.

**Violating the letter of the rules is violating the spirit of the rules.**

## When to Use

**Always:**

- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions (ask the user):**

- Throwaway prototypes
- Generated code
- Configuration files

Thinking "skip TDD just this once"? That is rationalization. Stop.

## RED-GREEN-REFACTOR

### RED -- Write One Failing Test

Write a single minimal test that describes the behavior you need.

**Requirements:**

- One behavior per test
- Clear name that describes the behavior
- Real code, not mocks (unless external I/O is unavoidable)

<Good>
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

const result = await retryOperation(operation);

expect(result).toBe('success');
expect(attempts).toBe(3);
});

````
Clear name, tests real behavior, one thing.
</Good>

<Bad>
```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
````

Vague name, tests mock behavior not real behavior.
</Bad>

### Verify RED -- Watch It Fail

**MANDATORY. Never skip this step.**

Run the test. Confirm:

- Test **fails** (not errors -- syntax errors and import failures are not valid RED)
- Failure message matches your expectation
- Fails because the feature is missing, not because of a typo

**Test passes?** You are testing existing behavior. Fix the test.

**Test errors?** Fix the error. Re-run until it fails correctly.

### GREEN -- Minimal Code to Pass

Write the simplest code that makes the test pass. Nothing more.

<Good>
```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```
Just enough to pass.
</Good>

<Bad>
```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  // YAGNI -- no test asked for this
}
```
Over-engineered. No test demanded these options.
</Bad>

Do not add features. Do not refactor other code. Do not "improve" beyond the test.

### Verify GREEN -- Watch It Pass

**MANDATORY.**

Run the test. Confirm:

- New test passes
- All other tests still pass
- Output is clean (no errors, no warnings)

**Test fails?** Fix the production code, not the test.

**Other tests broke?** Fix them now. Do not proceed with broken tests.

### REFACTOR -- Clean Up (Tests Stay Green)

Only after green:

- Remove duplication
- Improve names
- Extract helpers

Run tests after every change. If any test fails, undo and try again. Do not add new behavior during refactor.

### Repeat

Next failing test for the next behavior. One cycle at a time.

## Why Order Matters

**"I'll write tests after to verify it works."**

Tests written after code pass immediately. Passing immediately proves nothing. You never saw the test catch the bug. It might test the wrong thing, test implementation details instead of behavior, or miss edge cases you forgot existed.

Test-first forces you to see the failure, proving the test actually tests something.

**"I already manually tested all the edge cases."**

Manual testing is ad-hoc. No record of what you tested. Cannot re-run when code changes. "It worked when I tried it" is not a test suite.

**"Deleting X hours of work is wasteful."**

Sunk cost fallacy. The time is already gone. Your choice:

- Delete and rewrite with TDD: X more hours, high confidence
- Keep it and add tests after: 30 minutes, low confidence, hidden bugs

Keeping code you cannot trust is the real waste.

**"TDD is dogmatic. Being pragmatic means adapting."**

TDD IS pragmatic. It finds bugs before commit. It prevents regressions. It documents behavior. It enables fearless refactoring. "Pragmatic" shortcuts mean debugging in production. That is slower.

**"Tests after achieve the same goals -- it's about spirit, not ritual."**

No. Tests-after answer "what does this code do?" Tests-first answer "what should this code do?" Tests-after are biased by your implementation. You test what you built, not what is required. You verify remembered edge cases, not discovered ones.

## Rationalization Prevention

Every entry in this table is a real excuse that has caused real failures. If you catch yourself thinking any of these, stop.

| Excuse                                 | Reality                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "Too simple to test"                   | Simple code breaks. The test takes 30 seconds. Write it.                                                        |
| "I'll test after"                      | Tests passing immediately prove nothing. You never saw the failure.                                             |
| "Tests after achieve same goals"       | Tests-after = "what does this do?" Tests-first = "what should this do?" Different questions, different results. |
| "Already manually tested"              | Ad-hoc is not systematic. No record, cannot re-run, misses cases under pressure.                                |
| "Deleting X hours is wasteful"         | Sunk cost fallacy. Keeping unverified code is technical debt with compound interest.                            |
| "Keep as reference, write tests first" | You will adapt it. That is testing after with extra steps. Delete means delete.                                 |
| "Need to explore first"                | Fine. Explore. Then throw away the exploration and start with TDD. No carrying code forward.                    |
| "Test is hard to write = skip it"      | Hard to test means hard to use. Listen to the test. Simplify the interface.                                     |
| "TDD will slow me down"                | TDD is faster than debugging. You pay now or pay more later.                                                    |
| "Manual test is faster"                | Manual does not prove edge cases. You will re-test every change by hand forever.                                |
| "Existing code has no tests"           | You are improving it. Start by adding tests for the code you are changing.                                      |

## Red Flags -- Stop and Start Over

If any of these are true, you have left the TDD path. Delete the production code. Start over from RED.

| Red Flag                                      | What Happened                                                      |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Code written before test                      | Iron law violated. Delete the code.                                |
| Test written after implementation             | You tested what you built, not what is required.                   |
| Test passes immediately on first run          | You are testing existing behavior, not new behavior.               |
| Cannot explain why the test failed            | You do not understand what you are testing.                        |
| Tests deferred to "later"                     | "Later" means "never." Write them now.                             |
| "Just this once" rationalization              | There is no "just this once." The rule is absolute.                |
| "I already manually tested it"                | Manual testing is not TDD. Write the automated test.               |
| "Tests after achieve the same purpose"        | They do not. See rationalization table above.                      |
| "It's about spirit, not ritual"               | The ritual IS the spirit. The order is the discipline.             |
| "Keep as reference" or "adapt existing code"  | You are smuggling untested code in. Delete and rewrite.            |
| "Already spent X hours, deleting is wasteful" | Sunk cost. The hours are gone. Only the code quality remains.      |
| "TDD is dogmatic, I'm being pragmatic"        | TDD is the pragmatic choice. Skipping it is the dogmatic shortcut. |
| "This is different because..."                | It is not different. Follow the cycle.                             |

## When Stuck

| Problem                    | Solution                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| Do not know how to test it | Write the API you wish existed. Write the assertion first. Ask the user. |
| Test is too complicated    | The design is too complicated. Simplify the interface.                   |
| Must mock everything       | Code is too coupled. Use dependency injection. Redesign.                 |
| Test setup is massive      | Extract test helpers. Still massive? Simplify the design.                |

## Bug Fix Protocol

Bug found? Do not touch the production code. First:

1. **RED:** Write a test that reproduces the bug
2. **Verify RED:** Confirm the test fails with the bug's symptoms
3. **GREEN:** Fix the bug with minimal code
4. **Verify GREEN:** Test passes, all other tests pass
5. **REFACTOR:** Clean up if needed

The test proves the fix works and prevents the regression from returning. Never fix bugs without a failing test first.

## Good Tests

| Quality          | Good                                | Bad                                                 |
| ---------------- | ----------------------------------- | --------------------------------------------------- |
| **Minimal**      | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear**        | Name describes the behavior         | `test('test1')`                                     |
| **Shows intent** | Demonstrates the desired API        | Obscures what the code should do                    |
| **Real**         | Tests actual code paths             | Tests mock wiring                                   |

## Verification Checklist

Before marking work complete, every box must be checked. If you cannot check all boxes, you skipped TDD. Start over.

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output is clean (no errors, no warnings)
- [ ] Tests use real code (mocks only when unavoidable)
- [ ] Edge cases and error paths are covered

## Final Rule

```
Production code exists -> a test exists that failed first
Otherwise             -> not TDD
```

No exceptions without the user's explicit permission.
