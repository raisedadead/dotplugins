import { describe, test, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const HOOKS_JSON = join(REPO_ROOT, "plugins", "dp-cto", "hooks", "hooks.json");

interface HookEntry {
  type: string;
  prompt?: string;
  command?: string;
  statusMessage?: string;
}

interface MatcherEntry {
  matcher: string;
  hooks: HookEntry[];
}

interface HooksFile {
  hooks: Record<string, MatcherEntry[]>;
}

const REQUIRED_FIELDS = [
  "Task",
  "Status",
  "Verification Command",
  "Exit Code",
  "Acceptance Criteria Met",
];

describe("completion-gate prompt hook — structural validation", () => {
  let hooksData: HooksFile;
  let agentMatcher: MatcherEntry;
  let promptHook: HookEntry;

  beforeAll(async () => {
    hooksData = JSON.parse(await readFile(HOOKS_JSON, "utf-8")) as HooksFile;
    const postToolUse = hooksData.hooks.PostToolUse;
    agentMatcher = postToolUse.find((m) => m.matcher === "Agent")!;
    promptHook = agentMatcher.hooks[0];
  });

  test("PostToolUse has a matcher for Agent with type prompt", () => {
    expect(agentMatcher).toBeDefined();
    expect(agentMatcher.hooks).toBeInstanceOf(Array);
    expect(agentMatcher.hooks.length).toBeGreaterThan(0);
    expect(promptHook.type).toBe("prompt");
  });

  test("prompt text contains Completion Receipt reference", () => {
    expect(promptHook.prompt).toContain("Completion Receipt");
  });

  test("prompt text contains required fields reference", () => {
    expect(promptHook.prompt).toContain("required fields");
  });

  test("prompt text mentions all five required receipt fields", () => {
    for (const field of REQUIRED_FIELDS) {
      expect(promptHook.prompt, `prompt should mention "${field}"`).toContain(field);
    }
  });

  test("prompt hook has a statusMessage field", () => {
    expect(promptHook.statusMessage).toBeTypeOf("string");
    expect(promptHook.statusMessage!.length).toBeGreaterThan(0);
  });
});
