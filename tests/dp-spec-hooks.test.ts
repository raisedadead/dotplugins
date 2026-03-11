import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  runHook,
  seedStage,
  seedCorruptStage,
  getStage,
  getFullStage,
  listStageDir,
  createTmpDir,
  removeTmpDir,
  getBreadcrumb,
  breadcrumbExists,
  seedBreadcrumb,
  expectAllowed,
  expectDenied,
  HOOK_DIR,
  VALID_EVENTS,
  VALID_HANDLER_TYPES,
} from "./dp-spec-helpers";
import type { HookResult } from "./dp-spec-helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PLUGIN_ROOT = join(REPO_ROOT, "plugins", "dp-spec");
const PLUGIN_JSON = join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
const HOOKS_JSON = join(PLUGIN_ROOT, "hooks", "hooks.json");
const SKILLS_ROOT = join(PLUGIN_ROOT, "skills");

const REQUIRED_LIFECYCLE_EVENTS = ["SessionStart", "PreToolUse", "PostToolUse", "SessionEnd"];

const DP_SPEC_STAGES = [
  "idle",
  "discovering",
  "discovered",
  "brainstorming",
  "brainstormed",
  "researching",
  "researched",
  "drafting",
  "drafted",
  "challenging",
  "challenged",
  "complete",
];

const EXPECTED_SKILLS = [
  "discover",
  "brainstorm",
  "research",
  "draft",
  "challenge",
  "handoff",
  "plan",
];

// ─── hooks.json contract ──────────────────────────────────────────────────────

describe("dp-spec hooks.json contract", () => {
  let data: Record<string, unknown>;
  let hooks: Record<string, unknown[]>;

  beforeAll(async () => {
    data = JSON.parse(await readFile(HOOKS_JSON, "utf-8"));
    hooks = data.hooks as Record<string, unknown[]>;
  });

  test("hooks.json is valid JSON with a .hooks key", () => {
    expect(data.hooks).toBeTypeOf("object");
    expect(data.hooks).not.toBeNull();
  });

  test("all event names are valid Claude Code lifecycle events", () => {
    for (const event of Object.keys(hooks)) {
      expect(VALID_EVENTS).toContain(event);
    }
  });

  test("hooks exist for all 4 required lifecycle events", () => {
    const definedEvents = Object.keys(hooks);
    for (const event of REQUIRED_LIFECYCLE_EVENTS) {
      expect(definedEvents, `missing lifecycle event: ${event}`).toContain(event);
    }
  });

  test("each event has valid matcher array structure", () => {
    for (const [_event, matchers] of Object.entries(hooks)) {
      expect(matchers).toBeInstanceOf(Array);
      for (const matcher of matchers as Record<string, unknown>[]) {
        expect(matcher.matcher).toBeTypeOf("string");
        expect(matcher.hooks).toBeInstanceOf(Array);
      }
    }
  });

  test("all handler types are valid", () => {
    for (const matchers of Object.values(hooks)) {
      for (const matcher of matchers as Record<string, unknown>[]) {
        for (const hook of matcher.hooks as Record<string, unknown>[]) {
          expect(VALID_HANDLER_TYPES).toContain(hook.type);
        }
      }
    }
  });

  test("all matcher patterns are valid regex", () => {
    for (const [_event, matchers] of Object.entries(hooks)) {
      for (const matcher of matchers as Record<string, unknown>[]) {
        const pattern = matcher.matcher as string;
        expect(() => new RegExp(pattern), `invalid regex: ${pattern}`).not.toThrow();
      }
    }
  });

  test("all command handlers reference existing scripts", () => {
    for (const matchers of Object.values(hooks)) {
      for (const matcher of matchers as Record<string, unknown>[]) {
        for (const hook of matcher.hooks as Record<string, unknown>[]) {
          if (hook.type === "command" && hook.command) {
            const resolved = (hook.command as string).replace("${CLAUDE_PLUGIN_ROOT}", PLUGIN_ROOT);
            expect(existsSync(resolved), `${hook.command} should resolve to existing file`).toBe(
              true,
            );
          }
        }
      }
    }
  });
});

