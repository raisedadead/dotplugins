import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HOOK_DIR = join(__dirname, "..", "plugins", "dp-cto", "hooks");
export const REPO_ROOT = join(__dirname, "..");

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

export async function seedCorruptStage(tmpDir: string, sessionId: string): Promise<void> {
  const dir = join(tmpDir, ".claude", "dp-cto");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sessionId}.stage.json`), "NOT VALID JSON{{{");
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

export async function getPlanPath(tmpDir: string, sessionId: string): Promise<string> {
  try {
    const raw = await readFile(
      join(tmpDir, ".claude", "dp-cto", `${sessionId}.stage.json`),
      "utf-8",
    );
    const data = JSON.parse(raw);
    return data.plan_path ?? "";
  } catch {
    return "";
  }
}

export async function getBreadcrumb(tmpDir: string): Promise<string> {
  try {
    const raw = await readFile(join(tmpDir, ".claude", "dp-cto", "active.json"), "utf-8");
    JSON.parse(raw);
    return raw;
  } catch {
    return "";
  }
}

export async function breadcrumbExists(tmpDir: string): Promise<boolean> {
  const { existsSync } = await import("node:fs");
  return existsSync(join(tmpDir, ".claude", "dp-cto", "active.json"));
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

export async function seedIndex(tmpDir: string, planPath: string): Promise<void> {
  const dir = join(tmpDir, ".claude", "plans");
  await mkdir(dir, { recursive: true });
  const content = `# Plan Index

| #  | Phase | Path | Status |
|----|-------|------|--------|
| 02  | [Implementation](${planPath}) | Implementation | Awaiting execution |
`;
  await writeFile(join(dir, "_index.md"), content);
}
