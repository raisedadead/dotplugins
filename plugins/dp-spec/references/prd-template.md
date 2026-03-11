# PRD Template

Use this for product-facing requirements. The PRD answers "what are we building and for whom?" while the RFC answers "how are we building it?" They complement each other. Adapt sections to fit — not every project needs every section.

---

```markdown
# PRD: [Feature/Product Name]

**Status:** Draft | In Review | Approved
**Author(s):** [Names]
**Date:** [YYYY-MM-DD]
**Target Release:** [Version or date]

## Executive Summary

[3-5 sentences. What is this, who is it for, and why does it matter? Write this for a stakeholder who will read nothing else.]

## Problem Statement

[What pain point or opportunity does this address? Include evidence: user research, support tickets, metrics, competitive pressure. Quantify the impact where possible.]

## Target Users

### Primary

- **Persona:** [Who they are]
- **Context:** [When/where they encounter this problem]
- **Current workaround:** [How they solve it today]

### Secondary

- [Other affected users, if applicable]

## Goals & Success Metrics

| Goal     | Metric   | Target         | Measurement Method   |
| -------- | -------- | -------------- | -------------------- |
| [Goal 1] | [Metric] | [Target value] | [How you'll measure] |

## User Stories & Requirements

### Must Have (P0) — Ship-blocking

**US-1: [Story title]**

- As a [user type], I want to [action] so that [outcome]
- **Acceptance Criteria:**
  - Given [context], when [action], then [expected result]
  - Given [context], when [edge case], then [expected result]

**US-2: [Story title]**
[Repeat]

### Should Have (P1) — Include if timeline permits

**US-N: [Story title]**
[Repeat format]

### Won't Have Yet (P2) — Explicitly deferred

- [Feature/capability] — Deferred because [reason]. Revisit in [timeframe].

## User Flows

### [Flow 1: e.g., "New User Onboarding"]

1. User [action]
2. System [response]
3. User [action]
4. ...

[Include decision points, error states, and edge cases. A flowchart or sequence diagram is ideal here.]

### [Flow 2]

[Repeat]

## Scope & Constraints

### In Scope

- [Specific boundaries of what this covers]

### Out of Scope

- [What this explicitly does NOT cover]

### Constraints

- [Technical, timeline, resource, compliance, or business constraints]

## Agent-Ready Task Format

[MANDATORY — Defines the handoff format for implementation agents. Each user story above should map to one or more implementation tasks in this format. This section bridges the "what" (PRD) and the "how" (implementation).]

### Task Specification Format

Each implementation task derived from this PRD should include:

- **Source:** [US-N reference — which user story this implements]
- **Objective:** [Single clear sentence — what the task accomplishes]
- **Inputs:** [What the agent receives — files, data, API access, context]
- **Outputs:** [What the agent produces — files created/modified, tests, artifacts]
- **Verification:** [How to confirm the task is done — specific test commands, assertions, or observable outcomes]
- **Boundaries:** [What the agent must NOT do — files to avoid, patterns to preserve, scope limits]

### Example Task

- **Source:** US-1
- **Objective:** [Implement the core behavior described in US-1]
- **Inputs:** [Relevant source files, schema definitions, API specs]
- **Outputs:** [New/modified files, test files, updated configs]
- **Verification:** [Run `pnpm test`, verify endpoint returns 200 with expected payload]
- **Boundaries:** [Do not modify auth middleware, preserve backward compatibility with v1 API]

## Dependencies

- [External teams, services, APIs, or decisions this depends on]
- [Timeline dependencies — what blocks what]

## Risks & Mitigations

| Risk   | Impact         | Mitigation              |
| ------ | -------------- | ----------------------- |
| [Risk] | [What happens] | [How to prevent/handle] |

## Launch Plan

### Rollout Strategy

[Phased? Feature-flagged? Beta group? Full release?]

### Communication Plan

[Who needs to know? Docs updates, changelog, user notifications?]

### Rollback Plan

[How to undo if things go wrong?]

## Open Questions

- [ ] [Question — Owner — Due date]
```

## Section Guidance

- **Acceptance Criteria** must be testable. "It works correctly" is not a criterion. Use Given/When/Then format for clarity.
- **Agent-Ready Task Format** is mandatory. This section is what makes the PRD actionable for automated implementation. Without it, the handoff to dp-cto:execute or similar tools requires manual decomposition.
- **P0/P1/P2 prioritization** is strict: P0 = must ship, P1 = ship if time allows, P2 = explicitly deferred. Do not use P0 for everything.
- **User Flows** should cover the happy path, at least one error path, and edge cases. If a flow has more than 10 steps, consider splitting it.
