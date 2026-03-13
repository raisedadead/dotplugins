import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile, mkdtemp, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runHook,
  seedStage,
  seedCache,
  seedCorruptCache,
  seedBeadsDir,
  createMockBd,
  getStage,
  getCacheStage,
  listStageDir,
  seedBreadcrumb,
  createTmpDir,
  removeTmpDir,
  HOOK_DIR,
} from "./helpers";
import type { HookResult } from "./helpers";

// WARNING: Tests that exercise stage-writing paths MUST pass `cwd: tmpDir` and
// a `session_id` to runHook. Without cwd the hook cannot locate the stage
// directory and state assertions will fail silently.
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

function skillInput(skill: string, sessionId = "test-session") {
  return {
    tool_name: "Skill",
    tool_input: { skill },
    session_id: sessionId,
    cwd: tmpDir,
  };
}

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

// ─── Stage Enforcement ──────────────────────────────────────────────────────

describe("Stage Enforcement (intercept-orchestration.sh)", () => {
  describe("idle stage", () => {
    // No cache file = idle (fail-open default)

    test("work-plan is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
    });

    test("work-run is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-run")), /work-plan/i);
    });

    test("work-run-loop is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-run-loop")), /work-plan/i);
    });

    test("work-polish is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-polish")),
        /Run \/dp-cto:work-plan first/,
      );
    });

    test("quality-fact-check is allowed (quality skill)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:quality-fact-check")));
    });
  });

  describe("planning stage", () => {
    beforeEach(() => seedCache(tmpDir, "planning"));

    test("work-plan is denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-plan")),
        /Wait for \/dp-cto:work-plan to complete/,
      );
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run")),
        /Wait for \/dp-cto:work-plan to complete/,
      );
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run-loop")),
        /Wait for \/dp-cto:work-plan to complete/,
      );
    });

    test("work-stop-loop is allowed (safety valve)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-stop-loop")));
    });
  });

  describe("planned stage", () => {
    beforeEach(() => seedCache(tmpDir, "planned"));

    test("work-run is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-run")));
    });

    test("work-plan is allowed (re-plan)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run-loop")),
        /Run \/dp-cto:work-run first/,
      );
    });

    test("work-polish is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-polish")),
        /Run \/dp-cto:work-run first/,
      );
    });

    test("quality-fact-check is allowed (quality skill)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:quality-fact-check")));
    });
  });

  describe("executing stage", () => {
    beforeEach(() => seedCache(tmpDir, "executing"));

    test("work-run-loop is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-run-loop")));
    });

    test("quality-fact-check is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:quality-fact-check")));
    });

    test("work-polish is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-polish")));
    });

    test("work-plan is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-plan")),
        /Implementation in progress/,
      );
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run")),
        /Implementation in progress/,
      );
    });
  });

  describe("polishing stage", () => {
    beforeEach(() => seedCache(tmpDir, "polishing"));

    test("quality-fact-check is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:quality-fact-check")));
    });

    test("work-plan is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-plan")),
        /Polish in progress.*Wait for \/dp-cto:work-polish to complete/,
      );
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run")),
        /Polish in progress.*Wait for \/dp-cto:work-polish to complete/,
      );
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run-loop")),
        /Polish in progress.*Wait for \/dp-cto:work-polish to complete/,
      );
    });

    test("work-stop-loop is allowed (safety valve)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-stop-loop")));
    });

    test("work-polish is allowed (re-invocation)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-polish")));
    });
  });

  describe("complete stage", () => {
    beforeEach(() => seedCache(tmpDir, "complete"));

    test("work-plan is allowed (new cycle)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
    });

    test("work-polish is allowed (standalone re-polish)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-polish")));
    });

    test("work-run is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run")),
        /Run \/dp-cto:work-plan to begin a new feature/,
      );
    });

    test("work-run-loop is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:work-run-loop")),
        /Run \/dp-cto:work-plan to begin a new feature/,
      );
    });

    test("quality-fact-check is allowed (quality skill)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:quality-fact-check")));
    });
  });

  describe("work-stop-loop safety valve", () => {
    test.each(["idle", "planning", "planned", "executing", "polishing", "complete"])(
      "allowed from %s",
      async (stage) => {
        if (stage !== "idle") await seedCache(tmpDir, stage);
        expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-stop-loop")));
      },
    );
  });

  describe("pre-execution cache writes", () => {
    test("work-plan writes planning stage to cache", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
      expect(await getCacheStage(tmpDir)).toBe("planning");
    });

    test("work-run writes executing stage to cache", async () => {
      await seedCache(tmpDir, "planned");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-run")));
      expect(await getCacheStage(tmpDir)).toBe("executing");
    });

    test("work-polish writes polishing stage to cache", async () => {
      await seedCache(tmpDir, "executing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-polish")));
      expect(await getCacheStage(tmpDir)).toBe("polishing");
    });

    test("work-park does not write pre-execution cache transition", async () => {
      await seedCache(tmpDir, "executing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-park")));
      expect(await getCacheStage(tmpDir)).toBe("executing");
    });

    test("work-run from planned with active epic calls write_state", async () => {
      await seedCache(tmpDir, "planned", "epic-42");
      const mockPath = await createMockBd(tmpDir);
      try {
        const r = await runHook(
          "intercept-orchestration.sh",
          {
            tool_name: "Skill",
            tool_input: { skill: "dp-cto:work-run" },
            session_id: "s1",
            cwd: tmpDir,
          },
          { PATH: mockPath },
        );
        expect(r.exitCode).toBe(0);
        const stage = await getCacheStage(tmpDir);
        expect(stage).toBe("executing");
      } finally {
        await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
      }
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
      const r = await runHook(HOOK, skillInput(skill));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test.each(["planning", "planned", "executing", "polishing", "complete"])(
      "quality skills pass from %s stage",
      async (stage) => {
        await seedCache(tmpDir, stage);
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
          expectAllowed(await runHook(HOOK, skillInput(skill)));
        }
      },
    );

    test("quality skills do not write cache transitions", async () => {
      await seedCache(tmpDir, "executing");
      await runHook(HOOK, skillInput("dp-cto:quality-red-green-refactor"));
      expect(await getCacheStage(tmpDir)).toBe("executing");
    });
  });

  describe("ops-show-board and ops-track-sprint quality skill bypass", () => {
    test("ops-show-board passes from idle (no stage enforcement)", async () => {
      const r = await runHook(HOOK, skillInput("dp-cto:ops-show-board"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test("ops-show-board passes from executing (quality skill bypass)", async () => {
      await seedCache(tmpDir, "executing");
      const r = await runHook(HOOK, skillInput("dp-cto:ops-show-board"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test("ops-track-sprint passes from idle", async () => {
      const r = await runHook(HOOK, skillInput("dp-cto:ops-track-sprint"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test("ops-track-sprint passes from executing", async () => {
      await seedCache(tmpDir, "executing");
      const r = await runHook(HOOK, skillInput("dp-cto:ops-track-sprint"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });
  });

  describe("work-park stage enforcement", () => {
    test("work-park allowed from executing", async () => {
      await seedCache(tmpDir, "executing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-park")));
    });

    test("work-park allowed from polishing", async () => {
      await seedCache(tmpDir, "polishing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-park")));
    });

    test("work-park denied from idle", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-park")), /work-plan/i);
    });

    test("work-park denied from planned", async () => {
      await seedCache(tmpDir, "planned");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-park")), /work-run/i);
    });

    test("work-park denied from complete", async () => {
      await seedCache(tmpDir, "complete");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-park")), /work-plan/i);
    });
  });

  describe("work-unpark stage enforcement", () => {
    test("work-unpark allowed from idle", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-unpark")));
    });

    test("work-unpark denied from executing", async () => {
      await seedCache(tmpDir, "executing");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-unpark")), /in progress/i);
    });

    test("work-unpark denied from planned", async () => {
      await seedCache(tmpDir, "planned");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-unpark")), /work-run/i);
    });
  });

  describe("suspended stage", () => {
    beforeEach(() => seedCache(tmpDir, "suspended"));

    test("work-plan is allowed (falls through to idle behavior)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
    });

    test("work-unpark is allowed (restore from suspended)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-unpark")));
    });

    test("work-run is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-run")), /work-plan/i);
    });

    test("work-park is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:work-park")), /work-plan/i);
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
      const r = await runHook(HOOK, skillInput(skill));
      expect(r.exitCode).toBe(0);
      expect(r.json).not.toBeNull();
      expect((r.json as Record<string, unknown>)?.systemMessage).toMatch(/WARNING/);
    });
  });

  test("Tier 2: regular non-dp-cto skill passes silently", async () => {
    const r = await runHook(HOOK, skillInput("some-other-skill"));
    expectAllowed(r);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });
});

