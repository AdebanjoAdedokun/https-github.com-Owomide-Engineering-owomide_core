import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      // Bazel runfiles intentionally omit .git. dotenv is optional, so using the
      // test/runfiles working directory is safe when no checkout root is present.
      return process.env["BUILD_WORKSPACE_DIRECTORY"] ?? process.cwd();
    }
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
// No-op if .env is absent (CI/CD) — dotenv never throws on missing file
// and never overwrites vars already set in the environment.
config({ path: resolve(REPO_ROOT, ".env") });

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required env var: ${name}\n` +
        `For local dev, copy .env.example → .env and fill in values.\n` +
        `For CI/CD, set it as a pipeline secret.`,
    );
  }
  return val;
}

/** Derives the env var name for a role's password from the role name.
 *  catalog_svc → CATALOG_SVC_PASSWORD */
export function passwordEnvKey(role: string): string {
  return `${role.toUpperCase()}_PASSWORD`;
}
