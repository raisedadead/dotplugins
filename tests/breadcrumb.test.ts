import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createTmpDir, removeTmpDir, runShell, HOOK_DIR } from "./helpers";

const LIB_STAGE = `${HOOK_DIR}/lib-stage.sh`;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("read_breadcrumb", () => {
  test("returns JSON when file exists", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = join(tmpDir, ".claude", "dp-cto");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "active.json"),
      JSON.stringify({ session_id: "sess-1", stage: "executing", plan_path: "/p.md", cwd: "/cwd" }),
    );
    const r = await runShell(`
      export CWD="${tmpDir}"
      source "${LIB_STAGE}" && read_breadcrumb
    `);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.session_id).toBe("sess-1");
    expect(data.stage).toBe("executing");
  });

  test("returns empty string when file missing", async () => {
    const r = await runShell(`
      export CWD="${tmpDir}"
      source "${LIB_STAGE}" && read_breadcrumb
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("returns empty string on corrupt JSON", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = join(tmpDir, ".claude", "dp-cto");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "active.json"), "NOT{VALID");
    const r = await runShell(`
      export CWD="${tmpDir}"
      source "${LIB_STAGE}" && read_breadcrumb
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("write_stage", () => {
  test("called twice preserves started_at and accumulates history", async () => {
    await runShell(`
      export CWD="${tmpDir}"
      source "${LIB_STAGE}" && write_stage "sess-1" "planning" "/a.md"
    `);
    const { readFile } = await import("node:fs/promises");
    const first = JSON.parse(
      await readFile(join(tmpDir, ".claude", "dp-cto", "sess-1.stage.json"), "utf-8"),
    );
    expect(first.started_at).toBeTruthy();
    expect(first.history).toEqual(["planning"]);

    await runShell(`
      export CWD="${tmpDir}"
      source "${LIB_STAGE}" && write_stage "sess-1" "planned" ""
    `);
    const second = JSON.parse(
      await readFile(join(tmpDir, ".claude", "dp-cto", "sess-1.stage.json"), "utf-8"),
    );
    expect(second.started_at).toBe(first.started_at);
    expect(second.history).toEqual(["planning", "planned"]);
  });
});
