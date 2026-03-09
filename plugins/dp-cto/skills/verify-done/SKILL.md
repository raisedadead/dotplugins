---
name: verify-done
description: "Enforces evidence-based completion claims. Run before claiming work is complete, fixed, or passing. No 'should pass', no 'probably', no 'seems to' — only claims backed by fresh command output."
---

# dp-cto:verify-done — Verification Before Completion

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you have not run the verification command in this message, you cannot claim it passes. Period.

Violating the letter of this rule is violating the spirit of this rule.

## The Gate Function

```
BEFORE claiming any status, expressing satisfaction, or reporting completion:

1. IDENTIFY — What command proves this claim?
2. RUN    — Execute the command. Full, fresh, complete. No partial runs.
3. READ   — Read the full output. Check exit code. Count failures.
4. VERIFY — Does the output confirm the claim?
   - NO  → State the actual status with evidence.
   - YES → State the claim WITH the evidence.
5. CLAIM  — Only now may you make the claim.

Skip any step = fabrication, not verification.
```

## Common Failures

| Claim                   | Required Evidence                                | Not Sufficient                             |
| ----------------------- | ------------------------------------------------ | ------------------------------------------ |
| "Tests pass"            | Test command output showing 0 failures           | Previous run, "should pass", extrapolation |
| "Linter clean"          | Linter output showing 0 errors                   | Partial check, different tool passing      |
| "Build succeeds"        | Build command exit code 0                        | Linter passing, "logs look good"           |
| "Bug fixed"             | Reproduce original symptom: now passes           | "Code changed, assumed fixed"              |
| "Regression test works" | Red-green cycle: fail without fix, pass with fix | Test passes once without red phase         |
| "Agent completed"       | VCS diff shows expected changes                  | Agent self-reports "success"               |
| "Requirements met"      | Line-by-line checklist against spec              | "Tests pass" (tests != requirements)       |

## Rationalization Prevention

| Excuse                                  | Reality                                      |
| --------------------------------------- | -------------------------------------------- |
| "Should work now"                       | Run the verification.                        |
| "I'm confident"                         | Confidence is not evidence.                  |
| "Just this once"                        | No exceptions. Ever.                         |
| "Linter passed"                         | Linter is not compiler is not test runner.   |
| "Agent said success"                    | Verify independently. Agents lie.            |
| "Partial check is enough"               | Partial proves nothing about the whole.      |
| "Different wording, rule doesn't apply" | Spirit over letter. The rule always applies. |
| "It's a trivial change"                 | Trivial changes break production. Verify.    |

## Red Flags — STOP

If any of these appear, STOP and run the gate function:

| Red Flag                                     | Why It's Dangerous                             |
| -------------------------------------------- | ---------------------------------------------- |
| Using "should", "probably", "seems to"       | Hedging replaces evidence. Run the command.    |
| Expressing satisfaction before verification  | "Great!", "Done!", "Perfect!" with no output.  |
| About to commit, push, or create a PR        | Shipping unverified work breaks trust.         |
| Trusting agent success reports at face value | Agents hallucinate completion. Check the diff. |
| Relying on partial verification              | One passing test != all passing tests.         |
| Thinking "just this once"                    | Every shortcut erodes the standard.            |
| Any wording implying success without output  | Implication of success = unverified claim.     |

## Key Patterns

**Tests:**

```
CORRECT:  [run test command] → [output: 34/34 pass] → "All 34 tests pass"
WRONG:    "Should pass now" / "Looks correct" / "I fixed the issue"
```

**Regression tests (TDD red-green):**

```
CORRECT:  Write test → Run (fail) → Apply fix → Run (pass) → Revert fix → Run (MUST fail) → Restore fix → Run (pass)
WRONG:    "I've written a regression test" (without red-green verification)
```

**Build:**

```
CORRECT:  [run build] → [output: exit 0] → "Build succeeds"
WRONG:    "Linter passed so build should be fine"
```

**Requirements:**

```
CORRECT:  Re-read spec → Create line-by-line checklist → Verify each item → Report gaps or completion
WRONG:    "Tests pass, so requirements are met"
```

**Agent delegation:**

```
CORRECT:  Agent reports done → Check VCS diff → Verify changes match spec → Report actual state
WRONG:    "Agent reported success" (trust without verification)
```

## When To Apply

**ALWAYS before:**

- Any variation of success, completion, or correctness claims
- Any expression of satisfaction about work state
- Committing, pushing, creating PRs, or marking tasks done
- Moving to the next task or phase
- Reporting agent delegation results
- Any positive statement about work quality or status

**Rule applies to:**

- Exact phrases ("tests pass", "build succeeds")
- Paraphrases and synonyms ("everything's green", "all good")
- Implications of success ("we can move on", "that should do it")
- Any communication suggesting completion or correctness

## The Bottom Line

Run the command. Read the output. THEN claim the result.

No shortcuts. No exceptions. Non-negotiable.
