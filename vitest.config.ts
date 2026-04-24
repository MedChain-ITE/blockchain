import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts"],
      thresholds: { branches: 70, functions: 70, lines: 70 },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: "forks",
  },
});
