#!/usr/bin/env python3
"""
Research Database - SQLite-backed research note storage and query interface.

Usage:
    research_db.py init                          Initialize the database
    research_db.py create-session --type TYPE --topic TOPIC
                                                 Create a new research session directory
    research_db.py add --topic TOPIC --query QUERY --summary SUMMARY [--sources JSON] [--tags TAGS] [--confidence LEVEL] [--session-dir DIR] [--session-type TYPE]
    research_db.py search TERM                   Full-text search across all fields
    research_db.py query --topic TOPIC           Find notes by topic
    research_db.py query --tag TAG               Find notes by tag
    research_db.py query --since DATE            Find notes since DATE (YYYY-MM-DD)
    research_db.py query --session-type TYPE     Find notes by session type
    research_db.py list [--limit N]              List recent notes
    research_db.py get ID                        Get full detail for a note
    research_db.py export [--format json|md]     Export all notes
    research_db.py topics                        List all topics with counts
    research_db.py tags                          List all tags with counts
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve workspace root (checked in order):
# 1. RESEARCH_WORKSPACE env var
# 2. ~/Claude-Workspaces
WORKSPACE_ROOT = Path(
    os.environ.get(
        "RESEARCH_WORKSPACE",
        str(Path.home() / "Claude-Workspaces"),
    )
)
DB_PATH = WORKSPACE_ROOT / "research.db"


def get_db():
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL,
            query TEXT NOT NULL,
            summary TEXT NOT NULL,
            raw_findings TEXT,
            sources TEXT,  -- JSON array of {url, title, accessed}
            tags TEXT,     -- comma-separated
            confidence TEXT DEFAULT 'medium',  -- low/medium/high
            session_dir TEXT,
            session_type TEXT DEFAULT 'deep-research',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            topic, query, summary, raw_findings, tags, session_type,
            content='notes',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, topic, query, summary, raw_findings, tags, session_type)
            VALUES (new.id, new.topic, new.query, new.summary, new.raw_findings, new.tags, new.session_type);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, topic, query, summary, raw_findings, tags, session_type)
            VALUES ('delete', old.id, old.topic, old.query, old.summary, old.raw_findings, old.tags, old.session_type);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, topic, query, summary, raw_findings, tags, session_type)
            VALUES ('delete', old.id, old.topic, old.query, old.summary, old.raw_findings, old.tags, old.session_type);
            INSERT INTO notes_fts(rowid, topic, query, summary, raw_findings, tags, session_type)
            VALUES (new.id, new.topic, new.query, new.summary, new.raw_findings, new.tags, new.session_type);
        END;

        CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic);
        CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
        CREATE INDEX IF NOT EXISTS idx_notes_session_type ON notes(session_type);
    """
    )
    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")


def _make_slug(text, max_len=50):
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9-]', '-', slug)
    slug = re.sub(r'-{2,}', '-', slug)
    slug = slug.strip('-')
    return slug[:max_len].rstrip('-')


def create_session(session_type, topic):
    slug = _make_slug(topic)
    dir_name = f"{session_type}-{slug}"
    session_path = WORKSPACE_ROOT / dir_name

    if session_path.exists():
        counter = 2
        while True:
            candidate = WORKSPACE_ROOT / f"{dir_name}-{counter}"
            if not candidate.exists():
                session_path = candidate
                slug = f"{slug}-{counter}"
                break
            counter += 1

    session_path.mkdir(parents=True, exist_ok=True)
    (session_path / "notes").mkdir(exist_ok=True)
    (session_path / "artifacts").mkdir(exist_ok=True)
    if session_type == "spike":
        (session_path / "src").mkdir(exist_ok=True)

    result = {
        "session_dir": str(session_path),
        "slug": slug,
        "type": session_type,
    }
    print(json.dumps(result))
    return result


