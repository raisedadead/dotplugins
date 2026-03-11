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

    test("start is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /start/i);
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /start/i);
    });

    test("polish is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:polish")), /Run \/dp-cto:start first/);
    });

    test("verify is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:verify")), /Run \/dp-cto:start first/);
    });
  });

  describe("planning stage", () => {
    beforeEach(() => seedCache(tmpDir, "planning"));

    test("start is denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:start")),
        /Wait for \/dp-cto:start to complete/,
      );
    });

    test("execute is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:execute")),
        /Wait for \/dp-cto:start to complete/,
      );
    });

    test("ralph is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:ralph")),
        /Wait for \/dp-cto:start to complete/,
      );
    });

    test("ralph-cancel is allowed (safety valve)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph-cancel")));
    });
  });

  describe("planned stage", () => {
    beforeEach(() => seedCache(tmpDir, "planned"));

    test("execute is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:execute")));
    });

    test("start is allowed (re-plan)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /Run \/dp-cto:execute first/);
    });

    test("polish is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:polish")), /Run \/dp-cto:execute first/);
    });

    test("verify is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:verify")), /Run \/dp-cto:execute first/);
    });
  });

  describe("executing stage", () => {
    beforeEach(() => seedCache(tmpDir, "executing"));

    test("ralph is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph")));
    });

    test("verify is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:verify")));
    });

    test("polish is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
    });

    test("start is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:start")), /Implementation in progress/);
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /Implementation in progress/);
    });
  });

  describe("polishing stage", () => {
    beforeEach(() => seedCache(tmpDir, "polishing"));

    test("verify is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:verify")));
    });

    test("start is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:start")),
        /Polish in progress.*Wait for \/dp-cto:polish to complete/,
      );
    });

    test("execute is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:execute")),
        /Polish in progress.*Wait for \/dp-cto:polish to complete/,
      );
    });

    test("ralph is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:ralph")),
        /Polish in progress.*Wait for \/dp-cto:polish to complete/,
      );
    });

    test("ralph-cancel is allowed (safety valve)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph-cancel")));
    });

    test("polish is allowed (re-invocation)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
    });
  });

  describe("complete stage", () => {
    beforeEach(() => seedCache(tmpDir, "complete"));

    test("start is allowed (new cycle)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
    });

    test("polish is allowed (standalone re-polish)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
    });

    test("execute is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:execute")),
        /Run \/dp-cto:start to begin a new feature/,
      );
    });

    test("ralph is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:ralph")),
        /Run \/dp-cto:start to begin a new feature/,
      );
    });

    test("verify is denied", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-cto:verify")),
        /Run \/dp-cto:start to begin a new feature/,
      );
    });
  });

  describe("ralph-cancel safety valve", () => {
    test.each(["idle", "planning", "planned", "executing", "polishing", "complete"])(
      "allowed from %s",
      async (stage) => {
        if (stage !== "idle") await seedCache(tmpDir, stage);
        expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph-cancel")));
      },
    );
  });

  describe("pre-execution cache writes", () => {
    test("start writes planning stage to cache", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
      expect(await getCacheStage(tmpDir)).toBe("planning");
    });

    test("execute writes executing stage to cache", async () => {
      await seedCache(tmpDir, "planned");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:execute")));
      expect(await getCacheStage(tmpDir)).toBe("executing");
    });

    test("polish writes polishing stage to cache", async () => {
      await seedCache(tmpDir, "executing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
      expect(await getCacheStage(tmpDir)).toBe("polishing");
    });

    test("execute from planned with active epic calls write_state", async () => {
      await seedCache(tmpDir, "planned", "epic-42");
      const mockPath = await createMockBd(tmpDir);
      try {
        const r = await runHook(
          "intercept-orchestration.sh",
          {
            tool_name: "Skill",
            tool_input: { skill: "dp-cto:execute" },
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
      "dp-cto:tdd",
      "dp-cto:debug",
      "dp-cto:verify-done",
      "dp-cto:review",
      "dp-cto:sweep",
      "dp-cto:cleanup",
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
          "dp-cto:tdd",
          "dp-cto:debug",
          "dp-cto:verify-done",
          "dp-cto:review",
          "dp-cto:sweep",
          "dp-cto:cleanup",
        ]) {
          expectAllowed(await runHook(HOOK, skillInput(skill)));
        }
      },
    );

    test("quality skills do not write cache transitions", async () => {
      await seedCache(tmpDir, "executing");
      await runHook(HOOK, skillInput("dp-cto:tdd"));
      expect(await getCacheStage(tmpDir)).toBe("executing");
    });
  });

  describe("board and sprint quality skill bypass", () => {
    test("board passes from idle (no stage enforcement)", async () => {
      const r = await runHook(HOOK, skillInput("dp-cto:board"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test("board passes from executing (quality skill bypass)", async () => {
      await seedCache(tmpDir, "executing");
      const r = await runHook(HOOK, skillInput("dp-cto:board"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test("sprint passes from idle", async () => {
      const r = await runHook(HOOK, skillInput("dp-cto:sprint"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });

    test("sprint passes from executing", async () => {
      await seedCache(tmpDir, "executing");
      const r = await runHook(HOOK, skillInput("dp-cto:sprint"));
      expectAllowed(r);
      expect(r.stdout).toBe("");
      expect(r.json).toBeNull();
    });
  });

  describe("interrupt stage enforcement", () => {
    test("interrupt allowed from executing", async () => {
      await seedCache(tmpDir, "executing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:interrupt")));
    });

    test("interrupt allowed from polishing", async () => {
      await seedCache(tmpDir, "polishing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:interrupt")));
    });

    test("interrupt denied from idle", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:interrupt")), /start/i);
    });

    test("interrupt denied from planned", async () => {
      await seedCache(tmpDir, "planned");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:interrupt")), /execute/i);
    });

    test("interrupt denied from complete", async () => {
      await seedCache(tmpDir, "complete");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:interrupt")), /start/i);
    });
  });

  describe("resume stage enforcement", () => {
    test("resume allowed from idle", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:resume")));
    });

    test("resume denied from executing", async () => {
      await seedCache(tmpDir, "executing");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:resume")), /in progress/i);
    });

    test("resume denied from planned", async () => {
      await seedCache(tmpDir, "planned");
      expectDenied(await runHook(HOOK, skillInput("dp-cto:resume")), /execute/i);
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

  test("start transitions to planned via cache", async () => {
    await seedCache(tmpDir, "planning");
    await runHook(hook, skillInput("dp-cto:start"));
    expect(await getCacheStage(tmpDir)).toBe("planned");
  });

  test("execute transitions to polishing via cache", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("dp-cto:execute"));
    expect(await getCacheStage(tmpDir)).toBe("polishing");
  });

  test("polish transitions to complete via cache", async () => {
    await seedCache(tmpDir, "polishing");
    await runHook(hook, skillInput("dp-cto:polish"));
    expect(await getCacheStage(tmpDir)).toBe("complete");
  });

  test("ralph does not change cache stage", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("dp-cto:ralph"));
    expect(await getCacheStage(tmpDir)).toBe("executing");
  });

  test("verify does not change cache stage", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("dp-cto:verify"));
    expect(await getCacheStage(tmpDir)).toBe("executing");
  });

  test("non-dp-cto skill has no side effects", async () => {
    await seedCache(tmpDir, "executing");
    await runHook(hook, skillInput("some-other-plugin:tdd"));
    expect(await getCacheStage(tmpDir)).toBe("executing");
  });

  test("interrupt triggers suspend_state via stage-transition", async () => {
    await seedCache(tmpDir, "executing", "epic-42");
    const mockPath = await createMockBd(tmpDir);
    try {
      const r = await runHook(
        hook,
        {
          tool_name: "Skill",
          tool_input: { skill: "dp-cto:interrupt" },
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

  test("resume does not modify cache via stage-transition", async () => {
    await seedCache(tmpDir, "idle");
    const r = await runHook(hook, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:resume" },
      tool_result: "done",
      session_id: "s1",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const stage = await getCacheStage(tmpDir);
    expect(stage).toBe("idle");
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  test("missing cache file defaults to idle — start allowed", async () => {
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
  });

  test("missing cache file defaults to idle — execute denied", async () => {
    expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")));
  });

  test("corrupt cache JSON defaults to idle — start allowed", async () => {
    await seedCorruptCache(tmpDir);
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
  });

  test("missing session_id does not crash and creates no side-effect files", async () => {
    const r = await runHook(HOOK, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:start" },
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const files = await listStageDir(tmpDir);
    expect(files).toEqual([]);
  });

  test("unknown stage value treated as idle — start allowed", async () => {
    await seedCache(tmpDir, "bogus");
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
  });

  test("unknown stage value treated as idle — execute denied", async () => {
    await seedCache(tmpDir, "bogus");
    expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /start/i);
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
    expect(ctx).toMatch(/verify.*verify-done/i);
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
        const realPath = execFileSync("which", [bin], { encoding: "utf-8" }).trim();
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
        resolve({ stdout: trimmed, stderr: stderr.trim(), exitCode: code ?? 1, json });
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
      tool_input: { skill: "dp-cto:start" },
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
