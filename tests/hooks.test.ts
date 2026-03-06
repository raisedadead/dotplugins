import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  runHook,
  seedStage,
  seedCorruptStage,
  getStage,
  getPlanPath,
  seedIndex,
  createTmpDir,
  removeTmpDir,
  getBreadcrumb,
  breadcrumbExists,
  seedBreadcrumb,
} from "./helpers";

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
    beforeEach(() => seedStage(tmpDir, "test-session", "idle"));

    test("start is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /start/i);
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /start/i);
    });
  });

  describe("planning stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "planning"));

    test("start is denied (in progress)", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:start")), /wait/i);
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /wait/i);
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /wait/i);
    });

    test("ralph-cancel is allowed (safety valve)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph-cancel")));
    });
  });

  describe("planned stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "planned"));

    test("execute is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:execute")));
    });

    test("start is allowed (re-plan)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /execute/i);
    });

    test("polish is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:polish")), /execute/i);
    });

    test("verify is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:verify")), /execute/i);
    });
  });

  describe("executing stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "executing"));

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
      expectDenied(await runHook(HOOK, skillInput("dp-cto:start")), /progress/i);
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /progress/i);
    });
  });

  describe("polishing stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "polishing"));

    test("verify is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:verify")));
    });

    test("start is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:start")), /polish/i);
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /polish/i);
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /polish/i);
    });

    test("ralph-cancel is allowed (safety valve)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph-cancel")));
    });
  });

  describe("complete stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "complete"));

    test("start is allowed (new cycle)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
    });

    test("polish is allowed (standalone re-polish)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
    });

    test("execute is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /start/i);
    });

    test("ralph is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:ralph")), /start/i);
    });

    test("verify is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-cto:verify")), /start/i);
    });
  });

  describe("ralph-cancel safety valve", () => {
    test.each(["idle", "planning", "executing", "polishing", "complete"])(
      "allowed from %s",
      async (stage) => {
        await seedStage(tmpDir, "test-session", stage);
        expectAllowed(await runHook(HOOK, skillInput("dp-cto:ralph-cancel")));
      },
    );
  });

  describe("pre-execution stage writes", () => {
    test("start writes planning stage", async () => {
      await seedStage(tmpDir, "test-session", "idle");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
      expect(await getStage(tmpDir, "test-session")).toBe("planning");
    });

    test("execute writes executing stage", async () => {
      await seedStage(tmpDir, "test-session", "planned");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:execute")));
      expect(await getStage(tmpDir, "test-session")).toBe("executing");
    });

    test("polish writes polishing stage", async () => {
      await seedStage(tmpDir, "test-session", "executing");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
      expect(await getStage(tmpDir, "test-session")).toBe("polishing");
    });

    test("execute preserves existing plan_path", async () => {
      await seedStage(tmpDir, "test-session", "planned", ".claude/plans/test/02-implementation.md");
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:execute")));
      expect(await getPlanPath(tmpDir, "test-session")).toBe(
        ".claude/plans/test/02-implementation.md",
      );
    });

    test("polish preserves existing plan_path", async () => {
      await seedStage(
        tmpDir,
        "test-session",
        "executing",
        ".claude/plans/test/02-implementation.md",
      );
      expectAllowed(await runHook(HOOK, skillInput("dp-cto:polish")));
      expect(await getStage(tmpDir, "test-session")).toBe("polishing");
      expect(await getPlanPath(tmpDir, "test-session")).toBe(
        ".claude/plans/test/02-implementation.md",
      );
    });
  });
});

// ─── Superpowers Interception ───────────────────────────────────────────────