def add_note(
    topic, query, summary, raw_findings=None, sources=None, tags=None,
    confidence="medium", session_dir=None, session_type=None,
):
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """INSERT INTO notes (topic, query, summary, raw_findings, sources, tags, confidence, session_dir, session_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (topic, query, summary, raw_findings, sources, tags, confidence, session_dir, session_type, now, now),
    )
    note_id = cursor.lastrowid
    conn.commit()
    conn.close()

    _save_note_md(note_id, topic, query, summary, raw_findings, sources, tags, confidence, now, session_dir)
    print(json.dumps({"id": note_id, "status": "saved", "path": str(DB_PATH)}))
    return note_id


def _save_note_md(note_id, topic, query, summary, raw_findings, sources, tags, confidence, created_at, session_dir=None):
    if session_dir:
        notes_dir = Path(session_dir) / "notes"
    else:
        notes_dir = WORKSPACE_ROOT / "notes"
    notes_dir.mkdir(parents=True, exist_ok=True)

    slug = _make_slug(topic)
    filename = f"{note_id:04d}-{slug}.md"
    path = notes_dir / filename

    lines = [
        f"# {topic}",
        f"\n**Query:** {query}",
        f"**Confidence:** {confidence}",
        f"**Date:** {created_at}",
    ]
    if tags:
        lines.append(f"**Tags:** {tags}")

    lines.append(f"\n## Summary\n\n{summary}")

    if raw_findings:
        lines.append(f"\n## Raw Findings\n\n{raw_findings}")

    if sources:
        lines.append("\n## Sources\n")
        try:
            src_list = json.loads(sources)
            for s in src_list:
                title = s.get("title", s.get("url", "Unknown"))
                url = s.get("url", "")
                accessed = s.get("accessed", "")
                lines.append(
                    f"- [{title}]({url})" + (f" (accessed {accessed})" if accessed else "")
                )
        except (json.JSONDecodeError, TypeError):
            lines.append(f"- {sources}")

    path.write_text("\n".join(lines))


def search(term):
    conn = get_db()
    rows = conn.execute(
        """SELECT n.* FROM notes n
           JOIN notes_fts f ON n.id = f.rowid
           WHERE notes_fts MATCH ?
           ORDER BY rank""",
        (term,),
    ).fetchall()
    conn.close()
    return _format_rows(rows)


def query_by(field, value):
    conn = get_db()
    if field == "topic":
        rows = conn.execute(
            "SELECT * FROM notes WHERE topic LIKE ? ORDER BY created_at DESC",
            (f"%{value}%",),
        ).fetchall()
    elif field == "tag":
        rows = conn.execute(
            "SELECT * FROM notes WHERE tags LIKE ? ORDER BY created_at DESC",
            (f"%{value}%",),
        ).fetchall()
    elif field == "since":
        rows = conn.execute(
            "SELECT * FROM notes WHERE created_at >= ? ORDER BY created_at DESC",
            (value,),
        ).fetchall()
    elif field == "session_type":
        rows = conn.execute(
            "SELECT * FROM notes WHERE session_type = ? ORDER BY created_at DESC",
            (value,),
        ).fetchall()
    else:
        rows = []
    conn.close()
    return _format_rows(rows)


def list_notes(limit=20):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM notes ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return _format_rows(rows)


def get_note(note_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    if row:
        return json.dumps(dict(row), indent=2)
    return json.dumps({"error": "not found"})


def list_topics():
    conn = get_db()
    rows = conn.execute(
        "SELECT topic, COUNT(*) as count FROM notes GROUP BY topic ORDER BY count DESC"
    ).fetchall()
    conn.close()
    return json.dumps([dict(r) for r in rows], indent=2)


def list_tags():
    conn = get_db()
    rows = conn.execute("SELECT tags FROM notes WHERE tags IS NOT NULL").fetchall()
    conn.close()
    tag_counts = {}
    for row in rows:
        for tag in row["tags"].split(","):
            tag = tag.strip()
            if tag:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
    sorted_tags = sorted(tag_counts.items(), key=lambda x: -x[1])
    return json.dumps([{"tag": t, "count": c} for t, c in sorted_tags], indent=2)


def export_all(fmt="json"):
    conn = get_db()
    rows = conn.execute("SELECT * FROM notes ORDER BY created_at DESC").fetchall()
    conn.close()
    if fmt == "json":
        return json.dumps([dict(r) for r in rows], indent=2)
    lines = ["# Research Notes\n"]
    for r in rows:
        lines.append(f"## [{r['id']}] {r['topic']}\n")
        lines.append(f"**Query:** {r['query']}")
        lines.append(f"**Confidence:** {r['confidence']} | **Date:** {r['created_at']}\n")
        lines.append(f"{r['summary']}\n")
        lines.append("---\n")
    return "\n".join(lines)


def _format_rows(rows):
    return json.dumps([dict(r) for r in rows], indent=2)


def main():
    parser = argparse.ArgumentParser(description="Research note database")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("init")

    cs_p = sub.add_parser("create-session")
    cs_p.add_argument(
        "--type", required=True, dest="session_type",
        choices=["deep-research", "quick-lookup", "spike"],
    )
    cs_p.add_argument("--topic", required=True)

    add_p = sub.add_parser("add")
    add_p.add_argument("--topic", required=True)
    add_p.add_argument("--query", required=True)
    add_p.add_argument("--summary", required=True)
    add_p.add_argument("--raw-findings")
    add_p.add_argument("--sources", help="JSON array of source objects")
    add_p.add_argument("--tags", help="Comma-separated tags")
    add_p.add_argument("--confidence", default="medium", choices=["low", "medium", "high"])
    add_p.add_argument("--session-dir", help="Session directory for note file output")
    add_p.add_argument("--session-type", choices=["deep-research", "quick-lookup", "spike"])

    search_p = sub.add_parser("search")
    search_p.add_argument("term")

    query_p = sub.add_parser("query")
    query_p.add_argument("--topic")
    query_p.add_argument("--tag")
    query_p.add_argument("--since")
    query_p.add_argument("--session-type", dest="session_type",
                         choices=["deep-research", "quick-lookup", "spike"])

    list_p = sub.add_parser("list")
    list_p.add_argument("--limit", type=int, default=20)

    get_p = sub.add_parser("get")
    get_p.add_argument("id", type=int)

    export_p = sub.add_parser("export")
    export_p.add_argument("--format", default="json", choices=["json", "md"])

    sub.add_parser("topics")
    sub.add_parser("tags")

    args = parser.parse_args()

    if args.command == "init":
        init_db()
    elif args.command == "create-session":
        create_session(args.session_type, args.topic)
    elif args.command == "add":
        add_note(
            args.topic, args.query, args.summary,
            args.raw_findings, args.sources, args.tags, args.confidence,
            getattr(args, 'session_dir', None),
            getattr(args, 'session_type', None),
        )
    elif args.command == "search":
        print(search(args.term))
    elif args.command == "query":
        if args.topic:
            print(query_by("topic", args.topic))
        elif args.tag:
            print(query_by("tag", args.tag))
        elif args.since:
            print(query_by("since", args.since))
        elif args.session_type:
            print(query_by("session_type", args.session_type))
    elif args.command == "list":
        print(list_notes(args.limit))
    elif args.command == "get":
        print(get_note(args.id))
    elif args.command == "export":
        print(export_all(args.format))
    elif args.command == "topics":
        print(list_topics())
    elif args.command == "tags":
        print(list_tags())
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