// ─── plugin.json contract ─────────────────────────────────────────────────────

describe("dp-spec plugin.json contract", () => {
  let data: Record<string, unknown>;

  beforeAll(async () => {
    data = JSON.parse(await readFile(PLUGIN_JSON, "utf-8"));
  });

  test("plugin.json is valid JSON with required name field", () => {
    expect(data.name).toBeTypeOf("string");
    expect(data.name).toBe("dp-spec");
  });

  test("version is a valid semver string", () => {
    expect(data.version).toBeTypeOf("string");
    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("description is a string", () => {
    expect(data.description).toBeTypeOf("string");
  });

  test("optional fields have correct types when present", () => {
    if ("author" in data) expect(data.author).toBeTypeOf("object");
    if ("repository" in data) expect(data.repository).toBeTypeOf("string");
    if ("keywords" in data) expect(data.keywords).toBeInstanceOf(Array);
  });
});

// ─── Skill frontmatter contract ───────────────────────────────────────────────

describe("dp-spec Skill frontmatter", () => {
  let skillDirs: string[];

  beforeAll(async () => {
    const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
    skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  });

  test("all expected skills have directories", () => {
    for (const skill of EXPECTED_SKILLS) {
      expect(skillDirs, `missing skill directory: ${skill}`).toContain(skill);
    }
  });

  test("no unexpected skill directories", () => {
    for (const dir of skillDirs) {
      expect(EXPECTED_SKILLS, `unexpected skill directory: ${dir}`).toContain(dir);
    }
  });

  test.each(
    EXPECTED_SKILLS.filter((s) => {
      const skillMd = join(SKILLS_ROOT, s, "SKILL.md");
      return existsSync(skillMd);
    }),
  )("%s/SKILL.md has valid YAML frontmatter with name matching directory", async (skill) => {
    const skillMd = join(SKILLS_ROOT, skill, "SKILL.md");
    const content = await readFile(skillMd, "utf-8");
    const lines = content.split("\n");
    expect(lines[0]).toBe("---");

    const closingIdx = lines.indexOf("---", 1);
    expect(closingIdx, "frontmatter should have closing ---").toBeGreaterThan(0);

    const frontmatter = lines.slice(1, closingIdx).join("\n");
    const nameMatch = frontmatter.match(/^name:\s*"?([^"\n]+)"?/m);
    expect(nameMatch, `${skill}/SKILL.md should have a name field`).not.toBeNull();
    expect(nameMatch![1].trim()).toBe(skill);
  });

  test("all skill directories with SKILL.md files are accounted for", async () => {
    for (const dir of skillDirs) {
      const skillMd = join(SKILLS_ROOT, dir, "SKILL.md");
      if (existsSync(skillMd)) {
        expect(EXPECTED_SKILLS, `unexpected skill with SKILL.md: ${dir}`).toContain(dir);
      }
    }
  });
});

// ─── Stage machine contract ───────────────────────────────────────────────────

describe("dp-spec stage machine contract", () => {
  test("all 12 stages are covered in the intercept-skills.sh state machine", async () => {
    const hookScript = await readFile(join(HOOK_DIR, "intercept-skills.sh"), "utf-8");
    for (const stage of DP_SPEC_STAGES) {
      expect(hookScript, `stage '${stage}' should appear in intercept-skills.sh`).toMatch(
        new RegExp(stage),
      );
    }
  });

  test("stage-transition.sh handles all resting state outputs", async () => {
    const transitionScript = await readFile(join(HOOK_DIR, "stage-transition.sh"), "utf-8");
    const restingStates = [
      "discovered",
      "brainstormed",
      "researched",
      "drafted",
      "challenged",
      "complete",
    ];
    for (const stage of restingStates) {
      expect(
        transitionScript,
        `resting state '${stage}' should be produced by stage-transition.sh`,
      ).toMatch(new RegExp(`"${stage}"`));
    }
  });
});

// ─── Behavioral tests ────────────────────────────────────────────────────────

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

const HOOK = "intercept-skills.sh";

// ─── Stage Enforcement ──────────────────────────────────────────────────────

describe("dp-spec Stage Enforcement (intercept-skills.sh)", () => {
  describe("idle stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "idle"));

    test("plan is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:plan")));
    });

    test("discover is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("brainstorm is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:brainstorm")), /discover/i);
    });

    test("research is denied (workflow mode)", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:research")), /brainstorm/i);
    });

    test("draft is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:draft")));
    });

    test("challenge is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:challenge")));
    });

    test("handoff is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:handoff")));
    });
  });

  describe("discovering stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "discovering"));

    test("all dp-spec skills denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-spec:discover")),
        /Wait for.*discover.*to complete/i,
      );
    });

    test("plan is denied (in progress)", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:plan")));
    });
  });

  describe("discovered stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "discovered"));

    test("brainstorm is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:brainstorm")));
    });

    test("discover is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("research is denied (workflow mode)", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:research")));
    });

    test("draft is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:draft")));
    });
  });

  describe("brainstorming stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "brainstorming"));

    test("all dp-spec skills denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-spec:brainstorm")),
        /Wait for.*brainstorm.*to complete/i,
      );
    });
  });

  describe("brainstormed stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "brainstormed"));

    test("research is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:research")));
    });

    test("discover is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("brainstorm is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:brainstorm")));
    });

    test("draft is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:draft")));
    });
  });

  describe("researching stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "researching"));

    test("all dp-spec skills denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-spec:research")),
        /Wait for.*research.*to complete/i,
      );
    });
  });

  describe("researched stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "researched"));

    test("draft is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:draft")));
    });

    test("discover is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("research is denied (workflow mode)", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:research")));
    });
  });

  describe("drafting stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "drafting"));

    test("all dp-spec skills denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-spec:draft")),
        /Wait for.*draft.*to complete/i,
      );
    });
  });

  describe("drafted stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "drafted"));

    test("challenge is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:challenge")));
    });

    test("discover is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("draft is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:draft")));
    });
  });

  describe("challenging stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "challenging"));

    test("all dp-spec skills denied (in progress)", async () => {
      expectDenied(
        await runHook(HOOK, skillInput("dp-spec:challenge")),
        /Wait for.*challenge.*to complete/i,
      );
    });
  });

  describe("challenged stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "challenged"));

    test("handoff is allowed", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:handoff")));
    });

    test("discover is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("challenge is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:challenge")));
    });
  });

  describe("complete stage", () => {
    beforeEach(() => seedStage(tmpDir, "test-session", "complete"));

    test("plan is allowed (new cycle)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:plan")));
    });

    test("discover is allowed (new cycle)", async () => {
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:discover")));
    });

    test("brainstorm is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:brainstorm")));
    });

    test("handoff is denied", async () => {
      expectDenied(await runHook(HOOK, skillInput("dp-spec:handoff")));
    });
  });

  describe("research standalone mode (quality skill bypass)", () => {
    test.each([
      "idle",
      "discovering",
      "discovered",
      "brainstorming",
      "researching",
      "researched",
      "drafting",
      "drafted",
      "challenging",
      "challenged",
      "complete",
    ])("research with standalone arg is allowed from %s", async (stage) => {
      await seedStage(tmpDir, "test-session", stage);
      const input = {
        tool_name: "Skill",
        tool_input: { skill: "dp-spec:research", args: "--standalone" },
        session_id: "test-session",
        cwd: tmpDir,
      };
      expectAllowed(await runHook(HOOK, input));
    });
  });

  describe("pre-execution stage writes", () => {
    test("discover writes discovering stage", async () => {
      await seedStage(tmpDir, "test-session", "idle");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:discover")));
      expect(await getStage(tmpDir, "test-session")).toBe("discovering");
    });

    test("brainstorm writes brainstorming stage", async () => {
      await seedStage(tmpDir, "test-session", "discovered");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:brainstorm")));
      expect(await getStage(tmpDir, "test-session")).toBe("brainstorming");
    });

    test("research writes researching stage", async () => {
      await seedStage(tmpDir, "test-session", "brainstormed");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:research")));
      expect(await getStage(tmpDir, "test-session")).toBe("researching");
    });

    test("draft writes drafting stage", async () => {
      await seedStage(tmpDir, "test-session", "researched");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:draft")));
      expect(await getStage(tmpDir, "test-session")).toBe("drafting");
    });

    test("challenge writes challenging stage", async () => {
      await seedStage(tmpDir, "test-session", "drafted");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:challenge")));
      expect(await getStage(tmpDir, "test-session")).toBe("challenging");
    });

    test("plan does not write transient stage (sub-skills handle transitions)", async () => {
      await seedStage(tmpDir, "test-session", "idle");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:plan")));
      expect(await getStage(tmpDir, "test-session")).toBe("idle");
    });

    test("handoff does not write transient stage (terminal transition)", async () => {
      await seedStage(tmpDir, "test-session", "challenged");
      expectAllowed(await runHook(HOOK, skillInput("dp-spec:handoff")));
      expect(await getStage(tmpDir, "test-session")).toBe("challenged");
    });
  });
});

