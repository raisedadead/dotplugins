---
name: review
description: "Bidirectional code review — dispatching review agents and processing their feedback. Covers severity triage, pushback guidance, and forbidden performative responses."
---

# Code Review — Dispatch and Process

Code review is bidirectional: you dispatch review agents AND process their feedback. Both directions require technical rigor.

## Part 1: Dispatching Review

### When to Request Review

**Mandatory:**

- After each task in `/dp-cto:execute` workflow
- After completing a major feature
- Before merge to main

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing a complex bug

### How to Dispatch

**1. Get the diff range:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Spawn a review agent** via the Agent tool (`general-purpose` type). Include in the prompt:

- What was implemented and why
- The plan or requirements it should satisfy
- `BASE_SHA` and `HEAD_SHA` for the diff range
- File scope (which files changed)

**3. Act on feedback** — see Part 2 below.

### Review by Dispatch Context

**Subagent tasks**: CTO reads the returned result. Spawn a foreground review Agent with the result + file diffs. If issues found, spawn a fresh fix Agent (foreground) with the review feedback + original task spec + file scope. Re-review after fix. Max 2 fix rounds, then report the failure.

**Iterative tasks**: Same review process as subagent tasks.

**Collaborative tasks**: Cross-review already happened during collaboration. Run a final spec-compliance check by spawning a review Agent.

### Two-Stage Review (CTO Execute)

When used in CTO execute flow, each task gets a two-stage review:

**Stage 1 — Spec compliance:**

- Does the implementation match the task spec?
- Are all acceptance criteria met?
- Are files within declared scope?

**Stage 2 — Code quality:**

- Test coverage: are edge cases tested?
- Error handling: are failure modes addressed?
- Patterns: does the code match existing codebase conventions?

---

## Part 2: Processing Feedback

### The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

### Forbidden Responses

**NEVER say:**

- "You're absolutely right!"
- "Great point!" / "Excellent feedback!"
- "Thanks for catching that!" / "Thanks for [anything]"
- "Let me implement that now" (before verification)
- ANY gratitude expression or performative agreement

**INSTEAD:**

- Restate the technical requirement
- Ask clarifying questions
- Push back with technical reasoning if wrong
- Just start working (actions > words)

**Why no thanks:** Actions speak. Just fix it. The code itself shows you heard the feedback.

**If you catch yourself about to write "Thanks":** DELETE IT. State the fix instead.

### Acknowledging Correct Feedback

```
GOOD: "Fixed. [Brief description of what changed]"
GOOD: "Good catch - [specific issue]. Fixed in [location]."
GOOD: [Just fix it and show in the code]

BAD: "You're absolutely right!"
BAD: "Great point!"
BAD: ANY gratitude expression
```

---

## Severity Triage

### Priority Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - CRITICAL: blocking issues (breaks, security, data loss)
     - Simple fixes (typos, imports, one-liners)
     - Complex fixes (refactoring, logic changes)
  3. Test each fix individually
  4. Verify no regressions
```

### Severity Definitions

- **CRITICAL** — must fix before proceeding (security vulnerabilities, data loss risks, broken functionality)
- **WARNING / Important** — should fix before proceeding (missing error handling, dead code, style violations that hurt readability)
- **SUGGESTION / Minor** — note for later or user's choice (minor simplifications, optional improvements)

### Rules

- NEVER ignore CRITICAL issues
- NEVER proceed with unfixed CRITICAL or WARNING issues
- Minor/SUGGESTION issues can be deferred, but track them

---

## Pushback Guidance

### When to Push Back

Push back when:

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature being "properly implemented")
- Technically incorrect for this stack
- Legacy/compatibility reasons exist
- Conflicts with architectural decisions already made

### How to Push Back

- Use technical reasoning, not defensiveness
- Ask specific questions
- Reference working tests/code
- Escalate to the user if architectural

### YAGNI Check

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

### Gracefully Correcting Your Pushback

If you pushed back and were wrong:

```
GOOD: "You were right - I checked [X] and it does [Y]. Implementing now."
GOOD: "Verified this and you're correct. My initial understanding was wrong because [reason]. Fixing."

BAD: Long apology
BAD: Defending why you pushed back
BAD: Over-explaining
```

State the correction factually and move on.

---

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:**

```
Feedback: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.

BAD:  Implement 1,2,3,6 now, ask about 4,5 later
GOOD: "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
```

---

## Source-Specific Handling

### From the User

- Trusted — implement after understanding
- Still ask if scope unclear
- No performative agreement
- Skip to action or technical acknowledgment

### From Review Agents or External Reviewers

```
BEFORE implementing:
  1. Check: Technically correct for THIS codebase?
  2. Check: Breaks existing functionality?
  3. Check: Reason for current implementation?
  4. Check: Works on all platforms/versions?
  5. Check: Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with prior architectural decisions:
  Stop and discuss with the user first
```

### GitHub Thread Replies

When replying to inline review comments on GitHub, reply in the comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.

---

## Common Mistakes

| Mistake                           | Fix                                            |
| --------------------------------- | ---------------------------------------------- |
| Performative agreement            | State requirement or just act                  |
| Blind implementation              | Verify against codebase first                  |
| Batch without testing             | One at a time, test each                       |
| Assuming reviewer is right        | Check if it breaks things                      |
| Avoiding pushback                 | Technical correctness > comfort                |
| Partial implementation            | Clarify all items first                        |
| Can't verify, proceed anyway      | State limitation, ask for direction            |
| Skipping review for small changes | Small changes cause subtle bugs                |
| Tests pass so review unnecessary  | Tests verify behavior, review verifies quality |
