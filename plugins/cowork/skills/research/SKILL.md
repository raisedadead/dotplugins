---
name: research
description: >
  Use when the user asks to research a topic, fact-check claims, gather up-to-date information,
  or when any task requires current/verified information from the web. Also triggers on: "look up",
  "find out", "what's the latest on", "investigate", "research", "fact check", "verify".
---

# Research

Structured web research with persistent, queryable storage. All research persists in `~/Claude-Workspaces/`.

## Workflow

1. **Scope** — Clarify what the user needs. Classify:
   - `quick-lookup`: Single question, 1-2 searches, inline answer
   - `deep-research`: Multi-faceted, 2-4 parallel subagents

2. **Create session** — Run:

   ```bash
   python3 "$SKILL_DIR/scripts/research_db.py" create-session --type <type> --topic "Topic Name"
   ```

   Capture the returned `session_dir` from JSON output.

3. **Check existing research** — Query the DB first:

   ```bash
   python3 "$SKILL_DIR/scripts/research_db.py" search "relevant term"
   ```

   Reuse and build on prior findings.

4. **Execute search:**

   **Quick lookup:** Search directly with `WebSearch`/`WebFetch`. Answer inline.

   **Deep research:** Decompose into 2-4 independent facets. Dispatch ALL as subagents via `Task` tool in ONE message for true parallelism:

   ```
   Task(subagent_type="research", prompt="Research facet: <specific angle>. Return JSON: {findings, sources: [{url, title, accessed}], confidence: high|medium|low}")
   Task(subagent_type="research", prompt="Research facet: <another angle>. Return JSON: ...")
   ```

   Each subagent:
   - Gets one specific facet/angle
   - Returns structured JSON (findings, sources, confidence)
   - Does NOT write files — parent synthesizes

5. **Synthesize** — Merge results. Cross-reference claims across sources. Flag conflicts. Assign confidence:
   - `high`: 3+ agreeing sources
   - `medium`: 2 sources or minor conflicts
   - `low`: single source or significant conflicts

6. **Persist** — Save to DB and session directory:

   ```bash
   python3 "$SKILL_DIR/scripts/research_db.py" add \
     --topic "Topic" --query "Original question" --summary "Findings" \
     --raw-findings "Detailed notes" \
     --sources '[{"url":"...","title":"...","accessed":"2026-02-09"}]' \
     --tags "tag1,tag2" --confidence high \
     --session-dir "$SESSION_DIR" --session-type deep-research
   ```

7. **Deliver** — Concise summary with confidence markers and source links. No lengthy reports unless asked.

## Path Resolution

Locate this SKILL.md on disk, then use its parent directory as `SKILL_DIR`. The script is at `$SKILL_DIR/scripts/research_db.py`.

DB location: `~/Claude-Workspaces/research.db` (override with `RESEARCH_WORKSPACE` env var).

## Failure Handling

- If `WebSearch`/`WebFetch` fails, log the failure, try alternate queries
- Report partial results with `low` confidence rather than failing silently
- Save research even if findings are negative ("X does not exist" is valuable)

## Research Quality Rules

- Never present single-source findings as fact — flag as `low` confidence
- Prefer primary sources over aggregator/blog posts
- Include access dates in source metadata
- When sources conflict, present both sides
- For technical topics, verify against official documentation
