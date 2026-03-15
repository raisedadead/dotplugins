import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, mkdtemp, readdir } from "node:fs/promises";
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

export async function listStageDir(tmpDir: string): Promise<string[]> {
  try {
    return await readdir(join(tmpDir, ".claude", "dp-cto"));
  } catch {
    return [];
  }
}

export async function seedBeadsDir(tmpDir: string): Promise<void> {
  await mkdir(join(tmpDir, ".beads"), { recursive: true });
}

export async function createMockBd(tmpDir: string, overrides?: { list?: string }): Promise<string> {
  const binDir = join(tmpDir, ".mock-bin");
  await mkdir(binDir, { recursive: true });
  const listResponse = overrides?.list ?? "[]";
  const script = [
    "#!/bin/bash",
    'case "$1" in',
    '  query) echo "[]" ;;',
    '  prime) echo "" ;;',
    "  set-state) exit 0 ;;",
    '  show) echo "{}" ;;',
    "  list) cat <<'LISTEOF'",
    listResponse,
    "LISTEOF",
    ";;",
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
  const bdPath = join(binDir, "bd");
  await writeFile(bdPath, script, { mode: 0o755 });
  return `${binDir}:${process.env.PATH}`;
}

export async function createMockBdForStage(
  tmpDir: string,
  stage: string,
  epicId = "epic-1",
): Promise<string> {
  const binDir = join(tmpDir, ".mock-bin");
  await mkdir(binDir, { recursive: true });
  const queryResponse =
    stage === "idle" ? "[]" : JSON.stringify([{ id: epicId, labels: [`dp-cto:${stage}`] }]);
  const script = [
    "#!/bin/bash",
    'case "$1" in',
    `  query) cat <<'QUERYEOF'`,
    queryResponse,
    "QUERYEOF",
    ";;",
    "  set-state) exit 0 ;;",
    '  show) echo "{}" ;;',
    '  list) echo "[]" ;;',
    '  prime) echo "" ;;',
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
  const bdPath = join(binDir, "bd");
  await writeFile(bdPath, script, { mode: 0o755 });
  return `${binDir}:${process.env.PATH}`;
}

export async function createMockBdWithLog(
  tmpDir: string,
  stage: string,
  epicId = "epic-1",
): Promise<{ path: string; logFile: string }> {
  const binDir = join(tmpDir, ".mock-bin");
  await mkdir(binDir, { recursive: true });
  const logFile = join(tmpDir, "bd-calls.log");
  const queryResponse =
    stage === "idle" ? "[]" : JSON.stringify([{ id: epicId, labels: [`dp-cto:${stage}`] }]);
  const script = [
    "#!/bin/bash",
    `echo "$@" >> "${logFile}"`,
    'case "$1" in',
    `  query) cat <<'QUERYEOF'`,
    queryResponse,
    "QUERYEOF",
    ";;",
    "  set-state) exit 0 ;;",
    '  show) echo "{}" ;;',
    '  list) echo "[]" ;;',
    '  prime) echo "" ;;',
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
  const bdPath = join(binDir, "bd");
  await writeFile(bdPath, script, { mode: 0o755 });
  return { path: `${binDir}:${process.env.PATH}`, logFile };
}

export async function createMockBdWithResponses(
  tmpDir: string,
  responses: {
    query?: string;
    queryExecutingPolishing?: string;
    list?: string;
    prime?: string;
  },
): Promise<string> {
  const binDir = join(tmpDir, ".mock-bin");
  await mkdir(binDir, { recursive: true });
  const queryResp = responses.query ?? "[]";
  const queryExecPolishResp = responses.queryExecutingPolishing ?? queryResp;
  const listResp = responses.list ?? "[]";
  const primeResp = responses.prime ?? "";
  const script = [
    "#!/bin/bash",
    'case "$1" in',
    "  query)",
    '    if echo "$*" | grep -q "executing"; then',
    `      cat <<'EXECQUERYEOF'`,
    queryExecPolishResp,
    "EXECQUERYEOF",
    "    else",
    `      cat <<'QUERYEOF'`,
    queryResp,
    "QUERYEOF",
    "    fi",
    "    ;;",
    `  prime) cat <<'PRIMEEOF'`,
    primeResp,
    "PRIMEEOF",
    ";;",
    "  set-state) exit 0 ;;",
    '  show) echo "{}" ;;',
    `  list) cat <<'LISTEOF'`,
    listResp,
    "LISTEOF",
    ";;",
    "  *) exit 1 ;;",
    "esac",
  ].join("\n");
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
