import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HOOK_DIR = join(__dirname, "..", "plugins", "dp-cto", "hooks");

export interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json: Record<string, unknown> | null;
}

export function runHook(
  script: string,
  input: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<HookResult> {
  return new Promise((resolve) => {
    const proc = spawn("bash", [join(HOOK_DIR, script)], {
      stdio: ["pipe", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : undefined,
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

export function runShell(
  script: string,
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.stdin.end();
    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });
  });
}

export async function createTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dp-cto-test-"));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function seedStage(
  tmpDir: string,
  sessionId: string,
  stage: string,
  planPath = "",
): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-cto");
  await mkdir(dir, { recursive: true });
  const data = {
    stage,
    plan_path: planPath,
    started_at: "2026-01-01T00:00:00Z",
    history: [stage],
  };
  await writeFile(join(dir, `${sessionId}.stage.json`), JSON.stringify(data));
}

export async function getStage(tmpDir: string, sessionId: string): Promise<string> {
  try {
    const raw = await readFile(
      join(tmpDir, ".claude", "dp-cto", `${sessionId}.stage.json`),
      "utf-8",
    );
    const data = JSON.parse(raw);
    return data.stage ?? "idle";
  } catch {
    return "idle";
  }
}

export async function listStageDir(tmpDir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  try {
    return await readdir(join(tmpDir, ".claude", "dp-cto"));
  } catch {
    return [];
  }
}

export async function seedBreadcrumb(
  tmpDir: string,
  sessionId: string,
  stage: string,
  planPath = "",
): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-cto");
  await mkdir(dir, { recursive: true });
  const data = { session_id: sessionId, stage, plan_path: planPath, cwd: tmpDir };
  await writeFile(join(dir, "active.json"), JSON.stringify(data));
}

// ─── Cache-based state helpers (v4.0 lib-state.sh) ──────────────────────────

export async function seedCache(tmpDir: string, stage: string, activeEpic = ""): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-cto");
  await mkdir(dir, { recursive: true });
  const data = {
    active_epic: activeEpic,
    stage,
    sprint: "",
    suspended: [],
    synced_at: "2026-01-01T00:00:00Z",
  };
  await writeFile(join(dir, "cache.json"), JSON.stringify(data));
}

export async function seedCorruptCache(tmpDir: string): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-cto");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "cache.json"), "NOT VALID JSON{{{");
}

export async function getCacheStage(tmpDir: string): Promise<string> {
  try {
    const raw = await readFile(join(tmpDir, ".claude", "dp-cto", "cache.json"), "utf-8");
    const data = JSON.parse(raw);
    return data.stage ?? "idle";
  } catch {
    return "idle";
  }
}

export async function seedBeadsDir(tmpDir: string): Promise<void> {
  await mkdir(join(tmpDir, ".beads"), { recursive: true });
}

export async function createMockBd(tmpDir: string): Promise<string> {
  const binDir = join(tmpDir, ".mock-bin");
  await mkdir(binDir, { recursive: true });
  const script = `#!/bin/bash
case "$1" in
  query) echo "[]" ;;
  prime) echo "" ;;
  set-state) exit 0 ;;
  show) echo "{}" ;;
  *) exit 1 ;;
esac`;
  const bdPath = join(binDir, "bd");
  await writeFile(bdPath, script, { mode: 0o755 });
  return `${binDir}:${process.env.PATH}`;
}

export async function createNoBdPath(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  const { mkdtemp, symlink } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "no-bd-"));
  const bins = [
    "bash",
    "jq",
    "cat",
    "dirname",
    "basename",
    "tr",
    "grep",
    "tail",
    "mkdir",
    "chmod",
    "mktemp",
    "mv",
    "rm",
    "date",
    "sed",
    "head",
    "printf",
  ];
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
