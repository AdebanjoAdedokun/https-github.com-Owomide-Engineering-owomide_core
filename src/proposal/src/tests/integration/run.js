import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/migration.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-crud.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-submit.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/outbox-relay.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-approve.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-publish.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-comments.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-override-request.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/proposal-override-approve.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/change-set-crud.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/build-scope.integration.test.js"
  ),
  path.resolve(
    dirname,
    "../../../dist_integration/tests/integration/preview-change-set.integration.test.js"
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
