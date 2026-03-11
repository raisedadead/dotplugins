# ADR Template

Lightweight Architecture Decision Record. Should fit on one page when filled out. Use this for focused technical decisions that don't warrant a full RFC.

---

```markdown
# ADR-[NNN]: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-[NNN]
**Date:** [YYYY-MM-DD]
**Author(s):** [Names]
**Deciders:** [Names or teams who approved]

## Context

[What forces are at play? What is the technical or organizational situation that requires a decision? State facts, not opinions. 2-5 sentences.]

## Decision

[What is the change being proposed or adopted? State it as a declarative: "We will use X for Y." Be precise enough that someone can verify compliance. 1-3 sentences.]

## Consequences

### Positive

- [Benefit this decision enables]
- [Another benefit]

### Negative

- [Tradeoff or cost accepted]
- [Another tradeoff]

### Neutral

- [Side effect that is neither positive nor negative]

## Alternatives Considered

### [Alternative 1]

[1-2 sentences on what it is and why it was rejected.]

### [Alternative 2]

[1-2 sentences on what it is and why it was rejected.]

## References

- [Link to relevant RFC, PRD, prior ADR, or external resource]
```

## When to Use an ADR

- Single focused decision (technology choice, pattern adoption, convention change)
- Decision needs to be recorded for future team members
- Not enough scope or complexity for a full RFC
- Examples: "Use pnpm over npm," "Adopt conventional commits," "Switch from REST to gRPC for internal services"

## When to Escalate to RFC

- Decision involves cross-cutting changes to multiple systems
- Implementation plan is non-trivial (multi-week)
- Multiple viable alternatives need detailed comparison
- Decision has security, performance, or data model implications that need deep analysis
