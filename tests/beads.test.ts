import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTmpDir, removeTmpDir, runHook } from "./helpers";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

function runShell(
  script: string,
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.stdin.end();
    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });
  });
}

// ─── Beads Availability Detection ───────────────────────────────────────────

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
    const r = await runHook("session-start.sh", {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx.trimStart().startsWith("<EXTREMELY_IMPORTANT>")).toBe(true);
  });

  test("bd CLI available but no .beads directory: no beads context prepended", async () => {
    const fakeBd = join(tmpDir, "fake-bd");
    await writeFile(fakeBd, '#!/usr/bin/env bash\necho "bd mock"', { mode: 0o755 });
    const r = await runHook("session-start.sh", {
      session_id: "test-session",
      cwd: tmpDir,
    });
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
