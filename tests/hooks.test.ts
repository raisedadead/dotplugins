import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runHook,
  seedBeadsDir,
  createMockBd,
  createMockBdForStage,
  createMockBdWithLog,
  createMockBdWithResponses,
  listStageDir,
  createTmpDir,
  removeTmpDir,
} from "./helpers";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

const HOOK = "intercept-orchestration.sh";

// ─── Helpers for common assertions ───────────────────────────────────────────

function expectAllowed(r: Awaited<ReturnType<typeof runHook>>) {
  expect(r.exitCode).toBe(0);
  const hso = r.json?.hookSpecificOutput as Record<string, unknown> | undefined;
  if (hso) {
    expect(hso.permissionDecision).not.toBe("deny");
  }
}

function expectDenied(r: Awaited<ReturnType<typeof runHook>>, reasonMatch?: RegExp) {
  expect(r.exitCode).toBe(0);
  const hso = r.json?.hookSpecificOutput as Record<string, unknown> | undefined;
  expect(hso?.permissionDecision).toBe("deny");
  if (reasonMatch) {
    expect(hso?.permissionDecisionReason).toMatch(reasonMatch);
  }
}

async function runWithStage(
  hook: string,
  skill: string,
  stage: string,
  epicId = "epic-1",
): Promise<Awaited<ReturnType<typeof runHook>>> {
  await seedBeadsDir(tmpDir);
  const mockPath = await createMockBdForStage(tmpDir, stage, epicId);
  return runHook(
    hook,
    {
      tool_name: "Skill",
      tool_input: { skill },
      session_id: "test-session",
      cwd: tmpDir,
    },
    { PATH: mockPath },
  );
}

// ─── Stage Enforcement ──────────────────────────────────────────────────────

