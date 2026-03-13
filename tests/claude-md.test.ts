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

  describe("project description", () => {
    test("identifies as plugin marketplace monorepo", () => {
      expect(content).toMatch(/plugin marketplace/i);
      expect(content).toMatch(/monorepo/);
    });

    test("identifies dp-cto as the single plugin", () => {
      expect(content).toMatch(/dp-cto/);
    });

    test("documents fail-open hook behavior", () => {
      expect(content).toMatch(/fail open/i);
    });

    test("documents no build step", () => {
      expect(content).toMatch(/[Nn]o build step/);
    });
  });

  describe("commands", () => {
    test("documents test command", () => {
      expect(content).toMatch(/pnpm test/);
    });

    test("documents lint command", () => {
      expect(content).toMatch(/pnpm run lint/);
    });

    test("documents format check command", () => {
      expect(content).toMatch(/pnpm run fmt:check/);
    });

    test("documents validate command", () => {
      expect(content).toMatch(/pnpm run validate/);
    });

    test("documents release command", () => {
      expect(content).toMatch(/pnpm run release/);
    });
  });

  describe("versioning", () => {
    test("documents three version locations", () => {
      expect(content).toMatch(/marketplace\.json/);
      expect(content).toMatch(/plugin\.json/);
    });

    test("warns against manual version editing", () => {
      expect(content).toMatch(/[Nn]ever edit versions manually/);
    });
  });

  describe("gotchas", () => {
    test("documents category restriction", () => {
      expect(content).toMatch(/category.*marketplace\.json/);
    });

    test("documents release confirmation prompt", () => {
      expect(content).toMatch(/prompts for confirmation/);
    });

    test("documents shellcheck requirement", () => {
      expect(content).toMatch(/shellcheck/);
    });
  });

  describe("installation", () => {
    test("documents marketplace add command", () => {
      expect(content).toMatch(/claude plugin marketplace add/);
    });

    test("documents plugin install command", () => {
      expect(content).toMatch(/claude plugin install dp-cto/);
    });
  });

  describe("prerequisites", () => {
    test("documents bd setup claude requirement", () => {
      expect(content).toMatch(/bd setup claude/);
    });
  });
});
