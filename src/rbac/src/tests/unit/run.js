import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const dirname = path.dirname(fileURLToPath(import.meta.url));

// code-by-permission.test.ts is deliberately excluded from this Bazel-run
// list (still runs under `pnpm test:unit`). It imports the generated
// @owomide/proto rbac package, and under Bazel's sandboxed runfiles that
// package (built by //src/lib/proto:pkg, a bare js_library with no
// npm_link_all_packages of its own) has no path back to a linked
// @bufbuild/protobuf when resolving its own subpath imports (e.g.
// "@bufbuild/protobuf/codegenv2") at runtime — the symlink only exists
// under the *consuming* package's node_modules, which sits alongside, not
// above, the generated files in the runfiles tree. This is a pre-existing
// gap in src/lib/proto's Bazel packaging, not specific to this file; every
// other proto-generated file with an enum (e.g. catalog's SourceType) would
// hit the same thing the first time any *non-manual* unit test loaded it —
// it just never has been, since no existing unit test imports @owomide/proto
// directly. Needs a fix in src/lib/proto/BUILD.bazel, tracked separately.
const tests = [
  path.resolve(dirname, "../../../dist_unit/tests/unit/permissions.test.js"),
  path.resolve(dirname, "../../../dist_unit/tests/unit/system-role-templates.test.js"),
  path.resolve(dirname, "../../../dist_unit/tests/unit/support-access.test.js"),
];

process.argv = [process.argv[0], process.argv[1], "run", "--environment", "node", ...tests];

await import("vitest/vitest.mjs");
