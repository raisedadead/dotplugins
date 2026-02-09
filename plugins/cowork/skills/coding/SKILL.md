---
name: coding
description: >
  Use when the user asks to build a prototype, spike an idea, write a script, scaffold a project,
  or implement something quickly. Triggers on: "build", "prototype", "spike", "try out", "scaffold",
  "write a script", "implement", "create", "make".
---

# Coding — Quick Spikes

Prototype ideas quickly via subagent delegation. All output scoped to a session directory in `~/Claude-Workspaces/`.

## Workflow

1. **Understand** — Read the user's idea. If ambiguous about _what_ to build, ask ONE clarifying question. If only _how_ is unclear, decide yourself.

2. **Create session** — Run:

   ```bash
   python3 "$SKILL_DIR/../research/scripts/research_db.py" create-session --type spike --topic "Topic Name"
   ```

   Capture `session_dir` from JSON output. This creates `notes/`, `artifacts/`, and `src/` subdirectories.

3. **Plan** — Decompose into subtasks:
   - **Small** (1-2 files): Execute directly, no subagents needed
   - **Medium+** (3+ files): Dispatch subagents in parallel

4. **Execute via subagents** — Dispatch independent subtasks as parallel `Task` calls in ONE message:

   ```
   Task(subagent_type="general-purpose", prompt="Create <file> at <session_dir>/src/... Requirements: ... Constraint: ONLY write files under <session_dir>/")
   Task(subagent_type="general-purpose", prompt="Create <file> at <session_dir>/src/... Requirements: ... Constraint: ONLY write files under <session_dir>/")
   ```

   Each subagent gets:
   - Explicit file scope within session directory
   - Full task spec inline (subagents don't inherit conversation history)
   - Constraint: "ONLY modify files under `<session_dir>/`"
   - Available tools: Python 3, Node.js 22, Ruby, pandoc, ffmpeg, ImageMagick

5. **Verify** — After subagents complete:
   - Check files exist and aren't empty
   - Run tests/lints if applicable
   - Run the prototype if it's a script

6. **Persist** — Save a research note documenting the spike:

   ```bash
   python3 "$SKILL_DIR/../research/scripts/research_db.py" add \
     --topic "Spike: Topic" --query "What was built" --summary "Outcome" \
     --tags "spike" --confidence high \
     --session-dir "$SESSION_DIR" --session-type spike
   ```

7. **Report** — Brief summary: what was built, what works, what's next. No code dumps unless asked.

## Constraints

- No git operations (Cowork VM doesn't have your repos)
- No package publishing or deployment
- No modifying files outside the session directory
- Bias to action — make implementation decisions yourself, escalate only for architectural choices

## Path Resolution

This skill shares the research DB script. Path: `$SKILL_DIR/../research/scripts/research_db.py`

DB location: `~/Claude-Workspaces/research.db`
