import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "generated"],
    globalSetup: ["tests/setup/global-setup.ts"],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
