---
name: check
description: "Manual deep-validation of research findings. Forces structured claim-by-claim verification with evidence requirements."
---

# Deep Validation Check

Stop. Before presenting or finalizing any research-based response, systematically validate every factual claim.

## Process

### Step 1: Extract Claims

Scan the current conversation for all factual claims derived from research tool results (WebSearch, WebFetch, MCP lookups, Context7, DeepWiki). List every claim, no matter how minor.

If no research tool calls are present in this conversation, inform the user: "No research-derived claims found in this conversation. Use WebSearch, WebFetch, or MCP tools first, then re-run /dp-sct:check." and STOP.

### Step 2: Build Verification Table

For each claim, populate this table:

| #   | Claim | Source                    | Evidence                     | Verdict                              |
| --- | ----- | ------------------------- | ---------------------------- | ------------------------------------ |
| 1   | ...   | Tool/URL that produced it | Specific quote or data point | Verified / Unverified / Contradicted |

**Verdict definitions:**

- **Verified** — Direct evidence found, with source and date
- **Unverified** — No supporting evidence located yet
- **Contradicted** — Evidence found that conflicts with the claim

### Step 3: Resolve Unverified and Contradicted Claims

For each non-Verified claim:

1. Run at least one additional search targeting that specific claim
2. If evidence is found, update the table
3. If still unverified after search, mark it with a visible warning: `[UNVERIFIED]`
4. If contradicted, strike the original claim and present the corrected information

### Step 4: Blind Spot Audit

Check every claim against these categories. If any apply and were not explicitly verified, run a targeted search now.

| Blind Spot                  | What to Check                                                            |
| --------------------------- | ------------------------------------------------------------------------ |
| Pricing / tier requirements | Free vs paid? Usage limits? Rate limits? Quota thresholds?               |
| Version deprecation         | Is this API/feature/endpoint still current? Check release notes.         |
| Platform constraints        | OS support? Runtime version minimums? Environment requirements?          |
| Configuration prerequisites | What must already exist or be configured before this works?              |
| Breaking changes            | Any recent updates that invalidate the recommendation? Check changelogs. |

### Step 5: Final Summary

Present a structured report:

```
## Verification Report

**Total claims checked:** N
**Verified:** N | **Unverified:** N | **Contradicted:** N

### Verified Claims
- [list with source references]

### Flagged Items
- [UNVERIFIED] claim — reason no evidence was found
- [CONTRADICTED] claim — what the evidence actually shows

### Confidence Level
[HIGH / MEDIUM / LOW] — based on ratio of verified to total claims
```

## Anti-Rationalization Table

Before skipping any verification step, check this table:

| Thought                            | Reality                                             |
| ---------------------------------- | --------------------------------------------------- |
| "I already checked this"           | Show the evidence. No evidence = not checked.       |
| "This is common knowledge"         | Common knowledge is often outdated. Verify.         |
| "The source is reliable"           | Even official docs can be outdated. Check dates.    |
| "This is a minor detail"           | Minor details like pricing tiers cause real damage. |
| "I'll just note it might be wrong" | Hedge words are not verification. Find evidence.    |

## Rules

- NEVER skip claims that seem obvious
- NEVER present a hedge ("this might require...") as verification
- NEVER skip the pricing/tier check for any cloud service recommendation
- NEVER skip the version check for any library/API recommendation
- NEVER collapse multiple claims into one row to save time
- NEVER mark a claim as Verified without citing specific evidence
