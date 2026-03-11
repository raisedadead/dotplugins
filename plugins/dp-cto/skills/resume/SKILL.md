---
name: resume
description: "Resume a previously suspended epic. Queries beads for suspended epics, restores context from suspension notes, and shows actionable next steps. Use after /dp-cto:interrupt to return to prior work."
---

# dp-cto:resume — Resume Suspended Work

## Stage Enforcement

This skill is allowed from `idle` only. The PreToolUse hook enforces this. You must not have an active epic — if one exists, use `/dp-cto:interrupt` to suspend it first, then resume the target epic.

## Step 1: Query Suspended Epics

Query beads for all suspended epics:

```bash
bd query "label=dp-cto:suspended" --json
```

- If the query returns empty, null, or an empty array: say **"No suspended epics found. Use `/dp-cto:start` to begin new work."** and STOP.

Parse the results to extract for each epic: `id`, `title`, and `notes` (if available).

## Step 2: Select Epic (if multiple)

- **One suspended epic**: proceed directly with that epic.
- **Multiple suspended epics**: present choices via `AskUserQuestion`:

  Question: "Which suspended epic should we resume?"

  Options: list each epic with its ID, title, and the first line of its SUSPENDED notes (timestamp + stage + progress). Format each option as:

  ```
  {epic-id}: {title} (suspended {relative-time}, {progress})
  ```

  The user selects one.

## Step 3: Read Suspension Context

Read the full epic details and suspension notes:

```bash
bd show {epic-id} --json
```

Extract the SUSPENDED entry from the epic's notes. Parse the structured fields:

- **Stage**: what stage the work was at when suspended
- **Progress**: how many tasks were complete
- **In-progress**: what was being worked on
- **Ready next**: what was queued for dispatch
- **Blockers**: any known blockers
- **Context**: the human-readable summary of what was happening

If no SUSPENDED notes are found (edge case — manual suspension or data loss), proceed with what beads has: the task list and their statuses.

## Step 4: Resume State

Restore the epic to active status. The prior stage comes from the SUSPENDED notes parsed in Step 3.

Set the beads label to restore the prior stage:

```bash
bd set-state {epic-id} "dp-cto={prior-stage}"
```

Where `{prior-stage}` is the stage from the SUSPENDED notes (typically `executing` or `polishing`). If no prior stage is recoverable, default to `planned`.

Update the local cache:

```bash
jq -c \
  --arg epic "{epic-id}" \
  --arg stage "{prior-stage}" \
  --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.active_epic = $epic |
   .stage = $stage |
   .suspended = [.suspended[] | select(. != $epic)] |
   .synced_at = $now' \
  .claude/dp-cto/cache.json > .claude/dp-cto/cache.json.tmp && \
  mv .claude/dp-cto/cache.json.tmp .claude/dp-cto/cache.json
```

The PostToolUse hook does NOT handle resume state transitions — the skill manages this directly because it needs the prior stage from suspension notes.

## Step 5: Show Available Work

Query the executable frontier for the resumed epic:

```bash
bd ready --json
```

Also check for in-progress tasks that may have been left mid-flight:

```bash
bd list --parent {epic-id} --status in-progress --json
```

## Step 6: Present Resumption Context

Present a clear resumption briefing to the user:

```
## Resumed: {epic-title} (`{epic-id}`)

**Suspended**: {suspension timestamp}
**Stage**: {prior-stage} (restored)
**Progress**: {closed}/{total} tasks complete

### Context from suspension
{The Context field from SUSPENDED notes — what was happening when work was interrupted}

### In-progress tasks (may need review)
{List of in-progress task titles, or "None — all dispatched tasks completed before suspension"}

### Ready for dispatch
{List of ready task titles with IDs, or "No tasks ready — check dependencies"}

### Blockers noted at suspension
{Blockers field, or "None"}
```

Then advise on the appropriate next step based on the restored stage:

- If stage is `executing` or `planned`: **"Continue with `/dp-cto:execute` to dispatch ready tasks."**
- If stage is `polishing`: **"Continue with `/dp-cto:polish` to complete the review phase."**

## NEVER

1. NEVER resume without showing the suspension context — the user needs to re-orient
2. NEVER auto-dispatch tasks after resume — present the state and let the user decide
3. NEVER resume if there is already an active epic — interrupt the current one first
4. NEVER discard suspension notes after reading — they stay in the epic's history
5. NEVER guess the prior stage — read it from the SUSPENDED notes or beads labels

## Red Flags — STOP

| Flag                                    | Action                                                    |
| --------------------------------------- | --------------------------------------------------------- |
| No suspended epics found                | STOP. Nothing to resume.                                  |
| Active epic already exists in cache     | STOP. Interrupt or complete current work first.           |
| Suspension notes missing or unparseable | WARN the user, then proceed with task list from beads.    |
| About to auto-dispatch tasks            | STOP. Present context and let the user invoke execute.    |
| Prior stage is unrecoverable            | Default to `planned` and inform the user of the fallback. |
