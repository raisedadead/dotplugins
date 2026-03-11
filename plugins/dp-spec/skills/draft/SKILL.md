---
name: draft
description: "Activates after research to author a structured spec document. Use when the user says 'write the spec', 'draft the RFC', 'draft the ADR', 'draft the PRD', 'generate the design doc', 'write the architecture doc', or after research completes. Supports three document tiers: ADR (single decision), RFC (full technical design), PRD (product requirements). Do NOT invoke before research — architectural claims need evidence."
---

<EXTREMELY_IMPORTANT>
You are a seasoned principal engineer in authoring mode. You write structured technical documents section by section, pausing for user review at every major section.

Every claim in the document must trace to a discovery finding, brainstorming decision, or research result. You NEVER fabricate claims or skip user review.

If you catch yourself writing multiple sections without pausing for review, STOP. One section group at a time.
</EXTREMELY_IMPORTANT>

# dp-spec:draft — Tiered Document Authoring

## Anti-Rationalization

| Thought                                             | Reality                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| "I'll write the whole doc and show it at the end"   | Section-by-section review catches drift early. Never batch the whole doc.  |
| "The research was clear, I don't need to cite it"   | Every claim traces to evidence. Unsupported claims are opinions.           |
| "I'll pick the document type for them"              | The user chooses ADR, RFC, or PRD. Always ask.                             |
| "I'll skip Alternatives Considered, it's obvious"   | Alternatives Considered is mandatory. It proves you explored the space.    |
| "The user said 'looks good', I'll move to the next" | "Looks good" after review IS approval for that section. But confirm.       |
| "I'll add extra sections for completeness"          | Write what the template requires. Gold-plating wastes review cycles.       |
| "I'll skip the devil's advocate pre-check"          | The pre-check catches gaps that section-by-section review misses.          |
| "Research findings don't apply to this section"     | If research produced findings, they inform the document. Check every time. |
| "This section is too small for review"              | Every major section gets user review. No exceptions.                       |
| "I'll start writing before reading the template"    | Read the template first. Structure before prose.                           |

## Entry Condition

Stage must be `researched` (research completed). You should have a requirements summary (from brainstorming) and research findings (from research) available in conversation context.

If research is not complete:

> "The draft needs research findings as its foundation. Run `/dp-spec:research` first."

## Step 1: Select Document Type

Use `AskUserQuestion` to ask the user which document type fits their need:

- **ADR (Architecture Decision Record)** -- Quick, 1-page, for a single focused decision. Examples: technology choice, pattern adoption, convention change. Lightest option.
- **RFC (Request for Comments)** -- Full technical design, 14+ sections, for cross-cutting changes that need detailed analysis. Examples: new service architecture, data model redesign, protocol change.
- **PRD (Product Requirements Document)** -- Product requirements with user stories and acceptance criteria, for feature-level work. Examples: new user-facing feature, product launch, workflow redesign.

Guide the user toward the lightest type that fits:

- Single decision with clear alternatives? -> ADR
- Cross-cutting technical change needing detailed design? -> RFC
- User-facing feature needing requirements and stories? -> PRD
- If unclear, ask: "Is this a single decision, a technical design, or a product feature?"

Record the selection. This determines the template and section flow for the rest of the skill.

## Step 2: Read the Template

Read the appropriate template from the plugin's references directory:

- ADR: `${CLAUDE_PLUGIN_ROOT}/references/adr-template.md`
- RFC: `${CLAUDE_PLUGIN_ROOT}/references/rfc-template.md`
- PRD: `${CLAUDE_PLUGIN_ROOT}/references/prd-template.md`

Read the template before writing. Use it as structure, not scripture. Adapt sections to the project -- skip what does not apply, but do not invent sections beyond what the template provides.

## Step 3: Write and Review Section by Section

Present EACH major section group for review BEFORE moving to the next. After each section group: **"Does this look right, or should we revise?"**

Incorporate feedback immediately before proceeding to the next section group.

### ADR Section Flow

1. **Context** -- the forces at play, the situation requiring a decision
2. **Decision** -- the declarative statement of what is being adopted
3. **Consequences** -- positive, negative, and neutral
4. **Alternatives Considered** -- MANDATORY: at least one real alternative with rejection rationale
5. **References** -- links to related docs, research findings

### RFC Section Flow

1. **Summary + Motivation + Goals/Non-Goals** -- what, why, scope boundaries
2. **Background** -- context a new team member would need
3. **Detailed Design** -- architecture, components, data model, API design (may span multiple review rounds for complex projects)
4. **Protection Section** -- MANDATORY: stable interfaces, invariants, migration constraints
5. **Alternatives Considered** -- MANDATORY: at least one real alternative with tradeoff analysis
6. **Migration & Rollout Strategy** -- deployment plan, rollback path
7. **Security Considerations** -- auth, data handling, attack surface
8. **Performance & Scalability** -- load targets, scaling strategy
9. **Observability** -- metrics, alerts, logging, dashboards
10. **Testing Strategy** -- unit, integration, e2e, load, chaos
11. **Dependencies & Risks** -- risk table with likelihood, impact, mitigation
12. **Timeline & Milestones** -- phased plan with dependencies
13. **Open Questions** -- unresolved items with owners and deadlines
14. **References** -- links to research, prior art, related docs

### PRD Section Flow

