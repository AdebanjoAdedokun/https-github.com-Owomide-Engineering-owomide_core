const path = require("node:path");

const tests = [
  path.resolve(__dirname, "../../../dist_integration/tests/integration/migrate.integration.test.js"),
  path.resolve(__dirname, "../../../dist_integration/tests/integration/invariants.integration.test.js"),
];

process.argv = [
  process.argv[0],
  process.argv[1],
  "run",
  "--environment",
  "node",
  "--testTimeout",
  "120000",
  "--hookTimeout",
  "120000",
  ...tests,
];

import("vitest/vitest.mjs");
