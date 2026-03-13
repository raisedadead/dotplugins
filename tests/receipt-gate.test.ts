import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHook, runShell, HOOK_DIR } from "./helpers";

const HOOK = "completion-gate.sh";

function agentInput(toolResponse: string) {
  return {
    tool_name: "Agent",
    tool_response: toolResponse,
  };
}

function nonAgentInput(toolResponse: string) {
  return {
    tool_name: "Bash",
    tool_response: toolResponse,
  };
}

function makeReceipt(overrides?: {
  task?: string;
  status?: string;
  verifyCmd?: string;
  exitCode?: string;
  acceptance?: string;
  omit?: string[];
}) {
  const fields: Record<string, string> = {
    Task: overrides?.task ?? "Implement feature X",
    Status: overrides?.status ?? "PASS",
    "Verification Command": overrides?.verifyCmd ?? "pnpm test",
    "Exit Code": overrides?.exitCode ?? "0",
    "Acceptance Criteria Met": overrides?.acceptance ?? "YES",
  };

  const omit = overrides?.omit ?? [];
  const lines = ["## Completion Receipt"];
  for (const [key, value] of Object.entries(fields)) {
    if (!omit.includes(key)) {
      lines.push(`- **${key}**: ${value}`);
    }
  }
  return lines.join("\n");
}

// ─── Receipt-Based Detection (Primary Path) ─────────────────────────────────

describe("completion-gate.sh — receipt-based detection", () => {
  test("valid receipt with PASS status exits silently", async () => {
    const receipt = makeReceipt();
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("valid receipt with FAIL status injects warning", async () => {
    const receipt = makeReceipt({ status: "FAIL" });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/Status=fail/i);
  });

  test("receipt with non-zero exit code injects warning", async () => {
    const receipt = makeReceipt({ exitCode: "1" });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/Exit Code=1/);
  });

  test("receipt with Acceptance=NO injects warning", async () => {
    const receipt = makeReceipt({ acceptance: "NO" });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/Acceptance Criteria Met=no/i);
  });

  test("receipt with missing Verification Command field injects warning naming the field", async () => {
    const receipt = makeReceipt({ omit: ["Verification Command"] });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/missing required fields/i);
    expect(ctx).toMatch(/Verification Command/);
  });

  test("receipt with multiple missing fields lists all missing", async () => {
    const receipt = makeReceipt({ omit: ["Task", "Exit Code"] });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/Task/);
    expect(ctx).toMatch(/Exit Code/);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("completion-gate.sh — edge cases", () => {
  test("empty tool_response exits silently", async () => {
    const r = await runHook(HOOK, agentInput(""));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("receipt followed by another section ignores trailing content", async () => {
    const receipt = makeReceipt() + "\n## Another Section\n- **Status**: FAIL";
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("receipt with multiple failing fields lists all issues", async () => {
    const receipt = makeReceipt({ status: "FAIL", exitCode: "1", acceptance: "NO" });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/Status=fail/i);
    expect(ctx).toMatch(/Exit Code=1/);
    expect(ctx).toMatch(/Acceptance Criteria Met=no/i);
  });

  test("receipt with all five required fields missing", async () => {
    const receipt = makeReceipt({
      omit: ["Task", "Status", "Verification Command", "Exit Code", "Acceptance Criteria Met"],
    });
    const r = await runHook(HOOK, agentInput(receipt));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/missing required fields/i);
    expect(ctx).toMatch(/Task/);
    expect(ctx).toMatch(/Status/);
    expect(ctx).toMatch(/Verification Command/);
    expect(ctx).toMatch(/Exit Code/);
    expect(ctx).toMatch(/Acceptance Criteria Met/);
  });

  test("malformed JSON input exits silently", async () => {
    const hookPath = join(HOOK_DIR, HOOK);
    const r = await runShell(`echo 'NOT VALID JSON{{{' | bash "${hookPath}"`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

// ─── Missing jq (fail open) ────────────────────────────────────────────────

describe("completion-gate.sh — missing jq", () => {
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

    const receipt = makeReceipt({ status: "FAIL" });
    const r = await runHook(HOOK, agentInput(receipt), { PATH: emptyBin });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

// ─── Regex Claim Detection (Fallback / Backward Compat) ─────────────────────

describe("completion-gate.sh — claim detection fallback", () => {
  test("claim without evidence injects warning", async () => {
    const response = "The task is complete. Everything has been implemented as requested.";
    const r = await runHook(HOOK, agentInput(response));
    expect(r.exitCode).toBe(0);
    expect(r.json).not.toBeNull();
    const ctx = (r.json?.hookSpecificOutput as Record<string, unknown>)
      ?.additionalContext as string;
    expect(ctx).toMatch(/without test evidence/i);
  });

  test("claim with evidence exits silently", async () => {
    const response =
      "All tests pass. Here is the output:\n\n34 passed | 0 failed\nTest suites: 5 passed";
    const r = await runHook(HOOK, agentInput(response));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("no claim, no receipt exits silently", async () => {
    const response = "I have updated the configuration file with the new settings.";
    const r = await runHook(HOOK, agentInput(response));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

// ─── Non-Agent Tool ─────────────────────────────────────────────────────────

describe("completion-gate.sh — non-Agent tool", () => {
  test("non-Agent tool_name exits silently", async () => {
    const r = await runHook(HOOK, nonAgentInput("all tests pass, implementation complete"));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});