// ─── Skill Interception (non-dp-spec) ─────────────────────────────────────

describe("dp-spec Skill Interception (intercept-skills.sh)", () => {
  test("non-Skill tool passes silently", async () => {
    const r = await runHook(HOOK, { tool_name: "Bash" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });

  test("non-dp-spec skill passes silently", async () => {
    const r = await runHook(HOOK, skillInput("some-other-skill"));
    expectAllowed(r);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });

  test("dp-cto skills pass silently (not our concern)", async () => {
    const r = await runHook(HOOK, skillInput("dp-cto:start"));
    expectAllowed(r);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
  });
});

// ─── Stage Transitions ──────────────────────────────────────────────────────

describe("dp-spec Stage Transitions (stage-transition.sh)", () => {
  const hook = "stage-transition.sh";

  test("discover transitions discovering -> discovered", async () => {
    await seedStage(tmpDir, "test-session", "discovering");
    await runHook(hook, skillInput("dp-spec:discover"));
    expect(await getStage(tmpDir, "test-session")).toBe("discovered");
  });

  test("brainstorm transitions brainstorming -> brainstormed", async () => {
    await seedStage(tmpDir, "test-session", "brainstorming");
    await runHook(hook, skillInput("dp-spec:brainstorm"));
    expect(await getStage(tmpDir, "test-session")).toBe("brainstormed");
  });

  test("research transitions researching -> researched", async () => {
    await seedStage(tmpDir, "test-session", "researching");
    await runHook(hook, skillInput("dp-spec:research"));
    expect(await getStage(tmpDir, "test-session")).toBe("researched");
  });

  test("draft transitions drafting -> drafted", async () => {
    await seedStage(tmpDir, "test-session", "drafting");
    await runHook(hook, skillInput("dp-spec:draft"));
    expect(await getStage(tmpDir, "test-session")).toBe("drafted");
  });

  test("challenge transitions challenging -> challenged", async () => {
    await seedStage(tmpDir, "test-session", "challenging");
    await runHook(hook, skillInput("dp-spec:challenge"));
    expect(await getStage(tmpDir, "test-session")).toBe("challenged");
  });

  test("handoff transitions challenged -> complete", async () => {
    await seedStage(tmpDir, "test-session", "challenged");
    await runHook(hook, skillInput("dp-spec:handoff"));
    expect(await getStage(tmpDir, "test-session")).toBe("complete");
  });

  test("plan is a no-op in PostToolUse (sub-skills handle transitions)", async () => {
    await seedStage(tmpDir, "test-session", "discovering");
    await runHook(hook, skillInput("dp-spec:plan"));
    expect(await getStage(tmpDir, "test-session")).toBe("discovering");
  });

  test("research in standalone mode does not change stage", async () => {
    await seedStage(tmpDir, "test-session", "drafted");
    const input = {
      tool_name: "Skill",
      tool_input: { skill: "dp-spec:research", args: "--standalone" },
      session_id: "test-session",
      cwd: tmpDir,
    };
    await runHook(hook, input);
    expect(await getStage(tmpDir, "test-session")).toBe("drafted");
  });

  test("non-dp-spec skill has no side effects", async () => {
    await seedStage(tmpDir, "test-session", "researched");
    await runHook(hook, skillInput("some-other-plugin:foo"));
    expect(await getStage(tmpDir, "test-session")).toBe("researched");
  });
});

// ─── Breadcrumb Tracking ─────────────────────────────────────────────────────

describe("dp-spec Breadcrumb Tracking (stage-transition.sh)", () => {
  const hook = "stage-transition.sh";

  test("discover writes active.json with discovered stage", async () => {
    await seedStage(tmpDir, "test-session", "discovering");
    await runHook(hook, skillInput("dp-spec:discover"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("discovered");
    expect(breadcrumb.session_id).toBe("test-session");
    expect(breadcrumb.cwd).toBe(tmpDir);
  });

  test("handoff clears active.json", async () => {
    await seedBreadcrumb(tmpDir, "test-session", "challenged");
    await seedStage(tmpDir, "test-session", "challenged");
    await runHook(hook, skillInput("dp-spec:handoff"));
    expect(await breadcrumbExists(tmpDir)).toBe(false);
  });

  test("brainstorm updates breadcrumb to brainstormed", async () => {
    await seedStage(tmpDir, "test-session", "brainstorming");
    await runHook(hook, skillInput("dp-spec:brainstorm"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("brainstormed");
  });

  test("research updates breadcrumb to researched", async () => {
    await seedStage(tmpDir, "test-session", "researching");
    await runHook(hook, skillInput("dp-spec:research"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("researched");
    expect(breadcrumb.session_id).toBe("test-session");
    expect(breadcrumb.cwd).toBe(tmpDir);
  });

  test("draft updates breadcrumb to drafted", async () => {
    await seedStage(tmpDir, "test-session", "drafting");
    await runHook(hook, skillInput("dp-spec:draft"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("drafted");
    expect(breadcrumb.session_id).toBe("test-session");
    expect(breadcrumb.cwd).toBe(tmpDir);
  });

  test("challenge updates breadcrumb to challenged", async () => {
    await seedStage(tmpDir, "test-session", "challenging");
    await runHook(hook, skillInput("dp-spec:challenge"));
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const raw = await getBreadcrumb(tmpDir);
    const breadcrumb = JSON.parse(raw);
    expect(breadcrumb.stage).toBe("challenged");
    expect(breadcrumb.session_id).toBe("test-session");
    expect(breadcrumb.cwd).toBe(tmpDir);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("dp-spec Edge Cases", () => {
  test("missing stage file defaults to idle — discover allowed", async () => {
    expectAllowed(await runHook(HOOK, skillInput("dp-spec:discover")));
  });

  test("missing stage file defaults to idle — brainstorm denied", async () => {
    expectDenied(await runHook(HOOK, skillInput("dp-spec:brainstorm")));
  });

  test("corrupt JSON defaults to idle — discover allowed", async () => {
    await seedCorruptStage(tmpDir, "test-session");
    expectAllowed(await runHook(HOOK, skillInput("dp-spec:discover")));
  });

  test("missing session_id does not crash and creates no side-effect files", async () => {
    const r = await runHook(HOOK, {
      tool_name: "Skill",
      tool_input: { skill: "dp-spec:discover" },
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const files = await listStageDir(tmpDir);
    expect(files).toEqual([]);
  });

  test("unknown stage value treated as idle — discover allowed", async () => {
    await seedStage(tmpDir, "test-session", "bogus");
    expectAllowed(await runHook(HOOK, skillInput("dp-spec:discover")));
  });

  test("unknown stage value treated as idle — brainstorm denied", async () => {
    await seedStage(tmpDir, "test-session", "bogus");
    expectDenied(await runHook(HOOK, skillInput("dp-spec:brainstorm")));
  });
});

// ─── SessionStart ────────────────────────────────────────────────────────────

describe("dp-spec SessionStart (session-start.sh)", () => {
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
    await seedStage(tmpDir, "test-session", "researching");
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("idle");
  });

  test("enforcement message includes dp-spec skill names", async () => {
    const r = await runHook(SESSION_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-spec:discover/);
    expect(ctx).toMatch(/dp-spec:brainstorm/);
    expect(ctx).toMatch(/dp-spec:research/);
    expect(ctx).toMatch(/dp-spec:draft/);
    expect(ctx).toMatch(/dp-spec:challenge/);
    expect(ctx).toMatch(/dp-spec:handoff/);
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
      expect(ctx).toMatch(/DP-SPEC PLUGIN ENFORCEMENT/);
    });

    test("breadcrumb with non-terminal stage: recovery context injected", async () => {
      await seedStage(tmpDir, "old-session", "researching");
      await seedBreadcrumb(tmpDir, "old-session", "researching");
      const r = await runHook(SESSION_HOOK, {
        session_id: "new-session",
        cwd: tmpDir,
      });
      expect(r.exitCode).toBe(0);
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/RECOVERY/);
      expect(ctx).toMatch(/old-session/);
      expect(ctx).toMatch(/researching/);
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

    test("scan skips stage file matching current session ID", async () => {
      await seedStage(tmpDir, "new-session", "researching");
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

describe("dp-spec SessionEnd (session-cleanup.sh)", () => {
  const CLEANUP_HOOK = "session-cleanup.sh";

  test("preserves stage file with ended status", async () => {
    await seedStage(tmpDir, "test-session", "researching");
    const r = await runHook(CLEANUP_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(await getStage(tmpDir, "test-session")).toBe("ended");
  });

  test("preserves history through ended transition", async () => {
    await seedStage(tmpDir, "test-session", "researching");
    const r = await runHook(CLEANUP_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const full = await getFullStage(tmpDir, "test-session");
    expect(full).not.toBeNull();
    expect(full!.stage).toBe("ended");
    const history = full!.history as string[];
    expect(history).toContain("researching");
    expect(history).toContain("ended");
  });

  test("no-ops without pre-existing stage file", async () => {
    const r = await runHook(CLEANUP_HOOK, {
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    const files = await listStageDir(tmpDir);
    expect(files).toEqual([]);
  });
});

// ─── Research Validator ──────────────────────────────────────────────────────

describe("dp-spec Research Validator (research-validator.sh)", () => {
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

// ─── Path Traversal Session ID Tests ─────────────────────────────────────────

describe("dp-spec path traversal session_id hardening", () => {
  const MALICIOUS_IDS = [
    "../../../etc/passwd",
    "foo/bar",
    "session id with spaces",
    "session;rm -rf /",
    "session$(whoami)",
    "session`id`",
    "session|cat /etc/passwd",
    "..%2f..%2fetc",
  ];

  describe("intercept-skills.sh", () => {
    test.each(MALICIOUS_IDS)(
      "malicious session_id %j exits 0 with no files outside stage dir",
      async (badId) => {
        const r = await runHook(HOOK, {
          tool_name: "Skill",
          tool_input: { skill: "dp-spec:discover" },
          session_id: badId,
          cwd: tmpDir,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe("");
        const files = await listStageDir(tmpDir);
        expect(files).toEqual([]);
      },
    );
  });

  describe("stage-transition.sh", () => {
    test.each(MALICIOUS_IDS)(
      "malicious session_id %j exits 0 with no files outside stage dir",
      async (badId) => {
        const r = await runHook("stage-transition.sh", {
          tool_name: "Skill",
          tool_input: { skill: "dp-spec:discover" },
          session_id: badId,
          cwd: tmpDir,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe("");
        const files = await listStageDir(tmpDir);
        expect(files).toEqual([]);
      },
    );
  });

  describe("session-cleanup.sh", () => {
    test.each(MALICIOUS_IDS)(
      "malicious session_id %j exits 0 with no files outside stage dir",
      async (badId) => {
        const r = await runHook("session-cleanup.sh", {
          session_id: badId,
          cwd: tmpDir,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe("");
        const files = await listStageDir(tmpDir);
        expect(files).toEqual([]);
      },
    );
  });

  describe("session-start.sh", () => {
    test.each(MALICIOUS_IDS)(
      "malicious session_id %j exits 0 with no files outside stage dir",
      async (badId) => {
        const r = await runHook("session-start.sh", {
          session_id: badId,
          cwd: tmpDir,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe("");
        const files = await listStageDir(tmpDir);
        expect(files).toEqual([]);
      },
    );
  });
});

// ─── Invalid/Nonexistent CWD Tests ──────────────────────────────────────────

describe("dp-spec invalid CWD fail-open", () => {
  test("intercept-skills.sh exits 0 with nonexistent CWD", async () => {
    const r = await runHook(HOOK, {
      tool_name: "Skill",
      tool_input: { skill: "dp-spec:discover" },
      session_id: "test-session",
      cwd: "/nonexistent/path",
    });
    expect(r.exitCode).toBe(0);
  });

  test("stage-transition.sh exits 0 with nonexistent CWD", async () => {
    const r = await runHook("stage-transition.sh", {
      tool_name: "Skill",
      tool_input: { skill: "dp-spec:discover" },
      session_id: "test-session",
      cwd: "/nonexistent/path",
    });
    expect(r.exitCode).toBe(0);
  });

  test("session-cleanup.sh exits 0 with nonexistent CWD", async () => {
    const r = await runHook("session-cleanup.sh", {
      session_id: "test-session",
      cwd: "/nonexistent/path",
    });
    expect(r.exitCode).toBe(0);
  });

  test("session-start.sh exits 0 with nonexistent CWD", async () => {
    const r = await runHook("session-start.sh", {
      session_id: "test-session",
      cwd: "/nonexistent/path",
    });
    expect(r.exitCode).toBe(0);
  });
});

// ─── Plan PostToolUse from complete stage ────────────────────────────────────

describe("dp-spec plan PostToolUse edge cases", () => {
  test("plan from complete stage is a no-op in PostToolUse", async () => {
    await seedStage(tmpDir, "test-session", "complete");
    await runHook("stage-transition.sh", skillInput("dp-spec:plan"));
    expect(await getStage(tmpDir, "test-session")).toBe("complete");
  });
});

// ─── jq-missing fail-open ──────────────────────────────────────────────────

describe("dp-spec jq-missing fail-open", () => {
  let jqFreePath: string;

  beforeEach(async () => {
    const { mkdtemp, symlink } = await import("node:fs/promises");
    jqFreePath = await mkdtemp(join(tmpdir(), "no-jq-"));
    const bashPath = "/bin/bash";
    await symlink(bashPath, join(jqFreePath, "bash"));
    for (const bin of ["cat", "dirname", "basename", "tr", "grep", "tail", "mkdir"]) {
      try {
        const { execFileSync } = await import("node:child_process");
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
    "intercept-skills.sh",
    "stage-transition.sh",
    "research-validator.sh",
    "session-cleanup.sh",
  ])("%s exits 0 with empty stdout and null json when jq is missing", async (hook) => {
    const r = await runHookWithoutJq(hook, {
      tool_name: "Skill",
      tool_input: { skill: "dp-spec:discover" },
      session_id: "test-session",
      cwd: tmpDir,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.json).toBeNull();
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
