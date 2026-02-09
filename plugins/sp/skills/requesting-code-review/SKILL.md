---
name: requesting-code-review
description: Use after completing tasks, implementing features, or before merging to verify work meets requirements. Dispatches code reviewer subagent.
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade.

## When to Use

**Mandatory:** After each task in a plan, after completing a feature, before merge.
**Optional:** When stuck (fresh perspective), before refactoring, after fixing complex bugs.

## Process

1. **Get git range:**
   ```bash
   BASE_SHA=$(git merge-base HEAD main)
   HEAD_SHA=$(git rev-parse HEAD)
   ```

2. **Dispatch reviewer** using the `sp:code-reviewer` agent via `Task` tool:

   ```
   Task(subagent_type="superpowers:code-reviewer", prompt="""
   Review: [what was implemented]
   Requirements: [what it should do — paste plan section or spec]
   Git range: BASE_SHA..HEAD_SHA
   Description: [brief summary of changes]

   Steps:
   1. git diff BASE_SHA..HEAD_SHA to see all changes
   2. Review against requirements
   3. Check code quality, tests, architecture
   4. Categorize issues as Critical/Important/Minor
   5. Give merge verdict
   """)
   ```

3. **Act on feedback:**

   | Severity | Action |
   |----------|--------|
   | Critical | Fix immediately |
   | Important | Fix before proceeding |
   | Minor | Note for later |

   Push back if reviewer is wrong — show code/tests as evidence.
