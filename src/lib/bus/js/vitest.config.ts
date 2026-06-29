import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@owomide/proto": path.resolve(__dirname, "../../proto/gen/ts"),
    },
  },
});