describe("Stage Enforcement (intercept-orchestration.sh)", () => {
  describe("idle stage (bd returns no active epics)", () => {
    test("work-plan is allowed", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-plan", "idle"));
    });

    test("work-run is denied", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-run", "idle"), /work-plan/i);
    });

    test("work-run-loop is denied", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-run-loop", "idle"), /work-plan/i);
    });

    test("work-polish is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-polish", "idle"),
        /Run \/dp-cto:work-plan first/,
      );
    });

    test("quality-fact-check is allowed (quality skill)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:quality-fact-check", "idle"));
    });
  });

  describe("planning stage", () => {
    test("work-plan is denied (in progress)", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-plan", "planning"),
        /Wait for \/dp-cto:work-plan to complete/,
      );
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run", "planning"),
        /Wait for \/dp-cto:work-plan to complete/,
      );
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run-loop", "planning"),
        /Wait for \/dp-cto:work-plan to complete/,
      );
    });

    test("work-stop-loop is allowed (safety valve)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-stop-loop", "planning"));
    });
  });

  describe("planned stage", () => {
    test("work-run is allowed", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-run", "planned"));
    });

    test("work-plan is allowed (re-plan)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-plan", "planned"));
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run-loop", "planned"),
        /Run \/dp-cto:work-run first/,
      );
    });

    test("work-polish is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-polish", "planned"),
        /Run \/dp-cto:work-run first/,
      );
    });

    test("quality-fact-check is allowed (quality skill)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:quality-fact-check", "planned"));
    });
  });

  describe("executing stage", () => {
    test("work-run-loop is allowed", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-run-loop", "executing"));
    });

    test("quality-fact-check is allowed", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:quality-fact-check", "executing"));
    });

    test("work-polish is allowed", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-polish", "executing"));
    });

    test("work-plan is allowed (re-plan)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-plan", "executing"));
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run", "executing"),
        /Implementation in progress/,
      );
    });
  });

  describe("polishing stage", () => {
    test("quality-fact-check is allowed", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:quality-fact-check", "polishing"));
    });

    test("work-plan is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-plan", "polishing"),
        /Polish in progress.*Wait for \/dp-cto:work-polish to complete/,
      );
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run", "polishing"),
        /Polish in progress.*Wait for \/dp-cto:work-polish to complete/,
      );
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run-loop", "polishing"),
        /Polish in progress.*Wait for \/dp-cto:work-polish to complete/,
      );
    });

    test("work-stop-loop is allowed (safety valve)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-stop-loop", "polishing"));
    });

    test("work-polish is allowed (re-invocation)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-polish", "polishing"));
    });
  });

  describe("complete stage", () => {
    test("work-plan is allowed (new cycle)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-plan", "complete"));
    });

    test("work-polish is allowed (standalone re-polish)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-polish", "complete"));
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run", "complete"),
        /Run \/dp-cto:work-plan to begin a new feature/,
      );
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runWithStage(HOOK, "dp-cto:work-run-loop", "complete"),
        /Run \/dp-cto:work-plan to begin a new feature/,
      );
    });

    test("quality-fact-check is allowed (quality skill)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:quality-fact-check", "complete"));
    });
  });

  describe("work-stop-loop safety valve", () => {
    test.each(["idle", "planning", "planned", "executing", "polishing", "complete"])(
      "allowed from %s",
      async (stage) => {
        expectAllowed(await runWithStage(HOOK, "dp-cto:work-stop-loop", stage));
      },
    );
  });

  describe("pre-execution bd set-state calls", () => {
    test("work-plan from idle is allowed (no epic to set-state on)", async () => {
      await seedBeadsDir(tmpDir);
      const mockPath = await createMockBdForStage(tmpDir, "idle");
      const r = await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-plan" },
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expectAllowed(r);
    });

    test("work-run calls bd set-state with executing", async () => {
      await seedBeadsDir(tmpDir);
      const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "planned", "epic-42");
      const r = await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-run" },
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expectAllowed(r);
      const log = await readFile(logFile, "utf-8");
      expect(log).toMatch(/set-state -q epic-42 dp-cto=executing/);
    });

    test("work-polish calls bd set-state with polishing", async () => {
      await seedBeadsDir(tmpDir);
      const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "executing", "epic-77");
      const r = await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-polish" },
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expectAllowed(r);
      const log = await readFile(logFile, "utf-8");
      expect(log).toMatch(/set-state -q epic-77 dp-cto=polishing/);
    });

    test("work-plan from complete calls bd set-state with planning", async () => {
      await seedBeadsDir(tmpDir);
      const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "complete", "epic-99");
      const r = await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-plan" },
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expectAllowed(r);
      const log = await readFile(logFile, "utf-8");
      expect(log).toMatch(/set-state -q epic-99 dp-cto=planning/);
    });
  });

  describe("dp-cto quality skills pass through", () => {
    test.each([
      "dp-cto:quality-red-green-refactor",
      "dp-cto:quality-deep-debug",
      "dp-cto:quality-check-done",
      "dp-cto:quality-code-review",
      "dp-cto:quality-sweep-code",
      "dp-cto:quality-fact-check",
      "dp-cto:ops-clean-slate",
      "dp-cto:ops-show-board",
      "dp-cto:ops-track-sprint",
    ])("%s is allowed from idle", async (skill) => {
      const r = await runHook(HOOK, {
        tool_name: "Skill",
        tool_input: { skill },
        session_id: "test-session",
        cwd: tmpDir,
      });
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test.each(["planning", "planned", "executing", "polishing", "complete"])(
      "quality skills pass from %s stage",
      async (stage) => {
        await seedBeadsDir(tmpDir);
        const mockPath = await createMockBdForStage(tmpDir, stage);
        for (const skill of [
          "dp-cto:quality-red-green-refactor",
          "dp-cto:quality-deep-debug",
          "dp-cto:quality-check-done",
          "dp-cto:quality-code-review",
          "dp-cto:quality-sweep-code",
          "dp-cto:quality-fact-check",
          "dp-cto:ops-clean-slate",
          "dp-cto:ops-show-board",
          "dp-cto:ops-track-sprint",
        ]) {
          expectAllowed(
            await runHook(
              HOOK,
              {
                tool_name: "Skill",
                tool_input: { skill },
                session_id: "test-session",
                cwd: tmpDir,
              },
              { PATH: mockPath },
            ),
          );
        }
      },
    );
  });

  describe("work-park stage enforcement", () => {
    test("work-park allowed from executing", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-park", "executing"));
    });

    test("work-park allowed from polishing", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-park", "polishing"));
    });

    test("work-park denied from idle", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-park", "idle"), /work-plan/i);
    });

    test("work-park denied from planned", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-park", "planned"), /work-run/i);
    });

    test("work-park denied from complete", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-park", "complete"), /work-plan/i);
    });
  });

  describe("work-unpark stage enforcement", () => {
    test("work-unpark allowed from idle", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-unpark", "idle"));
    });

    test("work-unpark denied from executing", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-unpark", "executing"), /in progress/i);
    });

    test("work-unpark denied from planned", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-unpark", "planned"), /work-run/i);
    });
  });

  describe("suspended stage", () => {
    test("work-plan is allowed (falls through to unknown stage behavior)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-plan", "suspended"));
    });

    test("work-unpark is allowed (restore from suspended)", async () => {
      expectAllowed(await runWithStage(HOOK, "dp-cto:work-unpark", "suspended"));
    });

    test("work-run is denied", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-run", "suspended"), /work-plan/i);
    });

    test("work-park is denied", async () => {
      expectDenied(await runWithStage(HOOK, "dp-cto:work-park", "suspended"), /work-plan/i);
    });
  });
});

