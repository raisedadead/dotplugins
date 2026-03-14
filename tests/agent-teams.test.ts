import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHook, createTmpDir, removeTmpDir } from "./helpers";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

// ─── TeammateIdle ────────────────────────────────────────────────────────────

describe("TeammateIdle (teammate-idle.sh)", () => {
  const HOOK = "teammate-idle.sh";

  test("exits 0 for non-dp-cto teams", async () => {
    const r = await runHook(HOOK, {
      hook_event_name: "TeammateIdle",
      team_name: "my-project",
      teammate_name: "worker-1",
    });
    expect(r.exitCode).toBe(0);
  });

  test("exits 2 with stderr for dp-cto teams", async () => {
    const r = await runHook(HOOK, {
      hook_event_name: "TeammateIdle",
      team_name: "feature-collab",
      teammate_name: "task-1-impl",
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/Completion Receipt/);
  });

  test("fails open when jq unavailable", async () => {
    const jqFreePath = await mkdtemp(join(tmpdir(), "no-jq-"));
    try {
      const bashPath = "/bin/bash";
      await symlink(bashPath, join(jqFreePath, "bash"));
      for (const bin of ["cat", "dirname", "basename", "tr", "grep", "tail", "mkdir"]) {
        try {
          const realPath = execFileSync("which", [bin], { encoding: "utf-8" }).trim();
          if (realPath) await symlink(realPath, join(jqFreePath, bin));
        } catch {
          /* skip */
        }
      }
      const r = await runHook(
        HOOK,
        {
          hook_event_name: "TeammateIdle",
          team_name: "feature-collab",
          teammate_name: "task-1-impl",
        },
        { PATH: jqFreePath },
      );
      expect(r.exitCode).toBe(0);
    } finally {
      await rm(jqFreePath, { recursive: true, force: true });
    }
  });
});

// ─── TaskCompleted ───────────────────────────────────────────────────────────

describe("TaskCompleted (task-completed.sh)", () => {
  const HOOK = "task-completed.sh";

  test("exits 0 for non-dp-cto teams", async () => {
    const r = await runHook(HOOK, {
      hook_event_name: "TaskCompleted",
      team_name: "other-team",
      task_subject: "Do something",
      teammate_name: "worker",
    });
    expect(r.exitCode).toBe(0);
  });

  test("exits 2 with stderr for dp-cto teams", async () => {
    const r = await runHook(HOOK, {
      hook_event_name: "TaskCompleted",
      team_name: "feature-collab",
      task_subject: "Implement auth",
      teammate_name: "task-2-impl",
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/Implement auth/);
  });

  test("fails open when jq unavailable", async () => {
    const jqFreePath = await mkdtemp(join(tmpdir(), "no-jq-"));
    try {
      const bashPath = "/bin/bash";
      await symlink(bashPath, join(jqFreePath, "bash"));
      for (const bin of ["cat", "dirname", "basename", "tr", "grep", "tail", "mkdir"]) {
        try {
          const realPath = execFileSync("which", [bin], { encoding: "utf-8" }).trim();
          if (realPath) await symlink(realPath, join(jqFreePath, bin));
        } catch {
          /* skip */
        }
      }
      const r = await runHook(
        HOOK,
        {
          hook_event_name: "TaskCompleted",
          team_name: "feature-collab",
          task_subject: "Implement auth",
          teammate_name: "task-2-impl",
        },
        { PATH: jqFreePath },
      );
      expect(r.exitCode).toBe(0);
    } finally {
      await rm(jqFreePath, { recursive: true, force: true });
    }
  });
});
