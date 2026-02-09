---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs. Evidence before assertions.
---

# Verification Before Completion

Evidence before claims, always. Claiming work is complete without verification is dishonesty.

## The Gate (Before ANY Completion Claim)

1. **IDENTIFY** — What command proves this claim?
2. **RUN** — Execute it fresh and complete (not from cache or memory)
3. **READ** — Full output. Check exit code. Count failures.
4. **VERIFY** — Does the output actually confirm the claim?
   - **No:** State actual status with evidence
   - **Yes:** State claim WITH evidence
5. **ONLY THEN** — Make the claim

## What Claims Require

| Claim | Requires | NOT Sufficient |
|-------|----------|----------------|
| "Tests pass" | Test command output: 0 failures | Previous run, "should pass" |
| "Linter clean" | Linter output: 0 errors | Partial check |
| "Build succeeds" | Build command: exit 0 | "Linter passed" |
| "Bug fixed" | Original symptom test passes | "Code changed" |
| "Requirements met" | Line-by-line checklist verified | "Tests passing" |
| "Agent completed" | VCS diff shows changes | Agent reports "success" |

## Red Flags — STOP and Run Verification

| Flag | Reality |
|------|---------|
| Using "should", "probably", "seems to" | Run the verification |
| Expressing satisfaction before verification ("Great!", "Done!") | Run the verification |
| About to commit/push/PR without verification | Run the verification |
| Trusting agent success reports without checking | Verify independently |
| "I'm confident" | Confidence is not evidence |
| "Just this once" / "Partial check is enough" | No exceptions |
