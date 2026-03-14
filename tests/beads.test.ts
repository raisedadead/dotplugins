import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTmpDir, removeTmpDir, runHook, runShell, createNoBdPath } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORK_RUN_SKILL = join(__dirname, "..", "plugins", "dp-cto", "skills", "work-run", "SKILL.md");

// ─── Beads Availability Detection ───────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("Beads availability detection (session-start.sh)", () => {
  test("no bd CLI and no .beads dir: context starts with enforcement (no beads prepended)", async () => {
    const r = await runHook("session-start.sh", {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    expect(ctx.trimStart().startsWith("<EXTREMELY_IMPORTANT>")).toBe(true);
  });

  test(".beads directory exists but no bd CLI: no beads context prepended", async () => {
    await mkdir(join(tmpDir, ".beads"), { recursive: true });
    const noBdDir = await createNoBdPath();
    try {
      const r = await runHook(
        "session-start.sh",
        {
          session_id: "test-session",
          cwd: tmpDir,
        },
        { PATH: noBdDir },
      );
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx.trimStart().startsWith("<EXTREMELY_IMPORTANT>")).toBe(true);
    } finally {
      await rm(noBdDir, { recursive: true, force: true });
    }
  });

  test("bd CLI available but no .beads directory: no beads context prepended", async () => {
    const binDir = join(tmpDir, ".mock-bin");
    await mkdir(binDir, { recursive: true });
    const fakeBd = join(binDir, "bd");
    await writeFile(fakeBd, '#!/usr/bin/env bash\necho "bd mock"', { mode: 0o755 });
    const r = await runHook(
      "session-start.sh",
      {
        session_id: "test-session",
        cwd: tmpDir,
      },
      { PATH: `${binDir}:${process.env.PATH}` },
    );
    expect(r.exitCode).toBe(0);
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx.trimStart().startsWith("<EXTREMELY_IMPORTANT>")).toBe(true);
  });
});

// ─── bd ready JSON Output Parsing ───────────────────────────────────────────

