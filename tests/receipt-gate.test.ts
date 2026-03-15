import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHook } from "./helpers";

const HOOK = "receipt-gate.sh";

function makeInput(subagentType: string, toolResponse: string) {
  return {
    hook_event_name: "PostToolUse",
    tool_name: "Agent",
    tool_input: {
      subagent_type: subagentType,
      prompt: "test prompt",
    },
    tool_response: toolResponse,
  };
}

const VALID_RECEIPT = [
  "Some agent output text.",
  "",
  "## Completion Receipt",
  "",
  "- **Task**: test-task",
  "- **Status**: PASS",
  "- **Verification Command**: pnpm test",
  "- **Exit Code**: 0",
  "- **Acceptance Criteria Met**: YES",
].join("\n");

const PARTIAL_RECEIPT = [
  "Some agent output text.",
  "",
  "## Completion Receipt",
  "",
  "- **Task**: test-task",
  "- **Status**: PASS",
].join("\n");

const NO_RECEIPT = "Some agent output without any receipt section.";

async function createNoJqPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "no-jq-"));
  const bins = ["bash", "cat", "grep", "printf", "echo"];
  for (const bin of bins) {
    try {
      const realPath = execFileSync("which", [bin], { encoding: "utf-8" }).trim();
      if (realPath) await symlink(realPath, join(dir, bin));
    } catch {
      /* skip if not found */
    }
  }
  return dir;
}

describe("receipt-gate.sh — agent type routing", () => {
  test("dp-cto:dp-cto-implementer triggers receipt check", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-implementer", NO_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.json?.systemMessage).toBeDefined();
  });

  test("dp-cto-implementer (without prefix) triggers receipt check", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto-implementer", NO_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.json?.systemMessage).toBeDefined();
  });

  test("dp-cto:dp-cto-validator passes through (exit 0, no output)", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-validator", NO_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("dp-cto:dp-cto-reviewer passes through (exit 0, no output)", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-reviewer", NO_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("no subagent_type passes through (exit 0, no output)", async () => {
    const r = await runHook(HOOK, {
      hook_event_name: "PostToolUse",
      tool_name: "Agent",
      tool_input: { prompt: "test prompt" },
      tool_response: NO_RECEIPT,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("receipt-gate.sh — receipt validation (implementer)", () => {
  test("valid receipt with all required fields exits cleanly", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-implementer", VALID_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("missing receipt section entirely emits systemMessage warning", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-implementer", NO_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    expect(r.json?.systemMessage).toMatch(/Receipt warning/);
    expect(r.json?.systemMessage).toMatch(/Completion Receipt/);
  });

  test("receipt present but missing fields emits systemMessage listing them", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-implementer", PARTIAL_RECEIPT));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const msg = r.json?.systemMessage as string;
    expect(msg).toMatch(/Receipt warning/);
    expect(msg).toMatch(/missing required fields/);
    expect(msg).toContain("Verification Command");
    expect(msg).toContain("Exit Code");
    expect(msg).toContain("Acceptance Criteria Met");
    expect(msg).not.toContain("Task");
    expect(msg).not.toContain("Status");
  });
});

describe("receipt-gate.sh — fail-open behavior", () => {
  let noJqDir: string;

  beforeEach(async () => {
    noJqDir = await createNoJqPath();
  });

  afterEach(async () => {
    await rm(noJqDir, { recursive: true, force: true });
  });

  test("no jq available exits 0 with no output", async () => {
    const r = await runHook(HOOK, makeInput("dp-cto:dp-cto-implementer", NO_RECEIPT), {
      PATH: noJqDir,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});
