import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@owomide/proto": path.resolve(__dirname, "../lib/proto/gen/ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
  },
});
