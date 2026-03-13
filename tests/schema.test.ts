import { describe, test, expect, beforeAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const MARKETPLACE_JSON = join(REPO_ROOT, ".claude-plugin", "marketplace.json");
const PLUGIN_JSON = join(REPO_ROOT, "plugins", "dp-cto", ".claude-plugin", "plugin.json");
const HOOKS_JSON = join(REPO_ROOT, "plugins", "dp-cto", "hooks", "hooks.json");
const PLUGIN_ROOT = join(REPO_ROOT, "plugins", "dp-cto");
const SKILLS_ROOT = join(PLUGIN_ROOT, "skills");
const SNAPSHOT_DIR = join(__dirname, "snapshots");

const VALID_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "TeammateIdle",
  "TaskCompleted",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "SessionEnd",
];

const VALID_HANDLER_TYPES = ["command", "prompt", "agent"];

// ─── marketplace.json ───────────────────────────────────────────────────────

describe("marketplace.json", () => {
  let data: Record<string, unknown>;

  beforeAll(async () => {
    data = JSON.parse(await readFile(MARKETPLACE_JSON, "utf-8"));
  });

  test("name is a string", () => {
    expect(data.name).toBeTypeOf("string");
  });

  test("owner is an object with name", () => {
    expect(data.owner).toBeTypeOf("object");
    expect((data.owner as Record<string, unknown>).name).toBeTypeOf("string");
  });

  test("plugins is an array", () => {
    expect(data.plugins).toBeInstanceOf(Array);
  });

  test("each plugin has name and source", () => {
    for (const plugin of data.plugins as Record<string, unknown>[]) {
      expect(plugin.name).toBeTypeOf("string");
      expect(plugin.source).toBeTypeOf("string");
    }
  });

  test("optional fields have correct types when present", () => {
    if ("version" in data) expect(data.version).toBeTypeOf("string");
    if ("description" in data) expect(data.description).toBeTypeOf("string");
  });
});

// ─── plugin.json ────────────────────────────────────────────────────────────

describe("plugin.json", () => {
  let data: Record<string, unknown>;

  beforeAll(async () => {
    data = JSON.parse(await readFile(PLUGIN_JSON, "utf-8"));
  });

  test("name is a string", () => {
    expect(data.name).toBeTypeOf("string");
  });

  test("optional fields have correct types when present", () => {
    if ("version" in data) expect(data.version).toBeTypeOf("string");
    if ("description" in data) expect(data.description).toBeTypeOf("string");
    if ("author" in data) expect(data.author).toBeTypeOf("object");
    if ("repository" in data) expect(data.repository).toBeTypeOf("string");
    if ("keywords" in data) expect(data.keywords).toBeInstanceOf(Array);
  });
});

// ─── Version Sync ───────────────────────────────────────────────────────────

describe("Version sync", () => {
  test("marketplace.json metadata, marketplace.json plugins array, and plugin.json versions match", async () => {
    const marketplace = JSON.parse(await readFile(MARKETPLACE_JSON, "utf-8"));
    const plugin = JSON.parse(await readFile(PLUGIN_JSON, "utf-8"));

    const metadataVersion = (marketplace.metadata as Record<string, unknown>).version;
    const pluginsArrayVersion = (marketplace.plugins as Record<string, unknown>[])[0].version;
    const pluginJsonVersion = plugin.version;

    expect(metadataVersion).toBeTypeOf("string");
    expect(pluginsArrayVersion).toBe(metadataVersion);
    expect(pluginJsonVersion).toBe(metadataVersion);
  });
});

// ─── hooks.json ─────────────────────────────────────────────────────────────

describe("hooks.json", () => {
  let data: Record<string, unknown>;
  let hooks: Record<string, unknown[]>;

  beforeAll(async () => {
    data = JSON.parse(await readFile(HOOKS_JSON, "utf-8"));
    hooks = data.hooks as Record<string, unknown[]>;
  });

  test("hooks is an object", () => {
    expect(data.hooks).toBeTypeOf("object");
    expect(data.hooks).not.toBeNull();
  });

  test("all event names are valid", () => {
    for (const event of Object.keys(hooks)) {
      expect(VALID_EVENTS).toContain(event);
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

// ─── Skill Frontmatter Validation ────────────────────────────────────────────

const EXPECTED_SKILLS = [
  "work-plan",
  "work-run",
  "work-run-loop",
  "work-stop-loop",
  "work-polish",
  "quality-fact-check",
  "quality-red-green-refactor",
  "quality-deep-debug",
  "quality-check-done",
  "quality-code-review",
  "quality-sweep-code",
  "ops-clean-slate",
  "ops-show-board",
  "ops-track-sprint",
  "work-park",
  "work-unpark",
];

describe("Skill frontmatter", () => {
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

  test.each(EXPECTED_SKILLS)("%s/SKILL.md exists with valid YAML frontmatter", async (skill) => {
    const skillMd = join(SKILLS_ROOT, skill, "SKILL.md");
    expect(existsSync(skillMd), `${skill}/SKILL.md should exist`).toBe(true);

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
});

// ─── Schema Snapshots & Drift Detection ─────────────────────────────────────

describe("Schema snapshots", () => {
  test("local snapshots exist", () => {
    expect(existsSync(join(SNAPSHOT_DIR, "marketplace.schema.json"))).toBe(true);
    expect(existsSync(join(SNAPSHOT_DIR, "plugin.schema.json"))).toBe(true);
    expect(existsSync(join(SNAPSHOT_DIR, "hooks.schema.json"))).toBe(true);
  });

  test("live schema drift detection", async () => {
    const url = "https://anthropic.com/claude-code/marketplace.schema.json";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return; // schema URL not yet published — informational only

      const live = await res.text();
      try {
        JSON.parse(live);
      } catch {
        return; // response is not JSON (e.g. HTML redirect)
      }

      const local = await readFile(join(SNAPSHOT_DIR, "marketplace.schema.json"), "utf-8");
      // Intentionally informational-only: soft-fail so CI is not broken by
      // upstream schema changes we haven't reviewed yet.
      if (live.trim() !== local.trim()) {
        console.warn(
          "WARNING: Local marketplace schema snapshot differs from live schema — review and update",
        );
      }
    } catch {
      // network unavailable — skip silently
    }
  });
});
