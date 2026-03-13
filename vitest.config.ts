import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.claude/worktrees/**"],
    testTimeout: 10_000,
  },
});
