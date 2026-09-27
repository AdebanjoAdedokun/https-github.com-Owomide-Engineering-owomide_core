import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  path.resolve(dirname, "../../../dist_unit/tests/unit/routing.test.js"),
];

process.argv = [
  process.argv[0],
  process.argv[1],
  "run",
  "--environment",
  "node",
  ...tests,
];

await import("vitest/vitest.mjs");
