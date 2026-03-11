# RFC Template

Use this as the structural backbone for RFCs. Adapt sections to the project — skip what doesn't apply, add what's missing. The goal is a document that a developer can read and implement without asking follow-up questions.

---

```markdown
# RFC: [Title]

**Status:** Draft | In Review | Approved | Superseded
**Author(s):** [Names]
**Date:** [YYYY-MM-DD]
**Reviewers:** [Names or teams]

## Summary

[2-3 sentences. What is being proposed and why. A busy engineer should be able to read this and decide if the rest is relevant to them.]

## Motivation

[Why is this needed NOW? What problem does it solve? What's the cost of NOT doing this? Include data, user feedback, incident reports, or metrics that justify the effort.]

## Goals and Non-Goals

### Goals

- [Specific, measurable outcomes this RFC aims to achieve]

### Non-Goals

- [Explicitly out of scope — prevents scope creep and sets expectations]

## Background

[Context a new team member would need. Current system state, relevant history, previous attempts and why they didn't work. Keep it factual and concise.]

## Detailed Design

### Overview

[High-level architecture. A diagram here is worth 1000 words — use Mermaid, ASCII art, or describe the diagram to include.]

### [Component/Subsystem 1]

[Detailed design for each major component. Include:]

- Responsibilities
- Interfaces (API contracts, data schemas, event formats)
- Data flow
- State management
- Error handling

### [Component/Subsystem 2]

[Repeat as needed]

### Data Model

[Schema changes, new tables/collections, data migration plan if applicable. Include before/after comparison for migrations.]

### API Design

[Endpoint definitions, request/response shapes, authentication, rate limiting. Be specific — include example payloads.]

## Protection Section

[MANDATORY — What must NOT change. List stable interfaces, contracts, and invariants that this RFC must preserve. This section prevents accidental breakage of existing consumers.]

### Stable Interfaces

- [API endpoint / function signature / protocol that existing consumers depend on]
- [Another stable interface]

### Invariants

- [Behavioral guarantee that must hold before and after this change]
- [Data consistency rule that cannot be violated]

### Migration Constraints

- [Backward compatibility requirement — e.g., "old clients must work for 90 days"]
- [Data format constraint — e.g., "existing records must remain readable without migration"]

## Alternatives Considered

### [Alternative 1]

- **Approach:** [Brief description]
- **Pros:** [What's good about it]
- **Cons:** [Why we didn't choose it]

### [Alternative 2]

[Repeat]

**Why the proposed approach wins:** [1-2 sentences tying it together]

## Migration & Rollout Strategy

[How does this get deployed? Feature flags? Percentage rollout? Blue-green? What's the rollback plan? How long do old and new coexist?]

### Rollout Phases

1. [Phase 1 — scope and criteria to advance]
2. [Phase 2 — scope and criteria to advance]

### Rollback Plan

[Specific steps to revert if issues arise. Include data rollback if applicable.]

## Security Considerations

[Authentication, authorization, data privacy, input validation, secrets management. Reference OWASP if applicable. If there are no security implications, explain why.]

- **Auth model:** [How authentication/authorization changes]
- **Data handling:** [PII, encryption at rest/in transit, retention]
- **Attack surface:** [New endpoints, inputs, or trust boundaries introduced]

## Performance & Scalability

[Expected load, latency targets, scaling strategy, resource estimates. Benchmarks if available.]

- **Latency targets:** [p50, p95, p99 for key operations]
- **Throughput:** [Expected QPS / concurrent users]
- **Resource budget:** [CPU, memory, storage estimates]
- **Scaling strategy:** [Horizontal/vertical, auto-scaling triggers]

## Observability

[Key metrics to monitor, alerting thresholds, logging strategy, dashboards needed. How will you know this is working correctly in production?]

- **Key metrics:** [List SLIs — latency, error rate, throughput]
- **Alerts:** [Threshold and escalation for each metric]
- **Logging:** [What to log, at what level, structured fields]
- **Dashboards:** [What dashboards to create or update]

## Testing Strategy

[Unit, integration, e2e, load testing plans. What specifically needs to be tested that's new or risky?]

- **Unit tests:** [Key logic to cover]
- **Integration tests:** [Component interactions to verify]
- **E2E tests:** [Critical user flows to validate]
- **Load/stress tests:** [Performance scenarios to simulate]
- **Chaos/failure tests:** [Failure modes to inject]

## Dependencies & Risks

| Risk     | Likelihood   | Impact       | Mitigation                 |
| -------- | ------------ | ------------ | -------------------------- |
| [Risk 1] | Low/Med/High | Low/Med/High | [How to prevent or handle] |

## Timeline & Milestones

| Milestone | Target Date | Dependencies         |
| --------- | ----------- | -------------------- |
| [Phase 1] | [Date]      | [What it depends on] |

## Open Questions

- [Questions that still need answers. Include who should answer them and by when.]

## References

- [Links to related docs, specs, prior art, research]
```

## Section Guidance

- **Protection Section** is mandatory. Every RFC changes something — explicitly listing what must NOT change prevents accidental breakage and gives reviewers a clear checklist.
- **Security** and **Observability** sections should never be "N/A." If there are genuinely no implications, explain why — this forces the author to think about it.
- **Alternatives Considered** must include at least one real alternative. "Do nothing" counts if you explain the cost.
- **Testing Strategy** should identify the riskiest parts of the change and ensure they have coverage.