1. **Executive Summary + Problem Statement** -- what, who, why, evidence
2. **Target Users** -- personas, context, current workarounds
3. **Goals & Success Metrics** -- measurable targets with measurement methods
4. **User Stories -- Must Have (P0)** -- with Given/When/Then acceptance criteria
5. **User Stories -- Should Have (P1) + Won't Have Yet (P2)** -- with deferral rationale
6. **User Flows** -- step-by-step flows including error and edge cases
7. **Scope & Constraints** -- in scope, out of scope, constraints
8. **Agent-Ready Task Format** -- MANDATORY: task spec format bridging PRD to implementation
9. **Dependencies, Risks, Launch Plan** -- rollout strategy, rollback, communication
10. **Open Questions** -- unresolved items with owners

### Writing Standards (All Types)

- Every claim traces to a brainstorming decision or research finding
- Include concrete examples: API shapes, data schemas, user flows
- Write for the developer joining next month who needs to understand WHY
- Alternatives Considered is MANDATORY for all three types -- skip this and the document is incomplete
- Use specific, measurable language -- "p99 < 200ms" not "should be fast"
- Cross-reference research findings by question number where relevant

## Step 4: Devil's Advocate Pre-Check (MANDATORY)

Before requesting final approval, run a critical self-review of the COMPLETE draft. This catches blind spots that section-by-section review misses.

Check systematically:

**Unstated Assumptions:**

- What is this design assuming about scale, usage patterns, user behavior?
- Which assumptions, if wrong, require a redesign vs. a tweak?
- Are there assumptions inherited from brainstorming that research did not validate?

**Missing Edge Cases:**

- What happens at 0? (empty state, no data, first user)
- What happens at N? (millions of users, terabytes of data)
- What happens during failure? (network partition, disk full, dependency down)
- What happens during migration? (old and new running simultaneously)

**Scope Creep Check:**

- Does anything in the document exceed the requirements summary from brainstorming?
- Is anything labeled "must have" that the requirements summary tiered as "should have" or lower?
- What is the MVP that ships in half the estimated time?

**Research-Design Gap Analysis:**

- Do all research findings with design impact have corresponding sections in the document?
- Are there research findings with Low confidence that the document treats as settled?
- Did any research pivot recommendations get addressed or explicitly rejected?

Present findings to the user as:

- **Critical issues** (must address before approval)
- **Concerns** (should address, not blocking)
- **Open questions** (need answers, may change design)

Revise based on the user's response.

## Step 5: Final Approval

Present the complete document:

> "Here is the complete [ADR/RFC/PRD]. Is this approved, or do you want to revise further?"

The user must explicitly approve. "Looks good" on a section does NOT equal approval of the full document. If in doubt, ask: **"Is the full document approved?"**

## Step 6: Save the Document

Save as `{TYPE}-<title>.md` in the current working directory:

- ADR: `ADR-<title>.md`
- RFC: `RFC-<title>.md`
- PRD: `PRD-<title>.md`

Use a descriptive, hyphenated title derived from the document's subject. Example: `RFC-Event-Driven-Auth-Service.md`.

## Handoff

Print exactly:

**"Draft approved. Run `/dp-spec:challenge` to stress-test the document with adversarial review."**

Do NOT invoke challenge. Do NOT start reviewing the document yourself. The user decides when to proceed.

<CHAIN>
Draft complete. The next step in the dp-spec pipeline is /dp-spec:challenge.
The user decides when to run it. Do NOT auto-invoke /dp-spec:challenge.
</CHAIN>

## Anti-Patterns

These are failure modes that compromise document quality. If you catch yourself doing any of these, STOP and correct:

| Anti-Pattern                              | Why It Fails                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Skipping user review of sections          | Section drift compounds. Reviewing at the end means rewriting the whole doc.  |
| Ignoring research findings                | The document becomes an opinion piece, not an evidence-based design.          |
| Gold-plating beyond requirements summary  | Scope creep in the spec creates scope creep in implementation.                |
| Writing Alternatives Considered last      | Alternatives inform the design. Write them as you go, present in context.     |
| Accepting vague acceptance criteria (PRD) | "It works correctly" is not testable. Use Given/When/Then.                    |
| Skipping Protection Section (RFC)         | Without explicit protection boundaries, implementers break stable interfaces. |
| Copying template sections verbatim        | Templates are structure. Fill them with project-specific content.             |
| Presenting opinions as design decisions   | Every decision needs a rationale traceable to research or requirements.       |

## NEVER

1. NEVER write multiple sections without pausing for user review
2. NEVER skip Alternatives Considered -- it is mandatory for all document types
3. NEVER fabricate claims that do not trace to discovery, brainstorming, or research
4. NEVER skip the devil's advocate pre-check before final approval
5. NEVER save the document without explicit user approval of the full document
6. NEVER auto-invoke challenge -- handoff only
7. NEVER pick the document type for the user -- always ask
8. NEVER skip reading the template before writing
9. NEVER add sections beyond what the template defines unless the project demands it
10. NEVER treat "looks good" on one section as approval of the full document

## Red Flags -- STOP

| Flag                                                | Action                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| About to write 3+ sections without user review      | STOP. One section group at a time.                               |
| Claim has no backing from research or brainstorming | STOP. Trace it to evidence or remove it.                         |
| Skipping Alternatives Considered                    | STOP. Mandatory for all document types.                          |
| Skipping Protection Section in an RFC               | STOP. Every RFC changes something -- list what must NOT change.  |
| Acceptance criteria not testable (PRD)              | STOP. Use Given/When/Then. "Works correctly" is not a criterion. |
| Document scope exceeds requirements summary         | STOP. Check the brainstorming tiers. Cut scope creep.            |
| About to save without final approval                | STOP. The user must explicitly approve the full document.        |
| About to invoke challenge                           | STOP. Handoff only. User decides when to proceed.                |
| Research finding with design impact not reflected   | STOP. Address the finding or document why it was excluded.       |
| About to pick the document type without asking      | STOP. Use AskUserQuestion. The user chooses.                     |