// These tests validate jq parsing patterns used by dp-cto hooks.
// They test jq expressions in isolation, not through the actual hooks.
describe("bd ready JSON output parsing", () => {
  const SAMPLE_BD_READY = {
    tasks: [
      {
        id: "abc123",
        title: "Task 1: Setup auth module [subagent]",
        status: "open",
        type: "task",
        parent: "epic-001",
        blockers: [],
      },
      {
        id: "def456",
        title: "Task 2: Implement login flow [iterative]",
        status: "open",
        type: "task",
        parent: "epic-001",
        blockers: [],
      },
      {
        id: "ghi789",
        title: "Task 3: Multi-service coordination [collaborative]",
        status: "open",
        type: "task",
        parent: "epic-001",
        blockers: [],
      },
    ],
  };

  test("extracts task IDs from bd ready output", async () => {
    const output = JSON.stringify(SAMPLE_BD_READY);
    // Shell interpolation is safe here: output is a hardcoded constant, not user input.
    const r = await runShell(`echo '${output}' | jq -r '.tasks[].id'`);
    expect(r.exitCode).toBe(0);
    const ids = r.stdout.split("\n");
    expect(ids).toEqual(["abc123", "def456", "ghi789"]);
  });

  test("extracts dispatch tags from task titles", async () => {
    const output = JSON.stringify(SAMPLE_BD_READY);
    const r = await runShell(
      `echo '${output}' | jq -r '.tasks[].title | capture("\\\\[(?<tag>[^\\\\]]+)\\\\]$") | .tag'`,
    );
    expect(r.exitCode).toBe(0);
    const tags = r.stdout.split("\n");
    expect(tags).toEqual(["subagent", "iterative", "collaborative"]);
  });

  test("filters tasks by dispatch tag", async () => {
    const output = JSON.stringify(SAMPLE_BD_READY);
    const r = await runShell(
      `echo '${output}' | jq '[.tasks[] | select(.title | test("\\\\[subagent\\\\]$"))]' | jq length`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("1");
  });

  test("handles empty task list", async () => {
    const emptyOutput = JSON.stringify({ tasks: [] });
    const r = await runShell(`echo '${emptyOutput}' | jq '.tasks | length'`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("0");
  });

  test("extracts task description (agent prompt) from bd show output", async () => {
    const bdShow = {
      id: "abc123",
      title: "Task 1: Setup auth module [subagent]",
      description:
        "You are a specialist agent. Implement the auth module in src/auth/.\n\nFiles in scope: src/auth/*.ts",
      status: "open",
    };
    const output = JSON.stringify(bdShow);
    const r = await runShell(`echo '${output}' | jq -r '.description'`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("specialist agent");
    expect(r.stdout).toContain("src/auth/");
  });

  test("detects subagent:isolated tag variant", async () => {
    const isolatedTask = {
      tasks: [
        {
          id: "iso001",
          title: "Task 4: Database migration [subagent:isolated]",
          status: "open",
        },
      ],
    };
    const output = JSON.stringify(isolatedTask);
    const r = await runShell(
      `echo '${output}' | jq -r '.tasks[].title | capture("\\\\[(?<tag>[^\\\\]]+)\\\\]$") | .tag'`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("subagent:isolated");
  });

  test("handles tasks with blockers field populated", async () => {
    const blockedOutput = {
      tasks: [
        {
          id: "blk001",
          title: "Task 5: Integration tests [subagent]",
          status: "open",
          blockers: ["abc123", "def456"],
        },
      ],
    };
    const output = JSON.stringify(blockedOutput);
    const r = await runShell(`echo '${output}' | jq '.tasks[0].blockers | length'`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("2");
  });
});

// ─── work-run SKILL.md Monitoring Contract ──────────────────────────────────

describe("work-run SKILL.md execute monitoring contract", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(WORK_RUN_SKILL, "utf-8");
  });

  describe("agent state tracking", () => {
    test("documents bd agent state spawning on dispatch", () => {
      expect(content).toMatch(/bd agent state \{task-id\} spawning/);
    });

    test("documents bd agent state running after dispatch", () => {
      expect(content).toMatch(/bd agent state \{task-id\} running/);
    });

    test("documents bd agent state done on success", () => {
      expect(content).toMatch(/bd agent state \{task-id\} done/);
    });

    test("documents bd agent state stuck on failure", () => {
      expect(content).toMatch(/bd agent state \{task-id\} stuck/);
    });

    test("dispatch and outcome tracking uses bd audit record", () => {
      expect(content).toMatch(/bd audit record --type dispatch/);
      expect(content).toMatch(/bd audit record --type outcome/);
    });

    test("documents bd slot set for hook registration on dispatch", () => {
      expect(content).toMatch(/bd slot set \{task-id\} hook \{task-id\}/);
    });

    test("documents bd slot clear for hook cleanup on completion", () => {
      expect(content).toMatch(/bd slot clear \{task-id\} hook/);
    });

    test("documents bd lint pre-dispatch validation", () => {
      expect(content).toMatch(/bd lint --parent \{epic-id\}/);
    });
  });

  describe("round checkpoints", () => {
    test("documents round checkpoint step (Step 2.5)", () => {
      expect(content).toMatch(/## Step 2\.5: Round Checkpoint/);
    });

    test("documents progress summary format", () => {
      expect(content).toMatch(
        /\{done\}\/\{total\} tasks done, \{running\} running, \{ready\} ready\. \{stuck\} stuck\./,
      );
    });

    test("documents bd list --parent query for progress", () => {
      expect(content).toMatch(/bd list --parent \{epic-id\} --json/);
    });
  });

  describe("circuit breaker", () => {
    test("documents >50% failure threshold", () => {
      expect(content).toMatch(/50%/);
    });

    test("documents AskUserQuestion for circuit breaker", () => {
      expect(content).toMatch(/AskUserQuestion/);
    });

    test("documents three circuit breaker options", () => {
      expect(content).toMatch(/Continue to next round/i);
      expect(content).toMatch(/Re-dispatch failed tasks/i);
      expect(content).toMatch(/Stop execution/i);
    });
  });
});
