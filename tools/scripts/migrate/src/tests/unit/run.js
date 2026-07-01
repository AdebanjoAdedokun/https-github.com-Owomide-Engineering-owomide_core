const path = require("node:path");

const tests = [
  path.resolve(__dirname, "../../../dist_unit/tests/unit/manifest.test.js"),
  path.resolve(__dirname, "../../../dist_unit/tests/unit/sql-files.test.js"),
];

process.argv = [process.argv[0], process.argv[1], "run", "--environment", "node", ...tests];

import("vitest/vitest.mjs");
