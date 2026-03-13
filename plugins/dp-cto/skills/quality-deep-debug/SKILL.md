---
name: quality-deep-debug
description: "Structured root-cause debugging. Enforces 4-phase investigation before any fix attempts. Prevents guess-and-check thrashing."
---

# Systematic Debugging

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you are not allowed to propose a fix. No exceptions.

Violating the letter of this process is violating the spirit of debugging.

## When This Applies

Use for ANY technical issue: test failures, bugs, unexpected behavior, performance problems, build failures, integration issues.

**Use this ESPECIALLY when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You have already tried a fix and it did not work
- You do not fully understand the issue

**Do not skip when:**

- The issue seems simple (simple bugs have root causes too)
- You are in a hurry (systematic is faster than thrashing)
- Someone wants it fixed NOW (process prevents rework)

## The Four Phases

Complete each phase before proceeding to the next. No skipping.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Completely**
   - Do not skip past errors or warnings
   - Read stack traces top to bottom
   - Note line numbers, file paths, error codes
   - Errors often contain the exact answer

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible: gather more data, do not guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   When the system has multiple components (CI pipeline, API chain, layered services):

   ```
   For EACH component boundary:
     - Log what data enters the component
     - Log what data exits the component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify the failing component
   THEN investigate that specific component
   ```

   This reveals which layer fails. Do not guess the layer.

5. **Trace Data Flow**

   When the error is deep in a call stack:
   - Where does the bad value originate?
   - What called this function with the bad value?
   - Keep tracing backward until you find the source
   - Fix at the source, not at the symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in the same codebase
   - What works that is similar to what is broken?

2. **Compare Against References**
   - If implementing a pattern, read the reference implementation completely
   - Do not skim. Read every line.
   - Understand the pattern fully before applying it

3. **Identify Differences**
   - What is different between working and broken?
   - List every difference, however small
   - Do not assume "that cannot matter"

4. **Understand Dependencies**
   - What other components does this depend on?
   - What settings, config, environment are required?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method. One variable at a time.**

1. **Form a Single Hypothesis**
   - State it clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test the hypothesis
   - One variable at a time
   - Do not fix multiple things at once

3. **Evaluate**
   - Did it work? Yes: proceed to Phase 4
   - Did not work? Form a NEW hypothesis based on what you learned
   - Do NOT stack fixes on top of each other

4. **When You Do Not Know**
   - Say "I do not understand X"
   - Do not pretend to know
   - Research further or ask for help

### Phase 4: Implementation

**Fix the root cause, not the symptom.**

1. **Create a Failing Test**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework exists
   - MUST exist before implementing the fix

2. **Implement a Single Fix**
   - Address the root cause you identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify the Fix**
   - Does the test pass now?
   - Are any other tests broken?
   - Is the issue actually resolved?

4. **If the Fix Does Not Work**
   - STOP
   - Count: how many fixes have you attempted?
   - If fewer than 3: return to Phase 1, re-analyze with new information
   - **If 3 or more: STOP and question the architecture (see step 5)**
   - Do NOT attempt fix #4 without an architectural discussion

5. **3+ Fixes Failed: Question the Architecture**

   Patterns that indicate an architectural problem:
   - Each fix reveals new shared state, coupling, or problems in a different place
   - Fixes require massive refactoring to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we persisting with this approach through sheer inertia?
   - Should we refactor the architecture instead of continuing to fix symptoms?

   **Discuss with the user before attempting more fixes.**

   This is NOT a failed hypothesis. This is a wrong architecture.

## Red Flags -- STOP and Return to Phase 1

If you catch yourself thinking any of these, STOP immediately:

| Thought                                          | What It Means                             |
| ------------------------------------------------ | ----------------------------------------- |
| "Quick fix for now, investigate later"           | You are skipping root cause analysis      |
| "Just try changing X and see"                    | You are guessing, not investigating       |
| "Add multiple changes, run tests"                | You cannot isolate what worked            |
| "Skip the test, I will manually verify"          | Untested fixes do not stick               |
| "It is probably X, let me fix that"              | Probably is not root cause                |
| "I do not fully understand but this might work"  | You are guessing                          |
| "Pattern says X but I will adapt it differently" | Partial understanding guarantees bugs     |
| "Here are the main problems: [list of fixes]"    | Proposing solutions without investigation |
| "One more fix attempt" (after 2+ failures)       | 3+ failures = architectural problem       |
| Each fix reveals a new problem elsewhere         | Wrong architecture, not wrong fix         |
| Proposing solutions before tracing data flow     | Phase 1 is not complete                   |

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes have failed: question the architecture (Phase 4, step 5).**

## User Signals You Are Off Track

Watch for these redirections from the user:

| Signal                       | Meaning                                       |
| ---------------------------- | --------------------------------------------- |
| "Is that not happening?"     | You assumed without verifying                 |
| "Will it show us...?"        | You should have added evidence gathering      |
| "Stop guessing"              | You are proposing fixes without understanding |
| "Think harder about this"    | Question fundamentals, not just symptoms      |
| "We are stuck?" (frustrated) | Your approach is not working                  |

**When you see these: STOP. Return to Phase 1.**

## Rationalization Prevention

| Excuse                                             | Reality                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| "Issue is simple, do not need process"             | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process"                   | Systematic debugging is FASTER than guess-and-check thrashing.       |
| "Just try this first, then investigate"            | The first fix sets the pattern. Do it right from the start.          |
| "I will write the test after confirming fix works" | Untested fixes do not stick. Test first proves it.                   |
| "Multiple fixes at once saves time"                | Cannot isolate what worked. Causes new bugs.                         |
| "Reference too long, I will adapt the pattern"     | Partial understanding guarantees bugs. Read it completely.           |
| "I see the problem, let me fix it"                 | Seeing symptoms is not understanding root cause.                     |
| "One more fix attempt" (after 2+ failures)         | 3+ failures = architectural problem. Question the approach.          |

## Quick Reference

| Phase                 | Key Activities                                                          | Done When                                        |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| **1. Root Cause**     | Read errors, reproduce, check changes, gather evidence, trace data flow | You understand WHAT and WHY                      |
| **2. Pattern**        | Find working examples, compare, identify differences                    | You know what differs between working and broken |
| **3. Hypothesis**     | Form theory, test minimally, evaluate                                   | Root cause confirmed or new hypothesis formed    |
| **4. Implementation** | Create failing test, fix root cause, verify                             | Bug resolved, all tests pass                     |

## When Investigation Reveals No Root Cause

If systematic investigation shows the issue is truly environmental, timing-dependent, or external:

1. You have completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

But: 95% of "no root cause" cases are incomplete investigation.

## NEVER

1. NEVER propose a fix before completing Phase 1
2. NEVER attempt fix #4 without questioning the architecture
3. NEVER test multiple changes at once
4. NEVER skip the failing test before implementing a fix
5. NEVER rationalize skipping process -- check the table above
6. NEVER assume "that cannot matter" when comparing working vs broken
7. NEVER stack fixes on top of failed fixes