// ─── Stage Transitions ──────────────────────────────────────────────────────

describe("Stage Transitions (stage-transition.sh)", () => {
  const hook = "stage-transition.sh";

  test("work-plan transitions to planned via cache", async () => {
    await seedCache(tmpDir, "planning");
    await runHook(hook, skillInput("dp-cto:work-plan"));
    expect(await getCacheStage(tmpDir)).toBe("planned");
  });

  test("work-run transitions to polishing via cache", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("dp-cto:work-run"));
    expect(await getCacheStage(tmpDir)).toBe("polishing");
  });

  test("work-polish transitions to complete via cache", async () => {
    await seedCache(tmpDir, "polishing");
    await runHook(hook, skillInput("dp-cto:work-polish"));
    expect(await getCacheStage(tmpDir)).toBe("complete");
  });

  test("work-run-loop does not change cache stage", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("dp-cto:work-run-loop"));
    expect(await getCacheStage(tmpDir)).toBe("executing");
  });

  test("quality-fact-check does not change cache stage", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("dp-cto:quality-fact-check"));
    expect(await getCacheStage(tmpDir)).toBe("executing");
  });

  test("non-dp-cto skill has no side effects", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("some-other-plugin:tdd"));
    expect(await getCacheStage(tmpDir)).toBe("executing");
  });

  test("work-park triggers suspend_state via stage-transition", async () => {
    await seedCache(tmpDir, "executing", "epic-42");
    const mockPath = await createMockBd(tmpDir);
    try {
      const r = await runHook(
        hook,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-park" },
          tool_result: "done",
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expect(r.exitCode).toBe(0);
      const stage = await getCacheStage(tmpDir);
      expect(stage).toBe("idle");
    } finally {
      await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
    }
  });

  test("work-unpark does not modify cache via stage-transition", async () => {
    await seedCache(tmpDir, "idle");
    const r = await runHook(hook, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:work-unpark" },
      tool_result: "done",
      session_id: "s1",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const stage = await getCacheStage(tmpDir);
    expect(stage).toBe("idle");
  });

  test("work-plan with active epic calls write_state for planned", async () => {
    await seedCache(tmpDir, "planning", "epic-99");
    const mockPath = await createMockBd(tmpDir);
    try {
      const r = await runHook(
        hook,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-plan" },
          tool_result: "done",
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expect(r.exitCode).toBe(0);
      const stage = await getCacheStage(tmpDir);
      expect(stage).toBe("planned");
    } finally {
      await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
    }
  });

  test("work-polish with active epic calls write_state for complete", async () => {
    await seedCache(tmpDir, "polishing", "epic-77");
    const mockPath = await createMockBd(tmpDir);
    try {
      const r = await runHook(
        hook,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:work-polish" },
          tool_result: "done",
          session_id: "s1",
          cwd: tmpDir,
        },
        { PATH: mockPath },
      );
      expect(r.exitCode).toBe(0);
      const stage = await getCacheStage(tmpDir);
      expect(stage).toBe("complete");
    } finally {
      await rm(join(tmpDir, ".mock-bin"), { recursive: true, force: true });
    }
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  test("missing cache file defaults to idle — work-plan allowed", async () => {
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
  });

  test("missing cache file defaults to idle — work-run denied", async () => {
    expectDenied(await runHook(HOOK, skillInput("dp-cto:work-run")));
  });

  test("corrupt cache JSON defaults to idle — work-plan allowed", async () => {
    await seedCorruptCache(tmpDir);
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
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
    await seedCache(tmpDir, "bogus");
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:work-plan")));
  });

  test("unknown stage value treated as idle — work-run denied", async () => {
    await seedCache(tmpDir, "bogus");
    expectDenied(await runHook(HOOK, skillInput("dp-cto:work-run")), /work-plan/i);
  });
});

// ─── SessionStart ────────────────────────────────────────────────────────────

describe("SessionStart (session-start.sh)", () => {
  const SESSION_HOOK = "session-start.sh";

  test("initializes legacy stage to idle (degraded mode)", async () => {
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("idle");
  });

  test("overwrites existing stage on new session (degraded mode)", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("idle");
  });

  test("enforcement message includes planning stage", async () => {
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/planning/);
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

  describe("session recovery detection", () => {
    // Recovery requires non-degraded mode (.beads/ dir + bd CLI).
    // Use mock bd to avoid real bd hanging in empty .beads/ dir.
    let mockPath: string;

    beforeEach(async () => {
      await seedBeadsDir(tmpDir);
      mockPath = await createMockBd(tmpDir);
    });

    test("clean start (no orphans): no recovery context", async () => {
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
      expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    });

    test("breadcrumb with non-terminal stage: recovery context injected", async () => {
      await seedStage(tmpDir, "old-session", "executing", ".claude/plans/feat/02-impl.md");
      await seedBreadcrumb(tmpDir, "old-session", "executing", ".claude/plans/feat/02-impl.md");
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
      expect(ctx).toMatch(/RECOVERY.*legacy breadcrumb/);
      expect(ctx).toMatch(/old-session/);
      expect(ctx).toMatch(/executing/);
      expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    });

    test("stale breadcrumb (deleted stage file): falls through to scan", async () => {
      await seedBreadcrumb(tmpDir, "gone-session", "planned", ".claude/plans/x.md");
      await seedStage(tmpDir, "orphan-session", "executing", ".claude/plans/y.md");
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
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/orphan-session/);
      expect(ctx).toMatch(/executing/);
    });

    test("multiple orphaned stage files: picks latest by started_at", async () => {
      const dir = join(tmpDir, ".claude", "dp-cto");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "older-session.stage.json"),
        JSON.stringify({
          stage: "planned",
          plan_path: ".claude/plans/a.md",
          started_at: "2026-01-01T00:00:00Z",
          history: ["planned"],
        }),
      );
      await writeFile(
        join(dir, "newer-session.stage.json"),
        JSON.stringify({
          stage: "executing",
          plan_path: ".claude/plans/b.md",
          started_at: "2026-01-02T00:00:00Z",
          history: ["executing"],
        }),
      );
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
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/newer-session/);
      expect(ctx).toMatch(/executing/);
    });

    test("no-op when all stage files are terminal", async () => {
      await seedStage(tmpDir, "done-session-1", "idle");
      await seedStage(tmpDir, "done-session-2", "ended");
      await seedStage(tmpDir, "done-session-3", "complete");
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
    });

    test("single orphan with ended stage: no recovery context", async () => {
      await seedStage(tmpDir, "old-session", "ended");
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
    });

    test("scan skips stage file matching current session ID", async () => {
      await seedStage(tmpDir, "new-session", "executing", ".claude/plans/z.md");
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
    });
  });
});