describe("Superpowers Interception (intercept-orchestration.sh)", () => {
  test("non-Skill tool passes silently", async () => {
    const r = await runHook(HOOK, { tool_name: "Bash" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  describe("Tier 1: deny orchestration skills", () => {
    test.each([
      "superpowers:executing-plans",
      "superpowers:brainstorming",
      "superpowers:dispatching-parallel-agents",
      "superpowers:subagent-driven-development",
      "superpowers:using-git-worktrees",
      "superpowers:finishing-a-development-branch",
      "superpowers:writing-plans",
      "superpowers:ralph-loop",
    ])("%s is denied", async (skill) => {
      const r = await runHook(HOOK, skillInput(skill));
      expect(r.exitCode).toBe(0);
      const hso = r.json?.hookSpecificOutput as Record<string, unknown>;
      expect(hso?.permissionDecision).toBe("deny");
    });
  });

  describe("Tier 2: pass quality skills", () => {
    test.each([
      "superpowers:test-driven-development",
      "superpowers:requesting-code-review",
      "superpowers:receiving-code-review",
      "superpowers:systematic-debugging",
      "superpowers:verification-before-completion",
      "superpowers:writing-skills",
      "superpowers:using-superpowers",
    ])("%s is allowed", async (skill) => {
      expectAllowed(await runHook(HOOK, skillInput(skill)));
    });
  });

  test("Tier 3: warn for orchestration-adjacent unknown skill", async () => {
    const r = await runHook(HOOK, skillInput("superpowers:parallel-something"));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/WARNING/);
  });

  test("Tier 4: non-superpowers skill passes silently", async () => {
    expectAllowed(await runHook(HOOK, skillInput("some-other-skill")));
  });
});

// ─── Stage Transitions ──────────────────────────────────────────────────────

describe("Stage Transitions (stage-transition.sh)", () => {
  const hook = "stage-transition.sh";

  test("start transitions planning -> planned", async () => {
    await seedStage(tmpDir, "test-session", "planning");
    await runHook(hook, skillInput("dp-cto:start"));
    expect(await getStage(tmpDir, "test-session")).toBe("planned");
  });

  test("execute transitions executing -> polishing", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    await runHook(hook, skillInput("dp-cto:execute"));
    expect(await getStage(tmpDir, "test-session")).toBe("polishing");
  });

  test("polish transitions polishing -> complete", async () => {
    await seedStage(tmpDir, "test-session", "polishing");
    await runHook(hook, skillInput("dp-cto:polish"));
    expect(await getStage(tmpDir, "test-session")).toBe("complete");
  });

  test("ralph does not change stage", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    await runHook(hook, skillInput("dp-cto:ralph"));
    expect(await getStage(tmpDir, "test-session")).toBe("executing");
  });

  test("verify does not change stage", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    await runHook(hook, skillInput("dp-cto:verify"));
    expect(await getStage(tmpDir, "test-session")).toBe("executing");
  });

  test("non-dp-cto skill has no side effects", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    await runHook(hook, skillInput("superpowers:test-driven-development"));
    expect(await getStage(tmpDir, "test-session")).toBe("executing");
  });

  test("start extracts plan_path from _index.md", async () => {
    await seedStage(tmpDir, "test-session", "planning");
    await seedIndex(tmpDir, "tui/02-implementation.md");
    await runHook("stage-transition.sh", skillInput("dp-cto:start"));
    expect(await getPlanPath(tmpDir, "test-session")).toBe(
      ".claude/plans/tui/02-implementation.md",
    );
  });
});

// ─── Breadcrumb Tracking ─────────────────────────────────────────────────────

