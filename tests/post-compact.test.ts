import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runHook,
  seedBeadsDir,
  createMockBdForStage,
  createTmpDir,
  removeTmpDir,
  createNoBdPath,
} from "./helpers";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("PostCompact (post-compact.sh)", () => {
  const HOOK = "post-compact.sh";

  test("outputs enforcement text when bd finds active epic", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBdForStage(tmpDir, "executing");
    const r = await runHook(
      HOOK,
      {
        hook_event_name: "PostCompact",
        session_id: "test",
        cwd: tmpDir,
        trigger: "auto",
      },
      { PATH: mockPath },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    expect(ctx).toMatch(/RECOVERY:/);
  });

  test("outputs enforcement text only (no recovery) when no active epic", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBdForStage(tmpDir, "idle");
    const r = await runHook(
      HOOK,
      {
        hook_event_name: "PostCompact",
        session_id: "test",
        cwd: tmpDir,
        trigger: "auto",
      },
      { PATH: mockPath },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    expect(ctx).not.toMatch(/RECOVERY:/);
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
          hook_event_name: "PostCompact",
          session_id: "test",
          cwd: tmpDir,
          trigger: "auto",
        },
        { PATH: jqFreePath },
      );
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toBe("");
    } finally {
      await rm(jqFreePath, { recursive: true, force: true });
    }
  });

  test("fails open when bd unavailable", async () => {
    await seedBeadsDir(tmpDir);
    const noBdDir = await createNoBdPath();
    try {
      const r = await runHook(
        HOOK,
        {
          hook_event_name: "PostCompact",
          session_id: "test",
          cwd: tmpDir,
          trigger: "auto",
        },
        { PATH: noBdDir },
      );
      expect(r.exitCode).toBe(0);
      expect(r.json).not.toBeNull();
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
      expect(ctx).not.toMatch(/RECOVERY:/);
    } finally {
      await rm(noBdDir, { recursive: true, force: true });
    }
  });

  test("handles PostCompact input with trigger field", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBdForStage(tmpDir, "idle");
    const r = await runHook(
      HOOK,
      {
        hook_event_name: "PostCompact",
        session_id: "test",
        cwd: tmpDir,
        trigger: "manual",
      },
      { PATH: mockPath },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
  });
});