// ─── Skill Interception (non-dp-cto) ─────────────────────────────────────

describe("Skill Interception (intercept-orchestration.sh)", () => {
  test("non-Skill tool passes silently", async () => {
    const r = await runHook(HOOK, { tool_name: "Bash" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });

  describe("Tier 1: warn for orchestration-adjacent unknown skills", () => {
    test.each([
      "some-plugin:parallel-dispatch",
      "orchestration-layer",
      "my-worktree-tool",
      "custom:subagent-runner",
      "dispatch-tasks",
    ])("%s emits warning", async (skill) => {
      const r = await runHook(HOOK, {
        tool_name: "Skill",
        tool_input: { skill },
        session_id: "test-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      expect(r.json).not.toBeNull();
      expect((r.json as Record<string, unknown>)?.systemMessage).toMatch(/WARNING/);
    });
  });

  test("Tier 2: regular non-dp-cto skill passes silently", async () => {
    const r = await runHook(HOOK, {
      tool_name: "Skill",
      tool_input: { skill: "some-other-skill" },
      session_id: "test-session",
      cwd: tmpDir,
    });
    expectAllowed(r);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });
});

// ─── Stage Transitions ──────────────────────────────────────────────────────

describe("Stage Transitions (stage-transition.sh)", () => {
  const hook = "stage-transition.sh";

  test("work-plan calls bd set-state with planned", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "planning", "epic-1");
    await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-plan" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    const log = await readFile(logFile, "utf-8");
    expect(log).toMatch(/set-state -q epic-1 dp-cto=planned/);
  });

  test("work-run calls bd set-state with polishing", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "executing", "epic-2");
    await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-run" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    const log = await readFile(logFile, "utf-8");
    expect(log).toMatch(/set-state -q epic-2 dp-cto=polishing/);
  });

  test("work-polish calls bd set-state with complete", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "polishing", "epic-3");
    await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-polish" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    const log = await readFile(logFile, "utf-8");
    expect(log).toMatch(/set-state -q epic-3 dp-cto=complete/);
  });

  test("work-park calls bd set-state with suspended", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "executing", "epic-4");
    await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-park" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    const log = await readFile(logFile, "utf-8");
    expect(log).toMatch(/set-state -q epic-4 dp-cto=suspended/);
  });

  test("work-unpark does not call bd set-state (skill handles it)", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "idle");
    const r = await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-unpark" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    expect(r.exitCode).toBe(0);
    let log = "";
    try {
      log = await readFile(logFile, "utf-8");
    } catch {
      // log file may not exist if bd was never called
    }
    expect(log).not.toMatch(/set-state/);
  });

  test("work-run-loop does not call bd set-state", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "executing", "epic-5");
    await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-run-loop" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    const log = await readFile(logFile, "utf-8");
    expect(log).not.toMatch(/set-state/);
  });

  test("quality skill does not call bd set-state", async () => {
    await seedBeadsDir(tmpDir);
    const { path: mockPath, logFile } = await createMockBdWithLog(tmpDir, "executing", "epic-6");
    await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:quality-fact-check" },
        session_id: "s1",
        cwd: tmpDir,
      },
      { PATH: mockPath },
    );
    const log = await readFile(logFile, "utf-8");
    expect(log).not.toMatch(/set-state/);
  });

  test("non-dp-cto skill has no side effects", async () => {
    const r = await runHook(hook, {
      tool_name: "Skill",
      tool_input: { skill: "some-other-plugin:tdd" },
      session_id: "s1",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
  });

  test("non-Skill tool exits silently", async () => {
    const r = await runHook(hook, {
      tool_name: "Bash",
      tool_input: { command: "ls" },
      session_id: "s1",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("missing session_id exits silently", { timeout: 15000 }, async () => {
    const r = await runHook(hook, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:work-plan" },
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  test("no bd on PATH defaults to idle — work-plan allowed", async () => {
    expectAllowed(
      await runHook(HOOK, {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-plan" },
        session_id: "test-session",
        cwd: tmpDir,
      }),
    );
  });

  test("no bd on PATH defaults to idle — work-run denied", async () => {
    expectDenied(
      await runHook(HOOK, {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-run" },
        session_id: "test-session",
        cwd: tmpDir,
      }),
    );
  });

  test("bd returns empty results defaults to idle — work-plan allowed", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBdForStage(tmpDir, "idle");
    expectAllowed(
      await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-plan" },
          session_id: "test-session",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      ),
    );
  });

  test("missing session_id does not crash and creates no side-effect files", async () => {
    const r = await runHook(HOOK, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:work-plan" },
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const files = await listStageDir(tmpDir);
    expect(files).toEqual([]);
  });

  test("unknown stage value treated as idle — work-plan allowed", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBdForStage(tmpDir, "bogus");
    expectAllowed(
      await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-plan" },
          session_id: "test-session",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      ),
    );
  });

  test("unknown stage value treated as idle — work-run denied", async () => {
    await seedBeadsDir(tmpDir);
    const mockPath = await createMockBdForStage(tmpDir, "bogus");
    expectDenied(
      await runHook(
        HOOK,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-run" },
          session_id: "test-session",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      ),
      /work-plan/i,
    );
  });
});

// ─── SessionStart ────────────────────────────────────────────────────────────

describe("SessionStart (session-start.sh)", () => {
  const SESSION_HOOK = "session-start.sh";

  test("enforcement message includes dp-cto prefix", async () => {
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-cto:/);
  });

  test("degraded mode message when .beads/ missing", async () => {
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/beads/i);
  });

  describe("session recovery detection (beads-backed)", () => {
    test("clean start (no active epics): no recovery context", async () => {
      await seedBeadsDir(tmpDir);
      const mockPath = await createMockBd(tmpDir);
      const r = await runHook(
        SESSION_HOOK,
        {
          session_id: "new-session",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).not.toMatch(/RECOVERY/);
      expect(ctx).toMatch(/dp-cto: Stage enforcement/);
    });

    test("active epic in executing stage: recovery context injected", async () => {
      await seedBeadsDir(tmpDir);
      const queryResponse = JSON.stringify([{ id: "epic-100", labels: ["dp-cto:executing"] }]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: queryResponse,
      });
      const r = await runHook(
        SESSION_HOOK,
        { session_id: "new-session", cwd: tmpDir },
        { PATH: mp },
      );
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/epic-100/);
      expect(ctx).toMatch(/executing/);
      expect(ctx).toMatch(/dp-cto: Stage enforcement/);
    });

    test("active epic in planning stage: recovery context injected", async () => {
      await seedBeadsDir(tmpDir);
      const queryResponse = JSON.stringify([{ id: "epic-200", labels: ["dp-cto:planning"] }]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: queryResponse,
      });
      const r = await runHook(
        SESSION_HOOK,
        { session_id: "new-session", cwd: tmpDir },
        { PATH: mp },
      );
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/epic-200/);
      expect(ctx).toMatch(/planning/);
    });

    test("active epic in polishing stage: recovery context injected", async () => {
      await seedBeadsDir(tmpDir);
      const queryResponse = JSON.stringify([{ id: "epic-300", labels: ["dp-cto:polishing"] }]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: queryResponse,
      });
      const r = await runHook(
        SESSION_HOOK,
        { session_id: "new-session", cwd: tmpDir },
        { PATH: mp },
      );
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/epic-300/);
      expect(ctx).toMatch(/polishing/);
    });
  });

  describe("orphan in-progress task detection", () => {
    function epicQueryResponse(epicId: string, stage: string): string {
      return JSON.stringify([{ id: epicId, labels: [`dp-cto:${stage}`] }]);
    }

    test("orphan scan injects context when executing stage has in-progress tasks", async () => {
      await seedBeadsDir(tmpDir);
      const tasks = JSON.stringify([
        { id: "task-1", title: "Implement auth module" },
        { id: "task-2", title: "Write unit tests" },
      ]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: epicQueryResponse("epic-100", "executing"),
        list: tasks,
      });
      try {
        const r = await runHook(SESSION_HOOK, { session_id: "s1", cwd: tmpDir }, { PATH: mp });
        expect(r.exitCode).toBe(0);
        const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
          ?.additionalContext as string;
        expect(ctx).toMatch(/RECOVERY.*orphaned in-progress/i);
        expect(ctx).toMatch(/epic-100/);
        expect(ctx).toMatch(/task-1/);
        expect(ctx).toMatch(/Implement auth module/);
        expect(ctx).toMatch(/task-2/);
        expect(ctx).toMatch(/Write unit tests/);
        expect(ctx).toMatch(/2 orphaned/);
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
    });

    test("orphan scan injects context when polishing stage has in-progress tasks", async () => {
      await seedBeadsDir(tmpDir);
      const tasks = JSON.stringify([{ id: "task-10", title: "Polish UI components" }]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: epicQueryResponse("epic-200", "polishing"),
        list: tasks,
      });
      try {
        const r = await runHook(SESSION_HOOK, { session_id: "s1", cwd: tmpDir }, { PATH: mp });
        expect(r.exitCode).toBe(0);
        const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
          ?.additionalContext as string;
        expect(ctx).toMatch(/RECOVERY.*orphaned in-progress/i);
        expect(ctx).toMatch(/epic-200/);
        expect(ctx).toMatch(/task-10/);
        expect(ctx).toMatch(/Polish UI components/);
        expect(ctx).toMatch(/1 orphaned/);
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
    });

    test("orphan scan does not inject when stage is planned (not executing/polishing)", async () => {
      await seedBeadsDir(tmpDir);
      const tasks = JSON.stringify([{ id: "task-20", title: "Should not appear" }]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: epicQueryResponse("epic-300", "planned"),
        queryExecutingPolishing: "[]",
        list: tasks,
      });
      try {
        const r = await runHook(SESSION_HOOK, { session_id: "s1", cwd: tmpDir }, { PATH: mp });
        expect(r.exitCode).toBe(0);
        const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
          ?.additionalContext as string;
        expect(ctx).not.toMatch(/orphaned in-progress/i);
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
    });

    test("orphan scan does not inject when bd returns empty list", async () => {
      await seedBeadsDir(tmpDir);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: epicQueryResponse("epic-400", "executing"),
        list: "[]",
      });
      try {
        const r = await runHook(SESSION_HOOK, { session_id: "s1", cwd: tmpDir }, { PATH: mp });
        expect(r.exitCode).toBe(0);
        const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
          ?.additionalContext as string;
        expect(ctx).not.toMatch(/orphaned in-progress/i);
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
    });

    test("orphan scan truncates at 5 tasks with overflow count", async () => {
      await seedBeadsDir(tmpDir);
      const tasks = JSON.stringify([
        { id: "t1", title: "Task one" },
        { id: "t2", title: "Task two" },
        { id: "t3", title: "Task three" },
        { id: "t4", title: "Task four" },
        { id: "t5", title: "Task five" },
        { id: "t6", title: "Task six" },
        { id: "t7", title: "Task seven" },
      ]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: epicQueryResponse("epic-500", "executing"),
        list: tasks,
      });
      try {
        const r = await runHook(SESSION_HOOK, { session_id: "s1", cwd: tmpDir }, { PATH: mp });
        expect(r.exitCode).toBe(0);
        const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
          ?.additionalContext as string;
        expect(ctx).toMatch(/orphaned in-progress/i);
        expect(ctx).toMatch(/t1/);
        expect(ctx).toMatch(/t5/);
        expect(ctx).not.toMatch(/t6/);
        expect(ctx).not.toMatch(/t7/);
        expect(ctx).toMatch(/and 2 more/);
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
    });

    test("orphan scan includes actionable guidance", async () => {
      await seedBeadsDir(tmpDir);
      const tasks = JSON.stringify([{ id: "task-99", title: "Stalled task" }]);
      const mp = await createMockBdWithResponses(tmpDir, {
        query: epicQueryResponse("epic-600", "executing"),
        list: tasks,
      });
      try {
        const r = await runHook(SESSION_HOOK, { session_id: "s1", cwd: tmpDir }, { PATH: mp });
        expect(r.exitCode).toBe(0);
        const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
          ?.additionalContext as string;
        expect(ctx).toMatch(/ops-show-board/);
        expect(ctx).toMatch(/work-run/);
        expect(ctx).toMatch(/bd close/);
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
    });
  });
});

