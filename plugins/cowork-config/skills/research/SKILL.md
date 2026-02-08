---
name: research
description: >
  Deep web research skill with fact-checking, source verification, and persistent disk-backed storage.
  Use when the user asks to research a topic, fact-check claims, gather up-to-date information,
  or when any task requires current/verified information from the web. Also triggers on: "look up",
  "find out", "what's the latest on", "investigate", "research", "fact check", "verify".
  Saves all research to a queryable SQLite database with markdown exports for future reference.
---

# Research

Structured web research with persistent, queryable storage.

## Workflow

1. **Scope** — Clarify what the user needs (depth, angle, deliverable).
2. **Search** — Use `WebSearch` and `WebFetch` to gather information. Prefer multiple independent queries for breadth. Run searches in parallel when queries are independent.
3. **Fact-check** — Cross-reference claims across 2+ sources. Flag conflicts. Assign confidence: `high` (3+ agreeing sources), `medium` (2 sources or minor conflicts), `low` (single source or significant conflicts).
4. **Save** — Persist every research session to the database (see below).
5. **Deliver** — Summarize findings to the user. Cite sources inline. Attach confidence levels to key claims.

## Database Operations

Script: `scripts/research_db.py` in this skill's directory.

**Path resolution:** Locate this SKILL.md on disk, then use its parent directory as `SKILL_DIR`. The script is at `$SKILL_DIR/scripts/research_db.py`.

The script respects these env vars for DB location (checked in order):
1. `RESEARCH_WORKSPACE` — explicit override
2. `COWORK_WORKSPACE` — set by Cowork runtime
3. Falls back to `~/Claude-Workspaces`

### First-time setup
```bash
python3 "$SKILL_DIR/scripts/research_db.py" init
```

### Save research
```bash
python3 "$SKILL_DIR/scripts/research_db.py" add \
  --topic "Topic Name" \
  --query "The original question or search query" \
  --summary "Concise findings with key facts" \
  --raw-findings "Detailed notes, quotes, data points" \
  --sources '[{"url":"https://...","title":"Source Title","accessed":"2026-02-07"}]' \
  --tags "tag1,tag2" \
  --confidence high
```

### Query past research
```bash
# Full-text search
python3 "$SKILL_DIR/scripts/research_db.py" search "search term"

# By topic or tag
python3 "$SKILL_DIR/scripts/research_db.py" query --topic "topic"
python3 "$SKILL_DIR/scripts/research_db.py" query --tag "tag"

# Recent notes
python3 "$SKILL_DIR/scripts/research_db.py" list --limit 10

# All topics
python3 "$SKILL_DIR/scripts/research_db.py" topics
```

### Before starting new research

ALWAYS check the database first for existing research on the topic:
```bash
python3 "$SKILL_DIR/scripts/research_db.py" search "relevant term"
```
Reuse and build on prior findings. Avoid redundant searches.

## Research Quality Rules

- Never present single-source findings as fact without flagging confidence as `low`.
- Prefer primary sources (official docs, papers, direct announcements) over aggregator/blog posts.
- Include access dates in source metadata — web content changes.
- When sources conflict, present both sides with the conflict noted.
- For technical topics (APIs, libraries, frameworks), verify against official documentation.
- Save research even if the findings are negative ("X does not exist" is valuable).

## Output Format

When delivering research to the user, keep it tight:

**For quick lookups:** Inline answer with source link, no file needed.

**For substantial research:** Save to DB, then provide a concise summary with:
- Key findings (with confidence markers)
- Notable conflicts or caveats
- Source links

Do NOT generate lengthy reports unless the user explicitly asks for a document.

## Storage Layout

All research persists at:
```
WORKSPACE/research/
├── research.db          # SQLite database (queryable)
└── notes/               # Markdown exports (human-readable)
    ├── 0001-topic-slug.md
    └── ...
```
