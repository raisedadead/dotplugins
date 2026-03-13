import { describe, test, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, symlink, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runHook, HOOK_DIR } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_JSON = join(__dirname, "..", "plugins", "dp-cto", "hooks", "hooks.json");
const PLUGIN_ROOT = join(__dirname, "..", "plugins", "dp-cto");

const HOOK = "skill-suggest.sh";

function promptInput(userMessage: string) {
  return {
    user_message: userMessage,
  };
}

// ─── Pattern Matching ────────────────────────────────────────────────────────

describe("skill-suggest.sh — pattern matching", () => {
  test("debug pattern suggests quality-deep-debug", async () => {
    const r = await runHook(HOOK, promptInput("I'm seeing an error in the build output"));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-cto:quality-deep-debug/);
  });

  test("plan pattern suggests work-plan", async () => {
    const r = await runHook(HOOK, promptInput("I need to implement a new feature"));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-cto:work-plan/);
  });

  test("review pattern suggests work-polish", async () => {
    const r = await runHook(HOOK, promptInput("can you review this code for me"));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-cto:work-polish/);
  });

  test("test pattern suggests quality-red-green-refactor", async () => {
    const r = await runHook(HOOK, promptInput("write a test for this function"));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-cto:quality-red-green-refactor/);
  });
});

// ─── No Match ────────────────────────────────────────────────────────────────

describe("skill-suggest.sh — no match", () => {
  test("unrelated message exits silently", async () => {
    const r = await runHook(HOOK, promptInput("hello how are you"));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("empty message exits silently", async () => {
    const r = await runHook(HOOK, promptInput(""));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

// ─── Already Invoking Skill ─────────────────────────────────────────────────

describe("skill-suggest.sh — already invoking skill", () => {
  test("message with /dp-cto: prefix exits silently", async () => {
    const r = await runHook(HOOK, promptInput("/dp-cto:work-run start the work"));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("message with /dp-cto:quality-deep-debug exits silently even with error keyword", async () => {
    const r = await runHook(HOOK, promptInput("/dp-cto:quality-deep-debug investigate this error"));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

// ─── Priority Ordering ──────────────────────────────────────────────────────

describe("skill-suggest.sh — priority ordering", () => {
  test("debug wins over plan when both keywords present (first match)", async () => {
    const r = await runHook(HOOK, promptInput("I need to debug this and plan the next feature"));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/dp-cto:quality-deep-debug/);
  });
});

// ─── Missing skill-rules.json (fail open) ───────────────────────────────────

describe("skill-suggest.sh — missing skill-rules.json", () => {
  test("exits 0 when skill-rules.json is missing", async () => {
    const rulesPath = join(HOOK_DIR, "skill-rules.json");
    const backupPath = join(HOOK_DIR, "skill-rules.json.bak");

    await rename(rulesPath, backupPath);
    try {
      const r = await runHook(HOOK, promptInput("debug this error please"));
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toBe("");
    } finally {
      await rename(backupPath, rulesPath);
    }
  });
});

// ─── Malformed / Invalid skill-rules.json (fail open) ───────────────────────

describe("skill-suggest.sh — malformed skill-rules.json", () => {
  test("exits 0 when skill-rules.json contains invalid JSON", async () => {
    const rulesPath = join(HOOK_DIR, "skill-rules.json");
    const backupPath = join(HOOK_DIR, "skill-rules.json.bak");

    await rename(rulesPath, backupPath);
    try {
      await writeFile(rulesPath, "NOT VALID JSON{{{");
      const r = await runHook(HOOK, promptInput("debug this error please"));
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toBe("");
    } finally {
      await rename(backupPath, rulesPath);
    }
  });
});

// ─── Rule with empty pattern ────────────────────────────────────────────────

describe("skill-suggest.sh — empty pattern rule", () => {
  test("rule with empty pattern is skipped, valid rule still matches", async () => {
    const rulesPath = join(HOOK_DIR, "skill-rules.json");
    const backupPath = join(HOOK_DIR, "skill-rules.json.bak");

    await rename(rulesPath, backupPath);
    try {
      const testRules = [
        {
          pattern: "",
          skill: "dp-cto:should-not-match",
          description: "Empty pattern rule",
        },
        {
          pattern: "debug|error",
          skill: "dp-cto:quality-deep-debug",
          description: "Structured root-cause debugging",
        },
      ];
      await writeFile(rulesPath, JSON.stringify(testRules));
      const r = await runHook(HOOK, promptInput("I see an error in the logs"));
      expect(r.exitCode).toBe(0);
      expect(r.json).not.toBeNull();
      const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
        ?.additionalContext as string;
      expect(ctx).toMatch(/dp-cto:quality-deep-debug/);
    } finally {
      await rename(backupPath, rulesPath);
    }
  });
});

// ─── Missing jq (fail open) ────────────────────────────────────────────────

describe("skill-suggest.sh — missing jq", () => {
  test("exits 0 when jq is not on PATH", async () => {
    const emptyBin = await mkdtemp(join(tmpdir(), "no-jq-"));
    const bins = [
      "bash",
      "cat",
      "grep",
      "dirname",
      "basename",
      "mkdir",
      "chmod",
      "date",
      "mktemp",
      "mv",
      "rm",
      "sed",
      "head",
      "printf",
      "tr",
      "tail",
    ];
    for (const bin of bins) {
      try {
        const realPath = execFileSync("which", [bin], { encoding: "utf-8" }).trim();
        if (realPath) await symlink(realPath, join(emptyBin, bin));
      } catch {
        /* skip */
      }
    }

    const r = await runHook(HOOK, promptInput("debug this error"), { PATH: emptyBin });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

// ─── hooks.json Validation ──────────────────────────────────────────────────

describe("hooks.json — new hook entries", () => {
  let data: Record<string, unknown>;
  let hooks: Record<string, unknown[]>;

  beforeAll(async () => {
    data = JSON.parse(await readFile(HOOKS_JSON, "utf-8"));
    hooks = data.hooks as Record<string, unknown[]>;
  });

  test("hooks.json is valid JSON", () => {
    expect(data).toBeTypeOf("object");
    expect(data).not.toBeNull();
  });

  test("contains UserPromptSubmit entry", () => {
    expect(hooks).toHaveProperty("UserPromptSubmit");
    expect(hooks.UserPromptSubmit).toBeInstanceOf(Array);
    expect(hooks.UserPromptSubmit.length).toBeGreaterThan(0);
  });

  test("all existing hook entries preserved (SessionStart, PreToolUse, PostToolUse)", () => {
    expect(hooks).toHaveProperty("SessionStart");
    expect(hooks).toHaveProperty("PreToolUse");
    expect(hooks).toHaveProperty("PostToolUse");
  });

  test("all referenced script paths use ${CLAUDE_PLUGIN_ROOT} prefix", () => {
    for (const matchers of Object.values(hooks)) {
      for (const matcher of matchers as Record<string, unknown>[]) {
        for (const hook of matcher.hooks as Record<string, unknown>[]) {
          if (hook.type === "command" && hook.command) {
            expect(
              (hook.command as string).startsWith("${CLAUDE_PLUGIN_ROOT}"),
              `${hook.command} should start with \${CLAUDE_PLUGIN_ROOT}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  test("all referenced scripts resolve to existing files", () => {
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
