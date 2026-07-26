import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/audit-log-schema.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/audit-subscriber.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/snapshot-repo.integration.test.js"
  ),
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

await import("vitest/vitest.mjs");
