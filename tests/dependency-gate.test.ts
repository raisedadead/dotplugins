import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import {
  runHook,
  createTmpDir,
  removeTmpDir,
  seedBeadsDir,
  createMockBd,
  createNoBdPath,
} from "./helpers";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

const SESSION_HOOK = "session-start.sh";

function sessionInput(dir: string) {
  return {
    session_id: "test-session",
    cwd: dir,
  };
}

function getContext(r: Awaited<ReturnType<typeof runHook>>): string {
  return (
    ((r.json?.hookSpecificOutput as Record<string, unknown>)?.additionalContext as string) ?? ""
  );
}

// ─── Dependency Gate Behavior ───────────────────────────────────────────────

describe("Dependency gate (session-start.sh)", () => {
  test("no bd CLI, no .beads/: enforcement text present, no beads context prepended", async () => {
    const noBdDir = await createNoBdPath();
    try {
      const r = await runHook(SESSION_HOOK, sessionInput(tmpDir), {
        PATH: noBdDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = getContext(r);
      expect(ctx).toMatch(/dp-cto: Stage enforcement/);
      expect(ctx).toMatch(/bd CLI not found/);
    } finally {
      await rm(noBdDir, { recursive: true, force: true });
    }
  });

  test("bd available but no .beads/: enforcement text present, degraded message about beads db", async () => {
    const mockPath = await createMockBd(tmpDir);
    const r = await runHook(SESSION_HOOK, sessionInput(tmpDir), {
      PATH: mockPath,
    });
    expect(r.exitCode).toBe(0);
    const ctx = getContext(r);
    expect(ctx).toMatch(/dp-cto: Stage enforcement/);
    expect(ctx).toMatch(/No beads database found/);
  });

  test(".beads/ exists but no bd: degraded mode message about bd CLI", async () => {
    await seedBeadsDir(tmpDir);
    const noBdDir = await createNoBdPath();
    try {
      const r = await runHook(SESSION_HOOK, sessionInput(tmpDir), {
        PATH: noBdDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = getContext(r);
      expect(ctx).toMatch(/dp-cto: Stage enforcement/);
      expect(ctx).toMatch(/bd CLI not found/);
    } finally {
      await rm(noBdDir, { recursive: true, force: true });
    }
  });

  test("both bd and .beads/ present: normal operation with beads context", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBd(tmpDir);
    const r = await runHook(SESSION_HOOK, sessionInput(tmpDir), {
      PATH: mockPath,
    });
    expect(r.exitCode).toBe(0);
    const ctx = getContext(r);
    expect(ctx).toMatch(/dp-cto: Stage enforcement/);
    expect(ctx).not.toMatch(/bd CLI not found/);
    expect(ctx).not.toMatch(/No beads database found/);
    expect(ctx).not.toMatch(/DEGRADED MODE/i);
  });
});
