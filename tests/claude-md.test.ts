import { describe, test, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_MD = join(__dirname, "..", "CLAUDE.md");

describe("CLAUDE.md documentation", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(CLAUDE_MD, "utf-8");
  });

  describe("plan-heavy dispatch", () => {
    test("documents beads-based agent prompt storage", () => {
      expect(content).toMatch(/bd create/);
      expect(content).toMatch(/bd edit.*--body/);
      expect(content).toMatch(/bd ready/);
      expect(content).toMatch(/bd show/);
    });

    test("documents execute as near-mechanical dispatcher", () => {
      expect(content).toMatch(/near-mechanical dispatcher/);
    });

    test("documents verbatim prompt passing to Agent calls", () => {
      expect(content).toMatch(/verbatim/);
    });
  });

  describe("session recovery", () => {
    test("has session recovery section", () => {
      expect(content).toMatch(/### Key design: session recovery/);
    });

    test("documents breadcrumb file path", () => {
      expect(content).toMatch(/\.claude\/dp-cto\/active\.json/);
    });

    test("documents breadcrumb lifecycle", () => {
      expect(content).toMatch(/planned/);
      expect(content).toMatch(/complete/);
    });

    test("documents SessionStart fast path and fallback scan", () => {
      expect(content).toMatch(/fast path/);
      expect(content).toMatch(/fallback/);
    });

    test("documents multiple orphaned files resolution", () => {
      expect(content).toMatch(/started_at/);
    });

    test("documents SessionEnd preserving stage files", () => {
      expect(content).toMatch(/ended.*status/i);
    });
  });

  describe("hands-off execution", () => {
    test("documents no confirmation pauses during execute", () => {
      expect(content).toMatch(/hands-off execution/i);
      expect(content).toMatch(/no commit checkpoints/i);
    });
  });

  describe("gotchas", () => {
    test("documents stage file preservation gotcha", () => {
      expect(content).toMatch(
        /Stage files are preserved on SessionEnd.*active\.json.*recovery breadcrumb/,
      );
    });
  });

  describe("prerequisites", () => {
    test("documents jq as required dependency", () => {
      expect(content).toMatch(/`jq`.*Yes.*runtime/);
    });

    test("documents bd CLI as optional with degradation", () => {
      expect(content).toMatch(/`bd`.*No.*optional/i);
    });

    test("documents fail-open behavior", () => {
      expect(content).toMatch(/fail open/i);
    });
  });

  describe("stage machine", () => {
    test("has stage machine section", () => {
      expect(content).toMatch(/### Key design: stage machine/);
    });

    test("documents all stages including planning transient", () => {
      expect(content).toMatch(/planning/);
      expect(content).toMatch(/planned/);
      expect(content).toMatch(/executing/);
      expect(content).toMatch(/polishing/);
      expect(content).toMatch(/complete/);
    });

    test("documents transient vs resting states", () => {
      expect(content).toMatch(/[Tt]ransient/);
      expect(content).toMatch(/[Rr]esting/);
    });
  });
});
