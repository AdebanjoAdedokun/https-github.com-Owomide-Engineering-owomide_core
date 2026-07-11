import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  path.resolve(dirname, "../../../dist_unit/tests/unit/normalize.test.js"),
  path.resolve(dirname, "../../../dist_unit/tests/unit/pagination.test.js"),
  path.resolve(dirname, "../../../dist_unit/tests/unit/context.test.js"),
];

process.argv = [process.argv[0], process.argv[1], "run", "--environment", "node", ...tests];

await import("vitest/vitest.mjs");