// ─── Completion Gate ─────────────────────────────────────────────────────────

describe("Completion Gate (completion-gate.sh)", () => {
  const GATE_HOOK = "completion-gate.sh";

  function agentInput(response: string) {
    return {
      tool_name: "Agent",
      tool_response: response,
    };
  }

  test("non-Agent tool passes silently", async () => {
    const r = await runHook(GATE_HOOK, {
      tool_name: "Bash",
      tool_response: "all tests pass",
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("Agent output with no completion claim passes silently", async () => {
    const r = await runHook(GATE_HOOK, agentInput("I refactored the module and updated imports."));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("Agent output with claim but no evidence emits warning", async () => {
    const r = await runHook(
      GATE_HOOK,
      agentInput("Implementation complete. Everything looks good."),
    );
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/quality-check-done/i);
  });

  test("Agent output with claim and test evidence passes silently", async () => {
    const r = await runHook(
      GATE_HOOK,
      agentInput("All tests pass. 42 passed, 0 failed. Implementation complete."),
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test.each([
    "all tests pass",
    "implementation complete",
    "task complete",
    "completed successfully",
    "all done",
    "work is done",
    "work is complete",
    "changes are complete",
  ])("claim phrase '%s' without evidence triggers warning", async (phrase) => {
    const r = await runHook(GATE_HOOK, agentInput(`${phrase}. Looks good.`));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/verify/i);
  });

  test.each([
    "12 passed, 0 failed",
    "exit code 0",
    "test suites: 3 passed",
    "vitest run completed",
    "ok 1 - test name",
    "expect(",
  ])("evidence pattern '%s' suppresses warning", async (evidence) => {
    const r = await runHook(GATE_HOOK, agentInput(`Implementation complete. ${evidence}`));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("empty tool_response passes silently", async () => {
    const r = await runHook(GATE_HOOK, {
      tool_name: "Agent",
      tool_response: "",
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("missing tool_response passes silently", async () => {
    const r = await runHook(GATE_HOOK, { tool_name: "Agent" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("ALL-CAPS claim phrase triggers warning (case folding)", async () => {
    const r = await runHook(GATE_HOOK, agentInput("IMPLEMENTATION COMPLETE. Looks good."));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/verify/i);
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

  function runHookWithoutJq(script: string, input: Record<string, unknown>): Promise<HookResult> {
    return new Promise((resolve) => {
      const proc = spawn("bash", [join(HOOK_DIR, script)], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PATH: jqFreePath },
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();
      proc.on("close", (code) => {
        let json: Record<string, unknown> | null = null;
        const trimmed = stdout.trim();
        if (trimmed) {
          try {
            json = JSON.parse(trimmed);
          } catch {}
        }
        resolve({
          stdout: trimmed,
          stderr: stderr.trim(),
          exitCode: code ?? 1,
          json,
        });
      });
    });
  }

  test.each([
    "intercept-orchestration.sh",
    "stage-transition.sh",
    "completion-gate.sh",
    "research-validator.sh",
  ])("%s exits 0 when jq is missing", async (hook) => {
    const r = await runHookWithoutJq(hook, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:work-plan" },
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
  });

  test("session-start.sh outputs degraded message when jq missing", async () => {
    const r = await runHookWithoutJq("session-start.sh", {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const hso = r.json?.hookSpecificOutput as Record<string, unknown> | undefined;
    expect(hso).toBeDefined();
  });
});