// ─── Research Validator ──────────────────────────────────────────────────────

describe("Research Validator (research-validator.sh)", () => {
  test.each(["WebSearch", "WebFetch", "mcp__some_tool"])(
    "fires for %s and produces RESEARCH VALIDATION context",
    async (toolName) => {
      const r = await runHook("research-validator.sh", {
        tool_name: toolName,
        tool_input: { query: "test" },
      });
      expect(r.exitCode).toBe(0);
      expect(r.json).not.toBeNull();
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RESEARCH VALIDATION/);
    },
  );
});

// ─── PreToolUse intercept-bd-init.sh ─────────────────────────────────────────

describe("PreToolUse intercept-bd-init.sh", () => {
  const BD_HOOK = "intercept-bd-init.sh";

  test("non-Bash tool passes silently", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Read",
      tool_input: { file_path: "/tmp/foo.txt" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });

  test("Bash tool with unrelated command passes silently", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "ls -la" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });

  test("bd init without --stealth is denied", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "bd init" },
    });
    expectDenied(r, /--stealth.*--skip-hooks|requires both/);
  });

  test("bd init --skip-hooks alone is denied (needs --stealth too)", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "bd init --skip-hooks" },
    });
    expectDenied(r, /--stealth/);
  });

  test("bd init --stealth alone is denied (needs --skip-hooks too)", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "bd init --stealth" },
    });
    expectDenied(r, /--skip-hooks/);
  });

  test("bd init --stealth --skip-hooks is allowed", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "bd init --stealth --skip-hooks" },
    });
    expectAllowed(r);
  });

  test("bd init --skip-hooks --stealth (reversed order) is allowed", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "bd init --skip-hooks --stealth" },
    });
    expectAllowed(r);
  });

  test("bd init --stealth --skip-hooks --quiet is allowed", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "bd init --stealth --skip-hooks --quiet" },
    });
    expectAllowed(r);
  });

  test("empty command passes silently", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });

  test("bd init embedded in a pipeline is denied", async () => {
    const r = await runHook(BD_HOOK, {
      tool_name: "Bash",
      tool_input: { command: "echo foo && bd init" },
    });
    expectDenied(r, /--stealth.*--skip-hooks|requires both/);
  });
});

