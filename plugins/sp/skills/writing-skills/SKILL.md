---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment. TDD applied to process documentation.
---

# Writing Skills

Create reusable skills following TDD principles applied to documentation.

## What Makes a Good Skill

- Reusable technique, pattern, or reference — not a one-off narrative
- Would reference again across projects
- Pattern applies broadly, not project-specific
- Others would benefit from it

**Don't create skills for:** one-off solutions, standard well-documented practices, project-specific conventions (use CLAUDE.md instead).

## SKILL.md Structure

```yaml
---
name: skill-name-with-hyphens
description: "Use when [triggering conditions]. [What symptoms indicate this skill applies]."
---
```

**CRITICAL — Claude Search Optimization (CSO):** The `description` field must describe ONLY triggering conditions, not the workflow. If the description summarizes the workflow, Claude may follow the description instead of reading the full skill.

```yaml
# BAD: summarizes workflow
description: "Dispatches subagent per task with code review between tasks"

# GOOD: just triggering conditions
description: "Use when executing implementation plans with independent tasks"
```

## Body Structure

1. **Overview** — Core principle in 1-2 sentences
2. **When to Use** — Symptoms and use cases
3. **Core Pattern** — Steps, tables, or code (whatever fits)
4. **Common Mistakes** — What goes wrong and how to fix it

## TDD for Skills

1. **RED** — Run a pressure scenario WITHOUT the skill. Document how the agent fails.
2. **GREEN** — Write the skill addressing those specific failures. Test WITH the skill.
3. **REFACTOR** — Close loopholes found during testing. Add red flags if needed.

## Guidelines

- Frontmatter: only `name` and `description` (max 1024 chars total)
- Name: letters, numbers, hyphens only
- Keep skills focused — one concept per skill
- Inline code unless it's a reusable tool (then separate file)
- One excellent example beats many mediocre ones
- Flowcharts only when decision is non-obvious
