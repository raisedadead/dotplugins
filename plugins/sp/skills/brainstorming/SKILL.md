---
name: brainstorming
description: Use before any creative work — creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.
---

# Brainstorming

Turn ideas into fully formed designs through collaborative dialogue before writing code.

## Process

1. **Understand context** — Read relevant code, recent commits, and project structure to ground the conversation.

2. **Ask questions one at a time** — Prefer multiple-choice. Don't overwhelm with many questions at once. Each question should build on the previous answer.

3. **Explore approaches** — Present 2-3 alternatives with trade-offs. Let the user choose direction. Don't settle on the first idea.

4. **Present design in sections** — Break the design into logical sections (200-300 words each). Validate each section before moving on.

5. **Save the design:**
   - Write to `.claude/plans/<domain>/01-design.md`
   - Update `.claude/plans/_index.md`

## Principles

- One question per message
- Multiple choice when possible
- YAGNI — remove features you don't need yet
- Go back and clarify if confused
- Explore alternatives before settling
- Validate incrementally, not all at once

## Next Step

After the design is saved, suggest: "Design saved. Use `writing-plans` to create the implementation plan."