// ─── jq-missing fail-open ──────────────────────────────────────────────────

describe("jq-missing fail-open", () => {
  let jqFreePath: string;

  beforeEach(async () => {
    jqFreePath = await mkdtemp(join(tmpdir(), "no-jq-"));
    const bashPath = "/bin/bash";
    await symlink(bashPath, join(jqFreePath, "bash"));
    for (const bin of ["cat", "dirname", "basename", "tr", "grep", "tail", "mkdir"]) {
      try {
        const realPath = execFileSync("which", [bin], {
          encoding: "utf-8",
        }).trim();
        if (realPath) await symlink(realPath, join(jqFreePath, bin));
      } catch {
        /* skip if not found */
      }
    }
  });

  afterEach(async () => {
    await rm(jqFreePath, { recursive: true, force: true });
  });

  test.each([
    "intercept-orchestration.sh",
    "intercept-bd-init.sh",
    "stage-transition.sh",
    "research-validator.sh",
  ])("%s exits 0 when jq is missing", async (hook) => {
    const r = await runHook(
      hook,
      {
        tool_name: "Skill",
        tool_input: { skill: "dp-cto:work-plan" },
        session_id: "test-session",
        cwd: tmpDir,
      },
      { PATH: jqFreePath },
    );
    expect(r.exitCode).toBe(0);
  });

  test("session-start.sh outputs degraded message when jq missing", async () => {
    const r = await runHook(
      "session-start.sh",
      {
        session_id: "test-session",
        cwd: tmpDir,
      },
      { PATH: jqFreePath },
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const hso = r.json?.hookSpecificOutput as Record<string, unknown> | undefined;
    expect(hso).toBeDefined();
  });
});
