import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/unit/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
