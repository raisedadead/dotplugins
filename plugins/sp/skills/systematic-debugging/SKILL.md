---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes. Find root cause first.
---

# Systematic Debugging

Find root cause before attempting ANY fix. Random fixes create new bugs.

## Phase 1: Investigate (MUST complete before Phase 2)

1. **Read error messages carefully** — don't skip or skim
2. **Reproduce consistently** — exact steps, every time?
3. **Check recent changes** — `git diff`, recent commits, new dependencies
4. **Trace data flow** — where does the bad value originate? Log at boundaries.
5. **Multi-component systems** — verify state at each layer, check environment/config propagation

## Phase 2: Analyze (MUST complete before Phase 3)

1. **Find working examples** — similar code that works correctly
2. **Compare** — read working code COMPLETELY, list every difference
3. **Understand dependencies** — what else does the broken code need?

## Phase 3: Hypothesize and Test (MUST complete before Phase 4)

1. **Form ONE hypothesis:** "I think X is root cause because Y"
2. **Test minimally** — smallest possible change to prove/disprove
3. **One variable at a time** — never change multiple things
4. **If wrong:** form NEW hypothesis with new information, return to Phase 1

## Phase 4: Fix

1. **Create failing test** — simplest reproduction of the bug
2. **Implement single fix** — ONE change addressing root cause
3. **Verify** — test passes, no other tests broken
4. **If fix doesn't work:** count attempts

### 3+ Fix Attempts = STOP

If you've tried 3+ fixes and each reveals a new problem in a different place, this is an architectural issue. STOP fixing symptoms and discuss with the user before attempting Fix #4.

## Red Flags — STOP and Follow the Process

| Flag | What's Wrong |
|------|-------------|
| "Quick fix for now" | Symptom fix, not root cause |
| "Just try changing X" | Guessing, not investigating |
| Multiple changes at once | Can't tell what worked |
| Proposing solutions before tracing data flow | Skipped Phase 1 |
| "It's probably X" without evidence | Hypothesis without investigation |
| "One more fix attempt" after 2+ failures | See 3+ rule above |
| Each fix reveals new problem elsewhere | Architectural issue — escalate |
