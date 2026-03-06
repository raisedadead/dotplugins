import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTmpDir, removeTmpDir, getBreadcrumb, breadcrumbExists } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_STAGE = join(__dirname, "..", "plugins", "dp-cto", "hooks", "lib-stage.sh");

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

function runShell(script: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bash", ["-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CWD: tmpDir },
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

describe("write_breadcrumb", () => {
  test("creates active.json with correct fields", async () => {
    const r = await runShell(
      `source "${LIB_STAGE}" && write_breadcrumb "sess-1" "executing" "/plans/foo.md" "/home/user/project"`,
    );
    expect(r.exitCode).toBe(0);
    const raw = await getBreadcrumb(tmpDir);
    expect(raw).not.toBe("");
    const data = JSON.parse(raw);
    expect(data.session_id).toBe("sess-1");
    expect(data.stage).toBe("executing");
    expect(data.plan_path).toBe("/plans/foo.md");
    expect(data.cwd).toBe("/home/user/project");
  });

  test("overwrites existing breadcrumb", async () => {
    await runShell(`source "${LIB_STAGE}" && write_breadcrumb "sess-1" "planning" "/a.md" "/tmp"`);
    await runShell(
      `source "${LIB_STAGE}" && write_breadcrumb "sess-2" "executing" "/b.md" "/home"`,
    );
    const data = JSON.parse(await getBreadcrumb(tmpDir));
    expect(data.session_id).toBe("sess-2");
    expect(data.stage).toBe("executing");
  });

  test("produces valid JSON via jq", async () => {
    const r = await runShell(
      `source "${LIB_STAGE}" && write_breadcrumb "s" "idle" "" "" && jq . "$(stage_dir)/active.json"`,
    );
    const r2 = await runShell(
      `source "${LIB_STAGE}" && write_breadcrumb "s" "idle" "" "" && cat "$(CWD="${tmpDir}" bash -c 'source "${LIB_STAGE}" && stage_dir')/active.json" | jq .`,
    );
    expect(r2.exitCode).toBe(0);
  });
});

describe("read_breadcrumb", () => {
  test("returns JSON when file exists", async () => {
    await runShell(`source "${LIB_STAGE}" && write_breadcrumb "sess-1" "executing" "/p.md" "/cwd"`);
    const r = await runShell(`source "${LIB_STAGE}" && read_breadcrumb`);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.session_id).toBe("sess-1");
    expect(data.stage).toBe("executing");
  });

  test("returns empty string when file missing", async () => {
    const r = await runShell(`source "${LIB_STAGE}" && read_breadcrumb`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("returns empty string on corrupt JSON", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = join(tmpDir, ".claude", "dp-cto");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "active.json"), "NOT{VALID");
    const r = await runShell(`source "${LIB_STAGE}" && read_breadcrumb`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("clear_breadcrumb", () => {
  test("removes active.json", async () => {
    await runShell(`source "${LIB_STAGE}" && write_breadcrumb "sess-1" "executing" "/p.md" "/cwd"`);
    expect(await breadcrumbExists(tmpDir)).toBe(true);
    const r = await runShell(`source "${LIB_STAGE}" && clear_breadcrumb`);
    expect(r.exitCode).toBe(0);
    expect(await breadcrumbExists(tmpDir)).toBe(false);
  });

  test("succeeds when file already missing", async () => {
    const r = await runShell(`source "${LIB_STAGE}" && clear_breadcrumb`);
    expect(r.exitCode).toBe(0);
  });
});
