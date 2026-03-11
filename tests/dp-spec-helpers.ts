import { expect } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, readdir, rm, mkdtemp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HOOK_DIR = join(__dirname, "..", "plugins", "dp-spec", "hooks");

export interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json: Record<string, unknown> | null;
}

export function runHook(script: string, input: Record<string, unknown>): Promise<HookResult> {
  return new Promise((resolve) => {
    const proc = spawn("bash", [join(HOOK_DIR, script)], {
      stdio: ["pipe", "pipe", "pipe"],
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

export async function createTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dp-spec-test-"));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function seedStage(tmpDir: string, sessionId: string, stage: string): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-spec");
  await mkdir(dir, { recursive: true });
  const data = {
    stage,
    started_at: "2026-01-01T00:00:00Z",
    history: [stage],
  };
  await writeFile(join(dir, `${sessionId}.stage.json`), JSON.stringify(data));
}

export async function seedCorruptStage(tmpDir: string, sessionId: string): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-spec");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sessionId}.stage.json`), "NOT VALID JSON{{{");
}

export async function getStage(tmpDir: string, sessionId: string): Promise<string> {
  try {
    const raw = await readFile(
      join(tmpDir, ".claude", "dp-spec", `${sessionId}.stage.json`),
      "utf-8",
    );
    const data = JSON.parse(raw);
    return data.stage ?? "idle";
  } catch {
    return "idle";
  }
}

export async function getFullStage(
  tmpDir: string,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(
      join(tmpDir, ".claude", "dp-spec", `${sessionId}.stage.json`),
      "utf-8",
    );
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function listStageDir(tmpDir: string): Promise<string[]> {
  try {
    return await readdir(join(tmpDir, ".claude", "dp-spec"));
  } catch {
    return [];
  }
}

export async function getBreadcrumb(tmpDir: string): Promise<string> {
  try {
    const raw = await readFile(join(tmpDir, ".claude", "dp-spec", "active.json"), "utf-8");
    JSON.parse(raw);
    return raw;
  } catch {
    return "";
  }
}

export async function breadcrumbExists(tmpDir: string): Promise<boolean> {
  return existsSync(join(tmpDir, ".claude", "dp-spec", "active.json"));
}

export async function seedBreadcrumb(
  tmpDir: string,
  sessionId: string,
  stage: string,
): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-spec");
  await mkdir(dir, { recursive: true });
  const data = { session_id: sessionId, stage, cwd: tmpDir };
  await writeFile(join(dir, "active.json"), JSON.stringify(data));
}

export const VALID_EVENTS = [
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
  "PreCompact",
  "SessionEnd",
];

export const VALID_HANDLER_TYPES = ["command", "prompt", "agent"];

export function expectAllowed(r: HookResult): void {
  expect(r.exitCode).toBe(0);
  const hso = r.json?.hookSpecificOutput as Record<string, unknown> | undefined;
  if (hso) {
    expect(hso.permissionDecision).not.toBe("deny");
  }
}

export function expectDenied(r: HookResult, reasonMatch?: RegExp): void {
  expect(r.exitCode).toBe(0);
  const hso = r.json?.hookSpecificOutput as Record<string, unknown> | undefined;
  expect(hso?.permissionDecision).toBe("deny");
  if (reasonMatch) {
    expect(hso?.permissionDecisionReason).toMatch(reasonMatch);
  }
}