describe("Breadcrumb Tracking (stage-transition.sh)", () => {
  const hook = "stage-transition.sh";

  test("start writes active.json with planned stage and correct plan_path", async () => {
    await seedStage(tmpDir, "test-session", "planning");
    await seedIndex(tmpDir, "tui/02-implementation.md");
    await runHook(hook, skillInput("dp-cto:start"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("planned");
    expect(breadcrumb.plan_path).toBe(".claude/plans/tui/02-implementation.md");
    expect(breadcrumb.session_id).toBe("test-session");
    expect(breadcrumb.cwd).toBe(tmpDir);
  });

  test("execute updates active.json to executing and preserves plan_path", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    await seedIndex(tmpDir, "tui/02-implementation.md");
    await runHook(hook, skillInput("dp-cto:start"));
    await seedStage(tmpDir, "test-session", "planned", ".claude/plans/tui/02-implementation.md");
    await runHook(hook, skillInput("dp-cto:execute"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("polishing");
    expect(breadcrumb.plan_path).toBe(".claude/plans/tui/02-implementation.md");
  });

  test("polish deletes active.json", async () => {
    await seedStage(tmpDir, "test-session", "polishing");
    await seedIndex(tmpDir, "tui/02-implementation.md");
    await runHook(hook, skillInput("dp-cto:start"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    await seedStage(tmpDir, "test-session", "polishing");
    await runHook(hook, skillInput("dp-cto:polish"));
    expect(await breadcrumbExists(tmpDir)).toBe(false);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  test("missing stage file defaults to idle — start allowed", async () => {
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
  });

  test("missing stage file defaults to idle — execute denied", async () => {
    expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")));
  });

  test("corrupt JSON defaults to idle — start allowed", async () => {
    await seedCorruptStage(tmpDir, "test-session");
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
  });

  test("missing session_id does not crash", async () => {
    const r = await runHook(HOOK, {
      tool_name: "Skill",
      tool_input: { skill: "dp-cto:start" },
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
  });

  test("unknown stage value treated as idle — start allowed", async () => {
    await seedStage(tmpDir, "test-session", "bogus");
    expectAllowed(await runHook(HOOK, skillInput("dp-cto:start")));
  });

  test("unknown stage value treated as idle — execute denied", async () => {
    await seedStage(tmpDir, "test-session", "bogus");
    expectDenied(await runHook(HOOK, skillInput("dp-cto:execute")), /start/i);
  });
});

// ─── SessionStart ────────────────────────────────────────────────────────────

describe("SessionStart (session-start.sh)", () => {
  const SESSION_HOOK = "session-start.sh";

  test("initializes stage to idle", async () => {
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("idle");
  });

  test("overwrites existing stage on new session", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("idle");
  });

  describe("session recovery detection", () => {
    test("clean start (no orphans): no recovery context", async () => {
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).not.toMatch(/RECOVERY/);
      expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    });

    test("breadcrumb with non-terminal stage: recovery context injected", async () => {
      await seedStage(tmpDir, "old-session", "executing", ".claude/plans/feat/02-impl.md");
      await seedBreadcrumb(tmpDir, "old-session", "executing", ".claude/plans/feat/02-impl.md");
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/old-session/);
      expect(ctx).toMatch(/executing/);
      expect(ctx).toMatch(/\.claude\/plans\/feat\/02-impl\.md/);
      expect(ctx).toMatch(/DP-CTO PLUGIN ENFORCEMENT/);
    });

    test("stale breadcrumb (deleted stage file): falls through to scan", async () => {
      await seedBreadcrumb(tmpDir, "gone-session", "planned", ".claude/plans/x.md");
      await seedStage(tmpDir, "orphan-session", "executing", ".claude/plans/y.md");
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/orphan-session/);
      expect(ctx).toMatch(/executing/);
    });

    test("multiple orphaned stage files: picks latest by started_at", async () => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
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
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
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
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).not.toMatch(/RECOVERY/);
    });

    test("single orphan with ended stage: no recovery context", async () => {
      await seedStage(tmpDir, "old-session", "ended");
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).not.toMatch(/RECOVERY/);
    });

    test("scan skips stage file matching current session ID", async () => {
      await seedStage(tmpDir, "new-session", "executing", ".claude/plans/z.md");
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).not.toMatch(/RECOVERY/);
    });
  });
});

// ─── SessionEnd ──────────────────────────────────────────────────────────────

describe("SessionEnd (session-cleanup.sh)", () => {
  const CLEANUP_HOOK = "session-cleanup.sh";

  test("preserves stage file with ended status", async () => {
    await seedStage(tmpDir, "test-session", "executing");
    const r = await runHook(CLEANUP_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("ended");
  });

  test("no-ops without pre-existing stage file", async () => {
    const r = await runHook(CLEANUP_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("idle");
  });
});

// ─── Research Validator ──────────────────────────────────────────────────────

describe("Research Validator (research-validator.sh)", () => {
  test("exits 0 and produces valid JSON with RESEARCH VALIDATION context", async () => {
    const r = await runHook("research-validator.sh", {
      tool_name: "WebSearch",
      tool_input: { query: "test" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/RESEARCH VALIDATION/);
  });
});

// ─── Breadcrumb Tracking: execute with missing breadcrumb ────────────────────

describe("Breadcrumb Tracking: execute with missing breadcrumb", () => {
  const hook = "stage-transition.sh";

  test("execute without prior breadcrumb uses plan_path from stage file", async () => {
    await seedStage(tmpDir, "test-session", "executing", ".claude/plans/feat/02-implementation.md");
    await runHook(hook, skillInput("dp-cto:execute"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.plan_path).toBe("");
  });
});
