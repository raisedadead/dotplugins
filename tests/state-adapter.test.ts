import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createTmpDir,
  removeTmpDir,
  seedCache,
  seedCorruptCache,
  createMockBd,
  createNoBdPath,
  runShell,
  HOOK_DIR,
} from "./helpers";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

async function readCacheRaw(dir: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(dir, ".claude", "dp-cto", "cache.json"), "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── read_cache ─────────────────────────────────────────────────────────────

describe("lib-state.sh read_cache", () => {
  test("no file returns default JSON", async () => {
    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      read_cache
    `;
    const r = await runShell(script);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.active_epic).toBe("");
    expect(parsed.stage).toBe("idle");
    expect(parsed.sprint).toBe("");
    expect(parsed.suspended).toEqual([]);
    expect(parsed.synced_at).toBe("");
  });

  test("valid file returns contents", async () => {
    await seedCache(tmpDir, "executing", "epic-42");
    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      read_cache
    `;
    const r = await runShell(script);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.stage).toBe("executing");
    expect(parsed.active_epic).toBe("epic-42");
  });

  test("corrupt file returns default JSON", async () => {
    await seedCorruptCache(tmpDir);
    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      read_cache
    `;
    const r = await runShell(script);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.stage).toBe("idle");
    expect(parsed.active_epic).toBe("");
  });
});

// ─── write_cache ────────────────────────────────────────────────────────────

describe("lib-state.sh write_cache", () => {
  test("writes valid JSON atomically", async () => {
    const payload = JSON.stringify({
      active_epic: "ep-1",
      stage: "planned",
      sprint: "",
      suspended: [],
      synced_at: "2026-01-01T00:00:00Z",
    });
    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      write_cache '${payload}'
    `;
    const r = await runShell(script);
    expect(r.exitCode).toBe(0);

    const written = await readCacheRaw(tmpDir);
    expect(written).not.toBeNull();
    expect(written!.stage).toBe("planned");
    expect(written!.active_epic).toBe("ep-1");
  });

  test("rejects invalid JSON (returns 1)", async () => {
    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      write_cache 'NOT VALID JSON{{{'
    `;
    const r = await runShell(script);
    expect(r.exitCode).toBe(1);

    const written = await readCacheRaw(tmpDir);
    expect(written).toBeNull();
  });
});

// ─── suspend_state ──────────────────────────────────────────────────────────

describe("lib-state.sh suspend_state", () => {
  test("with mock bd: cache updated (epic cleared, added to suspended, stage idle)", async () => {
    const mockPath = await createMockBd(tmpDir);
    await seedCache(tmpDir, "executing", "epic-99");

    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      suspend_state "epic-99"
    `;
    const r = await runShell(script, { PATH: mockPath });
    expect(r.exitCode).toBe(0);

    const cache = await readCacheRaw(tmpDir);
    expect(cache).not.toBeNull();
    expect(cache!.active_epic).toBe("");
    expect(cache!.stage).toBe("idle");
    expect(cache!.suspended).toEqual(expect.arrayContaining(["epic-99"]));
  });

  test("suspend non-active epic: active_epic unchanged, epic added to suspended", async () => {
    const mockPath = await createMockBd(tmpDir);
    await seedCache(tmpDir, "executing", "epic-active");

    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      suspend_state "epic-other"
    `;
    const r = await runShell(script, { PATH: mockPath });
    expect(r.exitCode).toBe(0);

    const cache = await readCacheRaw(tmpDir);
    expect(cache).not.toBeNull();
    expect(cache!.active_epic).toBe("epic-active");
    expect(cache!.stage).toBe("executing");
    expect(cache!.suspended).toEqual(expect.arrayContaining(["epic-other"]));
  });
});

// ─── resume_state ───────────────────────────────────────────────────────────

describe("lib-state.sh resume_state", () => {
  test("with explicit prior_stage: epic restored, removed from suspended, stage set", async () => {
    const mockPath = await createMockBd(tmpDir);

    const dir = join(tmpDir, ".claude", "dp-cto");
    await mkdir(dir, { recursive: true });
    const cacheData = {
      active_epic: "",
      stage: "idle",
      sprint: "",
      suspended: ["epic-99"],
      synced_at: "2026-01-01T00:00:00Z",
    };
    await writeFile(join(dir, "cache.json"), JSON.stringify(cacheData));

    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      resume_state "epic-99" "executing"
    `;
    const r = await runShell(script, { PATH: mockPath });
    expect(r.exitCode).toBe(0);

    const cache = await readCacheRaw(tmpDir);
    expect(cache).not.toBeNull();
    expect(cache!.active_epic).toBe("epic-99");
    expect(cache!.stage).toBe("executing");
    expect(cache!.suspended).not.toEqual(expect.arrayContaining(["epic-99"]));
  });

  test("without prior_stage: fallback to planned", async () => {
    const mockPath = await createMockBd(tmpDir);

    const dir = join(tmpDir, ".claude", "dp-cto");
    await mkdir(dir, { recursive: true });
    const cacheData = {
      active_epic: "",
      stage: "idle",
      sprint: "",
      suspended: ["epic-50"],
      synced_at: "2026-01-01T00:00:00Z",
    };
    await writeFile(join(dir, "cache.json"), JSON.stringify(cacheData));

    const script = `
      export CWD="${tmpDir}"
      source "${HOOK_DIR}/lib-state.sh"
      resume_state "epic-50"
    `;
    const r = await runShell(script, { PATH: mockPath });
    expect(r.exitCode).toBe(0);

    const cache = await readCacheRaw(tmpDir);
    expect(cache).not.toBeNull();
    expect(cache!.active_epic).toBe("epic-50");
    expect(cache!.stage).toBe("planned");
    expect(cache!.suspended).not.toEqual(expect.arrayContaining(["epic-50"]));
  });

  test("fails when bd is not available", async () => {
    const noBdDir = await createNoBdPath();

    try {
      await seedCache(tmpDir, "idle");

      const script = `
        export CWD="${tmpDir}"
        export PATH="${noBdDir}"
        source "${HOOK_DIR}/lib-state.sh"
        resume_state "epic-1" "planned"
      `;
      const r = await runShell(script, { PATH: noBdDir });
      expect(r.exitCode).toBe(1);
    } finally {
      await rm(noBdDir, { recursive: true, force: true });
    }
  });
});
